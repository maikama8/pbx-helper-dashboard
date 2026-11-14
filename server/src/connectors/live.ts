import type { Config } from "../config.js";
import type { Cdr, CelEvent, Customer, Extension, LiveCall, QueueStat, Rate, Refill, Trunk } from "../domain/types.js";
import { AriClient } from "./ari/client.js";
import { reduceAmiBatch, emptyAmiState, type AmiState } from "./ami/reduce.js";
import { amiHangup, runAmi } from "./ami/run.js";
import { AmiSession } from "./ami/session.js";
import { connectAmiSocket, type ByteStream } from "./ami/tcp.js";
import { loadMysqlCdr } from "./cdr/mysql.js";
import { overlayExtensions, overlayTrunks } from "./merge.js";
import { FreePbxClient } from "./freepbx/client.js";
import { MagnusClient, type FetchLike } from "./magnus/client.js";
import type { AmiMessage } from "./ami/parser.js";
import type { ActionResult, TelephonyConnector } from "./types.js";

export interface LiveDeps {
  fetchImpl?: FetchLike;
  connect?: (host: string, port: number) => Promise<ByteStream>;
  magnus?: MagnusClient;
  freepbx?: FreePbxClient;
  ari?: AriClient;
  loadCdr?: typeof loadMysqlCdr;
}

export class LiveConnector implements TelephonyConnector {
  readonly source = "live" as const;
  private amiState: AmiState = emptyAmiState();
  private customers: Customer[] = [];
  private refills: Refill[] = [];
  private rates: Rate[] = [];
  private cdrs: Cdr[] = [];
  private cel: CelEvent[] = [];
  private catalogTrunks: Trunk[] = [];
  private catalogExtensions: Extension[] = [];
  private warningList: string[] = [];
  private rev = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly abort = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly magnus: MagnusClient | null;
  private readonly freepbx: FreePbxClient | null;
  private readonly ari: AriClient | null;
  private readonly loadCdr: typeof loadMysqlCdr;

  constructor(
    private readonly config: Config,
    deps: LiveDeps = {},
  ) {
    const fetchImpl = deps.fetchImpl ?? fetch;
    this.magnus = deps.magnus ?? (config.magnus ? new MagnusClient(config.magnus, fetchImpl) : null);
    this.freepbx = deps.freepbx ?? (config.freepbx ? new FreePbxClient(config.freepbx, fetchImpl) : null);
    this.ari = deps.ari ?? (config.ari ? new AriClient(config.ari, fetchImpl) : null);
    this.loadCdr = deps.loadCdr ?? loadMysqlCdr;
    this.connect = deps.connect ?? connectAmiSocket;
  }

