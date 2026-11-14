import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import { acd, civilDay, clock, money, pct } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { Banner, EmptyRow, Kpi, Loading, PageHead, Panel } from "../components/ui.js";
import type { CdrResponse } from "../types.js";

interface CdrQuery {
  from: string;
  to: string;
  account: string;
  disposition: string;
  destination: string;
  q: string;
}

function queryString(fields: CdrQuery): string {
  const params = new URLSearchParams();
  if (fields.from) params.set("from", fields.from);
  if (fields.to) params.set("to", fields.to);
  if (fields.account) params.set("account", fields.account);
  if (fields.disposition) params.set("disposition", fields.disposition);
  if (fields.destination) params.set("destination", fields.destination);
  if (fields.q) params.set("q", fields.q);
  return params.toString();
}

export function Cdr() {
  const { snap } = useLive();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [datesReady, setDatesReady] = useState(false);
  const [account, setAccount] = useState("");
  const [disposition, setDisposition] = useState("");
  const [destination, setDestination] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<CdrResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!snap || datesReady) return;
    const day = civilDay(snap.generatedAt, snap.timezone);
    setFrom(day);
    setTo(day);
    setDatesReady(true);
  }, [snap, datesReady]);

  useEffect(() => {
    if (!datesReady) return;
    const params = queryString({ from, to, account, disposition, destination, q });
    let stop = false;
    api<CdrResponse>(`/api/cdr?${params}`)
      .then((payload) => {
        if (stop) return;
        setData(payload);
        setError("");
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof ApiError ? err.message : "Could not load CDRs.");
      });
    return () => {
      stop = true;
    };
  }, [from, to, account, disposition, destination, q, snap?.revision, datesReady]);

  const params = queryString({ from, to, account, disposition, destination, q });

  return (
    <div>
      <PageHead title="CDR" lede="Filter the day, then export the same rows. Margin is sell minus buy on each attempt, rated per second.">
        {datesReady ? (
          <a className="btn btn-primary" href={`/api/cdr/export?${params}`}>
            Export CSV
          </a>
        ) : (
          <span className="btn cursor-default opacity-50">Export CSV</span>
        )}
      </PageHead>
      <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="field">
          <span>Account</span>
          <input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="northwind" />
        </label>
        <label className="field">
          <span>Disposition</span>
          <select value={disposition} onChange={(event) => setDisposition(event.target.value)}>
            <option value="">Any</option>
            {["ANSWERED", "NO ANSWER", "BUSY", "FAILED", "CONGESTION"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Destination</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Nigeria" />
        </label>
        <label className="field">
          <span>Number</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="src, dst, uniqueid" />
        </label>
      </div>
      {error ? <Banner>{error}</Banner> : null}
      {!datesReady || !data ? (
        <Loading label="Loading CDRs…" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Attempts" value={String(data.analytics.offered)} hint={`${data.analytics.answered} answered`} />
            <Kpi label="ASR" value={pct(data.analytics.asr)} />
            <Kpi label="ACD" value={acd(data.analytics.acdSeconds)} />
            <Kpi label="Sell" value={money(data.analytics.sell, 4)} />
            <Kpi label="Margin" value={money(data.analytics.margin, 4)} hint={pct(data.analytics.marginPercent)} />
          </div>
          <Panel>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Destination</th>
                    <th>Disp</th>
                    <th>Billsec</th>
                    <th>Account</th>
                    <th>Sell</th>
                    <th>Buy</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{clock(row.calldate)}</td>
                      <td className="num">{row.src}</td>
                      <td className="num">{row.dst}</td>
                      <td>{row.destination}</td>
                      <td>{row.disposition}</td>
                      <td className="num">{row.billsec}</td>
                      <td>{row.account}</td>
                      <td className="num">{money(row.sell, 4)}</td>
                      <td className="num">{money(row.buy, 4)}</td>
                      <td className="num">{money(row.sell - row.buy, 4)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? <EmptyRow cols={10}>No attempts match this filter.</EmptyRow> : null}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="mt-4 p-4">
            <div className="kicker">Recent CEL</div>
            <p className="mt-1 text-sm text-[var(--muted)]">Channel events from asteriskcdrdb.cel, or the demo trace of the calls that are up.</p>
            {data.cel.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No channel events in this window.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {data.cel.slice(0, 8).map((event) => (
                  <li key={event.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="num">{event.eventtype}</span> · {event.cidNum} → {event.exten}
                    </span>
                    <span className="text-[var(--muted)]">{clock(event.eventtime)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
