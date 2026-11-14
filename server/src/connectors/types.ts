import type { Cdr, CelEvent, Customer, Extension, LiveCall, QueueStat, Rate, Refill, Trunk } from "../domain/types.js";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

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
  hangup(id: string, actor: string): Promise<ActionResult<{ id: string }>>;
  refill(id: string, amount: number, description: string, actor: string): Promise<ActionResult<Customer>>;
}
