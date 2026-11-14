import crypto from "node:crypto";
import type { MagnusConfig } from "../../config.js";
import type { Cdr, Customer, Disposition, Extension, Rate, Trunk } from "../../domain/types.js";
import { priceCall } from "../../domain/rating.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** HMAC-SHA512 of the form body, hex. Matches MagnusBilling's `hash_hmac('sha512', $post, $secret)`. */
export function magnusSign(body: string, secret: string): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

export function formEncode(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, "+")}`)
    .join("&");
}

export interface MagnusRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export function buildMagnusRequest(
  config: Pick<MagnusConfig, "url" | "apiKey" | "apiSecret">,
  module: string,
  action: string,
  fields: Record<string, string>,
  nonce: string,
): MagnusRequest {
  const body = formEncode({ ...fields, nonce });
  return {
    url: `${config.url}/${module}/${action}`,
    body,
    headers: {
      Key: config.apiKey,
      Sign: magnusSign(body, config.apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
}

interface MagnusRow {
  [key: string]: unknown;
}

function asRows(payload: unknown): MagnusRow[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as MagnusRow[]) : [];
}

function text(row: MagnusRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value) !== "") return String(value);
  }
  return "";
}

function num(row: MagnusRow, ...keys: string[]): number {
  const value = Number(text(row, ...keys));
  return Number.isFinite(value) ? value : 0;
}

const CAUSE: Record<string, Disposition> = {
  "1": "ANSWERED",
  "2": "BUSY",
  "3": "NO ANSWER",
  "4": "FAILED",
  "5": "CONGESTION",
  "6": "FAILED",
  ANSWER: "ANSWERED",
  ANSWERED: "ANSWERED",
  BUSY: "BUSY",
  "NO ANSWER": "NO ANSWER",
  CANCEL: "FAILED",
  CONGESTION: "CONGESTION",
  FAILED: "FAILED",
};

function dispositionOf(row: MagnusRow, billsec: number): Disposition {
  const raw = text(row, "disposition", "terminatecauseid", "hangupcause").toUpperCase();
  if (CAUSE[raw]) return CAUSE[raw];
  return billsec > 0 ? "ANSWERED" : "NO ANSWER";
}

export class MagnusClient {
  constructor(
    private readonly config: MagnusConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly nonce: () => string = () => `${Date.now()}`,
  ) {}

  private async call(module: string, action: string, fields: Record<string, string>): Promise<unknown> {
    const request = buildMagnusRequest(this.config, module, action, fields, this.nonce());
    const response = await this.fetchImpl(request.url, { method: "POST", headers: request.headers, body: request.body });
    if (!response.ok) {
      throw new Error(`MagnusBilling ${module}/${action} returned HTTP ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  }

  async listCustomers(): Promise<Customer[]> {
    const payload = await this.call("user", "read", { page: "1", start: "0", limit: "200" });
    return asRows(payload).map((row) => ({
      id: text(row, "id"),
      username: text(row, "username"),
      name: [text(row, "firstname"), text(row, "lastname")].filter(Boolean).join(" ") || text(row, "username"),
      email: text(row, "email"),
      credit: num(row, "credit"),
      currency: "USD",
      active: text(row, "active") !== "0",
      sipUsers: 0,
      lastRefillAt: null,
      lastRefillAmount: null,
    }));
  }

  async listSip(): Promise<Extension[]> {
    const payload = await this.call("sip", "read", { page: "1", start: "0", limit: "500" });
    return asRows(payload).map((row) => {
      const name = text(row, "name", "accountcode");
      const host = text(row, "host");
      return {
        id: text(row, "id") || name,
        extension: name,
        name: text(row, "callerid") || name,
        technology: "sip" as const,
        context: text(row, "context") || "billing",
        callerId: text(row, "callerid") || name,
        account: text(row, "accountcode") || null,
        status: host === "dynamic" ? "offline" : "online",
        address: host && host !== "dynamic" ? host : null,
        userAgent: null,
        codec: text(row, "allow"),
        source: "magnus" as const,
      };
    });
  }

  async listTrunks(): Promise<Trunk[]> {
    const payload = await this.call("trunk", "read", { page: "1", start: "0", limit: "100" });
    return asRows(payload).map((row) => {
      const code = text(row, "trunkcode", "id");
      const active = text(row, "status", "active");
      return {
        id: code,
        name: code,
        provider: text(row, "providertech", "trunkcode") || code,
        technology: text(row, "providertech").toLowerCase().includes("iax") ? "iax2" as const : "sip" as const,
        host: text(row, "host", "providerip"),
        status: active === "0" || active.toLowerCase() === "inactive" ? "unregistered" as const : "registered" as const,
        rttMs: null,
        channelsInUse: 0,
        maxChannels: 0,
        lastRegistration: null,
        detail: "From MagnusBilling. Registration comes from AMI when it is connected.",
      };
    });
  }

  async listRates(): Promise<Rate[]> {
    const payload = await this.call("rate", "read", { page: "1", start: "0", limit: "500" });
    return asRows(payload)
      .map((row) => ({
        id: text(row, "id"),
        prefix: text(row, "dialprefix", "prefix"),
        destination: text(row, "destination", "idPrefixdestination") || text(row, "dialprefix"),
        buyRate: num(row, "buyrate", "buy_rate"),
        sellRate: num(row, "rateinitial", "rate", "sellrate"),
        minLength: Math.max(text(row, "dialprefix", "prefix").length, 8),
      }))
      .filter((rate) => rate.prefix);
  }

  async listCdr(rates: Rate[], extensions: string[]): Promise<Cdr[]> {
    const payload = await this.call("call", "read", { page: "1", start: "0", limit: "500" });
    return asRows(payload).map((row) => {
      const billsec = num(row, "sessiontime", "billsec", "real_sessiontime");
      const dst = text(row, "calledstation", "dst");
      const priced = priceCall(dst, billsec, rates, extensions);
      const sell = num(row, "sessionbill");
      const buy = num(row, "buycost");
      const start = text(row, "starttime", "calldate");
      return {
        id: text(row, "id"),
        calldate: start ? new Date(start.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
        src: text(row, "src", "callerid"),
        dst,
        destination: priced.destination,
        disposition: dispositionOf(row, billsec),
        duration: num(row, "realsessiontime", "duration") || billsec,
        billsec,
        account: text(row, "username", "id_user"),
        trunk: text(row, "trunkcode", "id_trunk"),
        sell: sell || priced.sell,
        buy: buy || priced.buy,
        uniqueid: text(row, "uniqueid", "id"),
      };
    });
  }

  async refill(id: string, amount: number, description: string): Promise<void> {
    await this.call("refill", "save", {
      id_user: id,
      credit: amount.toFixed(2),
      description,
      payment: "1",
    });
  }
}