  private readonly connect: (host: string, port: number) => Promise<ByteStream>;

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, 60_000);
    this.timer.unref?.();
    if (this.config.ami) {
      void runAmi({
        config: this.config.ami,
        signal: this.abort.signal,
        connect: this.connect,
        onBatch: (messages) => this.ingest(messages),
        onEvent: (message) => this.ingest([message]),
      });
    }
  }

  async stop(): Promise<void> {
    this.abort.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  now(): Date {
    return new Date();
  }

  revision(): number {
    return this.rev;
  }

  warnings(): string[] {
    return this.warningList;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCalls(): LiveCall[] {
    return this.amiState.calls;
  }

  getTrunks(): Trunk[] {
    return overlayTrunks(this.catalogTrunks, this.amiState.trunks);
  }

  getExtensions(): Extension[] {
    return overlayExtensions(this.catalogExtensions, this.amiState.extensions);
  }

  getQueues(): QueueStat[] {
    return this.amiState.queues;
  }

  getCustomers(): Customer[] {
    return [...this.customers].sort((a, b) => a.credit - b.credit);
  }

  getRefills(): Refill[] {
    return this.refills;
  }

  getRates(): Rate[] {
    return this.rates;
  }

  getCdrs(): Cdr[] {
    return this.cdrs;
  }

  getCel(): CelEvent[] {
    return this.cel;
  }

  async hangup(id: string): Promise<ActionResult<{ id: string }>> {
    const call = this.getCalls().find((row) => row.id === id);
    if (!call) return { ok: false, status: 404, message: "That call is no longer up." };
    const errors: string[] = [];
    if (this.ari) {
      try {
        await this.ari.hangup(call.id);
        this.dropCall(id);
        return { ok: true, value: { id } };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "ARI hangup failed");
      }
    }
    if (this.config.ami) {
      try {
        await this.hangupOnAmi(call.channel);
        this.dropCall(id);
        return { ok: true, value: { id } };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "AMI hangup failed");
      }
    }
    if (!this.ari && !this.config.ami) {
      return { ok: false, status: 409, message: "No AMI or ARI connection is configured for hangup." };
    }
    return { ok: false, status: 502, message: errors.join("; ") || "Hangup failed." };
  }

  async refill(id: string, amount: number, description: string, actor: string): Promise<ActionResult<Customer>> {
    if (!this.magnus) {
      return { ok: false, status: 409, message: "MagnusBilling is not configured." };
    }
    const existing = this.customers.find((row) => row.id === id);
    if (!existing) return { ok: false, status: 404, message: "No customer with that id." };
    try {
      await this.magnus.refill(id, amount, description);
    } catch (error) {
      return { ok: false, status: 502, message: error instanceof Error ? error.message : "Refill failed." };
    }
    const at = new Date().toISOString();
    this.refills = [{ id: `refill-${id}-${Date.now()}`, customerId: id, amount, description, at, by: actor }, ...this.refills];
    await this.refreshCustomers();
    const updated = this.customers.find((row) => row.id === id) ?? { ...existing, credit: existing.credit + amount, lastRefillAmount: amount, lastRefillAt: at };
    this.publish();
    return { ok: true, value: updated };
  }

  private dropCall(id: string): void {
    this.amiState = { ...this.amiState, calls: this.amiState.calls.filter((call) => call.id !== id) };
    this.publish();
  }

  private async hangupOnAmi(channel: string): Promise<void> {
    if (!this.config.ami) throw new Error("AMI is not configured");
    const stream = await this.connect(this.config.ami.host, this.config.ami.port);
    const session = new AmiSession((payload) => stream.write(payload));
    stream.onData((chunk) => session.push(chunk));
    try {
      const login = await session.request(
        { Action: "Login", Username: this.config.ami.username, Secret: this.config.ami.secret, Events: "off" },
        (message) => message.headers.Response === "Success" || message.headers.Response === "Error",
      );
      if (login.at(-1)?.headers.Response !== "Success") {
        throw new Error(login.at(-1)?.headers.Message || "AMI login failed");
      }
      await amiHangup(session, channel);
    } finally {
      stream.end();
    }
  }

  private ingest(messages: AmiMessage[]): void {
    const failed = messages.find((message) => message.headers.Event === "SpanConnectFailed");
    if (failed) {
      this.setWarning(`AMI: ${failed.headers.Message ?? "connection failed"}`);
      return;
    }
    this.clearWarning("AMI:");
    this.seedInventory();
    this.amiState = reduceAmiBatch(this.amiState, messages);
    this.publish();
  }

  private seedInventory(): void {
    if (this.catalogTrunks.length > 0) {
      const names = new Set(this.amiState.trunks.map((trunk) => trunk.name));
      const missing = this.catalogTrunks.filter((trunk) => !names.has(trunk.name));
      if (missing.length) this.amiState = { ...this.amiState, trunks: [...this.amiState.trunks, ...missing] };
    }
    if (this.catalogExtensions.length > 0) {
      const names = new Set(this.amiState.extensions.map((row) => row.extension));
      const missing = this.catalogExtensions.filter((row) => !names.has(row.extension));
      if (missing.length) this.amiState = { ...this.amiState, extensions: [...this.amiState.extensions, ...missing] };
    }
  }

  private async refresh(): Promise<void> {
    await Promise.all([this.refreshCustomers(), this.refreshInventory(), this.refreshCdr()]);
    this.publish();
  }

  private async refreshCustomers(): Promise<void> {
    if (!this.magnus) return;
    try {
      this.customers = await this.magnus.listCustomers();
      this.clearWarning("MagnusBilling customers:");
    } catch (error) {
      this.setWarning(`MagnusBilling customers: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  private async refreshInventory(): Promise<void> {
    const trunks: Trunk[] = [];
    const extensions: Extension[] = [];
    if (this.magnus) {
      try {
        trunks.push(...(await this.magnus.listTrunks()));
        const sip = await this.magnus.listSip();
        extensions.push(...sip);
        const counts = new Map<string, number>();
        for (const row of sip) {
          if (!row.account) continue;
          counts.set(row.account, (counts.get(row.account) ?? 0) + 1);
        }
        this.customers = this.customers.map((customer) => ({
          ...customer,
          sipUsers: counts.get(customer.username) ?? counts.get(customer.id) ?? customer.sipUsers,
        }));
        this.clearWarning("MagnusBilling inventory:");
      } catch (error) {
        this.setWarning(`MagnusBilling inventory: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
    if (this.freepbx) {
      try {
        extensions.push(...(await this.freepbx.listExtensions()));
        trunks.push(...(await this.freepbx.listTrunks()));
        this.clearWarning("FreePBX:");
      } catch (error) {
        this.setWarning(`FreePBX: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
    this.catalogTrunks = trunks;
    this.catalogExtensions = extensions;
  }

  private async refreshCdr(): Promise<void> {
    const extensionNumbers = this.catalogExtensions.map((row) => row.extension);
    if (this.magnus) {
      try {
        this.rates = await this.magnus.listRates();
        this.cdrs = await this.magnus.listCdr(this.rates, extensionNumbers);
        this.clearWarning("MagnusBilling CDR:");
      } catch (error) {
        this.setWarning(`MagnusBilling CDR: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
    if (this.config.cdrMysql) {
      try {
        const loaded = await this.loadCdr(this.config.cdrMysql, this.rates, extensionNumbers, this.catalogTrunks.map((t) => t.name));
        if (!this.magnus) this.cdrs = loaded.cdrs;
        this.cel = loaded.cel;
        this.clearWarning("CDR MySQL:");
      } catch (error) {
        this.setWarning(`CDR MySQL: ${error instanceof Error ? error.message : "query failed"}`);
      }
    }
  }

  private setWarning(text: string): void {
    const prefix = text.split(":")[0] + ":";
    this.warningList = [...this.warningList.filter((row) => !row.startsWith(prefix)), text];
  }

  private clearWarning(prefix: string): void {
    this.warningList = this.warningList.filter((row) => !row.startsWith(prefix));
  }

  private publish(): void {
    this.rev += 1;
    for (const listener of this.listeners) listener();
  }
}
