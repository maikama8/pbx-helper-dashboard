import type { Rate } from "./types.js";

/** Per-second billing: billsec / 60 × per-minute rate, truncated to 6 decimal places. */
export function mulRate(billsec: number, perMinute: number): number {
  if (billsec <= 0 || perMinute <= 0) return 0;
  return Math.round((billsec * perMinute * 1_000_000) / 60) / 1_000_000;
}

export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Longest prefix that fits the dialed number.
 * A prefix is ignored when the number is shorter than `minLength`, so extension
 * 1003 is not billed as the United States just because it starts with 1.
 */
export function matchRate(destination: string, rates: Rate[]): Rate | null {
  const digits = destination.replace(/\D/g, "");
  let best: Rate | null = null;
  for (const rate of rates) {
    if (!digits.startsWith(rate.prefix)) continue;
    if (digits.length < rate.minLength) continue;
    if (!best || rate.prefix.length > best.prefix.length) best = rate;
  }
  return best;
}

export interface PricedCall {
  destination: string;
  sell: number;
  buy: number;
}

export function priceCall(
  dst: string,
  billsec: number,
  rates: Rate[],
  extensions: readonly string[],
): PricedCall {
  if (extensions.includes(dst)) {
    return { destination: "Internal", sell: 0, buy: 0 };
  }
  const rate = matchRate(dst, rates);
  if (!rate) return { destination: "Unknown", sell: 0, buy: 0 };
  if (billsec <= 0) return { destination: rate.destination, sell: 0, buy: 0 };
  return {
    destination: rate.destination,
    sell: mulRate(billsec, rate.sellRate),
    buy: mulRate(billsec, rate.buyRate),
  };
}
