import type { Config } from "../../config.js";
import type { Cdr, CelEvent, Customer, Extension, LiveCall, QueueStat, Rate, Refill, Trunk } from "../../domain/types.js";
import type { ActionResult, TelephonyConnector } from "../types.js";
import { openingState, type DemoData } from "./opening.js";
import { hangupCall, refillCustomer, stepDemo } from "./step.js";

/** Deterministic generator in [0, 1). The same seed yields the same sequence. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoOptions {
  seed: number;
  tickMs: number;
  timeZone: string;
  now?: () => Date;
}

/**
 * Seeded floor used when `SOURCE=demo`. The opening rows do not depend on the seed.
 * The seed only drives later ticks. A tick of 0 leaves the floor frozen.
 */
export class DemoConnector implements TelephonyConnector {
  readonly source = "demo" as const;
  private data: DemoData;
  private rev = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly rng: () => number;
  private readonly clock: () => Date;
  private readonly tickMs: number;

  constructor(options: DemoOptions) {
    this.clock = options.now ?? (() => new Date());
    this.tickMs = options.tickMs;
    this.rng = mulberry32(options.seed);
    this.data = openingState(this.clock(), options.timeZone);
  }

  static fromConfig(config: Config, now?: () => Date): DemoConnector {
    return new DemoConnector({
      seed: config.simSeed,
      tickMs: config.simTickMs,
      timeZone: config.timezone,
      now,
    });
  }

  async start(): Promise<void> {
    if (this.tickMs === 0 || this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  now(): Date {
    return this.clock();
  }

  revision(): number {
    return this.rev;
  }

  warnings(): string[] {
    return [];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCalls(): LiveCall[] {
    return this.data.calls;
  }
  getTrunks(): Trunk[] {
    return this.data.trunks;
  }
  getExtensions(): Extension[] {
    return this.data.extensions;
  }
  getQueues(): QueueStat[] {
    return this.data.queues;
  }
  getCustomers(): Customer[] {
    return [...this.data.customers].sort((a, b) => a.credit - b.credit);
  }
  getRefills(): Refill[] {
    return this.data.refills;
  }
  getRates(): Rate[] {
    return this.data.rates;
  }
  getCdrs(): Cdr[] {
    return this.data.cdrs;
  }
  getCel(): CelEvent[] {
    return this.data.cel;
  }

  /** Advance one tick with a chosen roll. The timer draws from the seeded generator instead. */
  step(roll: number, at = this.clock()): void {
    this.data = stepDemo(this.data, roll, at);
    this.publish();
  }

  async hangup(id: string, _actor: string): Promise<ActionResult<{ id: string }>> {
    const result = hangupCall(this.data, id, this.clock());
    if (!result.removed) {
      return { ok: false, status: 404, message: "That call is no longer up." };
    }
    this.data = result.state;
    this.publish();
    return { ok: true, value: { id } };
  }

  async refill(id: string, amount: number, description: string, actor: string): Promise<ActionResult<Customer>> {
    const result = refillCustomer(this.data, id, amount, description, actor, this.clock());
    if (!result.customer) {
      return { ok: false, status: 404, message: "No customer with that id." };
    }
    this.data = result.state;
    this.publish();
    return { ok: true, value: result.customer };
  }

  private tick(): void {
    this.data = stepDemo(this.data, this.rng(), this.clock());
    this.publish();
  }

  private publish(): void {
    this.rev += 1;
    for (const listener of this.listeners) listener();
  }
}
