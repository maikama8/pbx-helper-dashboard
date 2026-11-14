import type { Cdr } from "./types.js";
import { round6 } from "./rating.js";

const COLUMNS = [
  "calldate",
  "src",
  "dst",
  "destination",
  "disposition",
  "duration",
  "billsec",
  "account",
  "trunk",
  "sell",
  "buy",
  "margin",
  "uniqueid",
] as const;

function cell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function cdrToCsv(rows: readonly Cdr[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    const margin = round6(row.sell - row.buy);
    const values = [
      row.calldate,
      row.src,
      row.dst,
      row.destination,
      row.disposition,
      row.duration,
      row.billsec,
      row.account,
      row.trunk,
      row.sell,
      row.buy,
      margin,
      row.uniqueid,
    ];
    lines.push(values.map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
