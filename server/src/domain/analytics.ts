import type { Analytics, Cdr, DestinationStat, Disposition, HourBucket } from "./types.js";
import { hourInZone } from "./time.js";
import { round1, round2, round6 } from "./rating.js";

const ANSWERED: Disposition = "ANSWERED";

export function isAnswered(cdr: Cdr): boolean {
  return cdr.disposition === ANSWERED;
}

/**
 * Answer-seizure ratio: ANSWERED ÷ every attempt.
 * Busy, no answer, failed, and congestion all stay in the denominator.
 * Null when nothing was offered.
 */
export function answerSeizureRatio(cdrs: readonly Cdr[]): number | null {
  if (cdrs.length === 0) return null;
  const answered = cdrs.filter(isAnswered).length;
  return round1((answered / cdrs.length) * 100);
}

/** Mean billsec of answered calls. Null when none were answered. */
export function averageCallDuration(cdrs: readonly Cdr[]): number | null {
  const answered = cdrs.filter(isAnswered);
  if (answered.length === 0) return null;
  const total = answered.reduce((sum, cdr) => sum + cdr.billsec, 0);
  return round1(total / answered.length);
}

export function callsPerHour(cdrs: readonly Cdr[], timeZone: string): HourBucket[] {
  const buckets = new Map<number, HourBucket>();
  for (const cdr of cdrs) {
    const hour = hourInZone(cdr.calldate, timeZone);
    const bucket = buckets.get(hour) ?? { hour, answered: 0, missed: 0 };
    if (isAnswered(cdr)) bucket.answered += 1;
    else bucket.missed += 1;
    buckets.set(hour, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.hour - b.hour);
}

export function topDestinations(cdrs: readonly Cdr[], limit = 6): DestinationStat[] {
  const byName = new Map<string, DestinationStat>();
  for (const cdr of cdrs) {
    if (cdr.destination === "Internal") continue;
    const row = byName.get(cdr.destination) ?? {
      destination: cdr.destination,
      calls: 0,
      minutes: 0,
      sell: 0,
      buy: 0,
      margin: 0,
    };
    row.calls += 1;
    if (isAnswered(cdr)) row.minutes += cdr.billsec / 60;
    row.sell += cdr.sell;
    row.buy += cdr.buy;
    byName.set(cdr.destination, row);
  }
  return [...byName.values()]
    .map((row) => ({
      ...row,
      minutes: round2(row.minutes),
      sell: round6(row.sell),
      buy: round6(row.buy),
      margin: round6(row.sell - row.buy),
    }))
    .sort((a, b) => b.minutes - a.minutes || b.calls - a.calls || a.destination.localeCompare(b.destination))
    .slice(0, limit);
}

export function analyze(cdrs: readonly Cdr[], timeZone: string): Analytics {
  const answered = cdrs.filter(isAnswered);
  const billsec = answered.reduce((sum, cdr) => sum + cdr.billsec, 0);
  const sell = round6(cdrs.reduce((sum, cdr) => sum + cdr.sell, 0));
  const buy = round6(cdrs.reduce((sum, cdr) => sum + cdr.buy, 0));
  const margin = round6(sell - buy);
  return {
    offered: cdrs.length,
    answered: answered.length,
    asr: answerSeizureRatio(cdrs),
    acdSeconds: averageCallDuration(cdrs),
    minutes: round2(billsec / 60),
    sell,
    buy,
    margin,
    marginPercent: sell > 0 ? round1((margin / sell) * 100) : null,
    callsPerHour: callsPerHour(cdrs, timeZone),
    topDestinations: topDestinations(cdrs),
  };
}

export interface CdrFilter {
  from?: string;
  to?: string;
  account?: string;
  disposition?: string;
  destination?: string;
  q?: string;
}

export function filterCdrs(cdrs: readonly Cdr[], filter: CdrFilter, timeZone: string): Cdr[] {
  const dayOf = (iso: string) => {
    const date = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date);
  };
  return cdrs.filter((cdr) => {
    const day = dayOf(cdr.calldate);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.account && cdr.account !== filter.account) return false;
    if (filter.disposition && cdr.disposition !== filter.disposition) return false;
    if (filter.destination && !cdr.destination.toLowerCase().includes(filter.destination.toLowerCase())) {
      return false;
    }
    if (filter.q) {
      const needle = filter.q.toLowerCase();
      const hay = `${cdr.src} ${cdr.dst} ${cdr.account} ${cdr.uniqueid}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
