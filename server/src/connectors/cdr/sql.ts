import type { Cdr, CelEvent, Disposition, Rate } from "../../domain/types.js";
import { priceCall } from "../../domain/rating.js";
import { trunkFromChannel } from "../ami/map.js";

export interface MysqlCdrRow {
  calldate: Date | string;
  src: string | null;
  dst: string | null;
  disposition: string | null;
  duration: number | null;
  billsec: number | null;
  accountcode: string | null;
  uniqueid: string | null;
  channel: string | null;
  dstchannel: string | null;
  did: string | null;
}

export interface MysqlCelRow {
  id: number | string;
  eventtime: Date | string;
  eventtype: string | null;
  cid_num: string | null;
  exten: string | null;
  channame: string | null;
  uniqueid: string | null;
  context: string | null;
}

const DISPOSITIONS = new Set<Disposition>(["ANSWERED", "NO ANSWER", "BUSY", "FAILED", "CONGESTION"]);

export function cdrQuery(days: number, limit: number): { sql: string; params: [number, number] } {
  const windowDays = Math.min(31, Math.max(1, Math.trunc(days)));
  const rowLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const sql = `SELECT calldate, src, dst, disposition, duration, billsec, accountcode, uniqueid, channel, dstchannel, did
FROM cdr
WHERE calldate >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
ORDER BY calldate DESC
LIMIT ?`;
  return { sql, params: [windowDays, rowLimit] };
}

export function celQuery(days: number, limit: number): { sql: string; params: [number, number] } {
  const windowDays = Math.min(31, Math.max(1, Math.trunc(days)));
  const rowLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  const sql = `SELECT id, eventtime, eventtype, cid_num, exten, channame, uniqueid, context
FROM cel
WHERE eventtime >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
ORDER BY id DESC
LIMIT ?`;
  return { sql, params: [windowDays, rowLimit] };
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z"));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function mapMysqlCdr(row: MysqlCdrRow, rates: readonly Rate[], extensions: readonly string[], trunks: readonly string[]): Cdr {
  const dst = row.dst ?? "";
  const billsec = Number(row.billsec ?? 0) || 0;
  const raw = (row.disposition ?? "").toUpperCase();
  const disposition: Disposition = DISPOSITIONS.has(raw as Disposition) ? (raw as Disposition) : billsec > 0 ? "ANSWERED" : "FAILED";
  const priced = priceCall(dst, disposition === "ANSWERED" ? billsec : 0, [...rates], extensions);
  const channel = row.dstchannel || row.channel || "";
  return {
    id: row.uniqueid || `${row.src}-${row.calldate}`,
    calldate: asIso(row.calldate),
    src: row.src ?? "",
    dst,
    destination: priced.destination,
    disposition,
    duration: Number(row.duration ?? 0) || 0,
    billsec,
    account: row.accountcode ?? "",
    trunk: trunkFromChannel(channel, trunks) ?? "",
    sell: priced.sell,
    buy: priced.buy,
    uniqueid: row.uniqueid ?? "",
  };
}

export function mapMysqlCel(row: MysqlCelRow): CelEvent {
  return {
    id: String(row.id),
    eventtime: asIso(row.eventtime),
    eventtype: row.eventtype ?? "",
    cidNum: row.cid_num ?? "",
    exten: row.exten ?? "",
    channel: row.channame ?? "",
    uniqueid: row.uniqueid ?? "",
    context: row.context ?? "",
  };
}
