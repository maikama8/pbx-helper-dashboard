import type { Cdr, CelEvent, Customer, Extension, LiveCall, QueueStat, Rate, Refill, Trunk } from "../domain/types.js";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

/**
 * What the board can ask of a switch and a billing system.
 * Demo and live both implement this. Routes never branch on which one is running.
 */
export interface TelephonyConnector {
  readonly source: "demo" | "live";
  start(): Promise<void>;
  stop(): Promise<void>;
  now(): Date;
  revision(): number;
  warnings(): string[];
  subscribe(listener: () => void): () => void;
  getCalls(): LiveCall[];
  getTrunks(): Trunk[];
  getExtensions(): Extension[];
  getQueues(): QueueStat[];
  getCustomers(): Customer[];
  getRefills(): Refill[];
  getRates(): Rate[];
  getCdrs(): Cdr[];
  getCel(): CelEvent[];
  /** End the channel. 404 when it is already gone. */
  hangup(id: string, actor: string): Promise<ActionResult<{ id: string }>>;
  /** Add credit. Live mode posts MagnusBilling `refill/save` and re-reads the customer. */
  refill(id: string, amount: number, description: string, actor: string): Promise<ActionResult<Customer>>;
}
