import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { acd, clock, money, pct } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { Kpi, PageHead, Panel } from "../components/ui.js";
import type { CdrResponse } from "../types.js";

export function Cdr() {
  const { snap } = useLive();
  const today = (snap?.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState("");
  const [disposition, setDisposition] = useState("");
  const [destination, setDestination] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<CdrResponse | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (account) params.set("account", account);
    if (disposition) params.set("disposition", disposition);
    if (destination) params.set("destination", destination);
    if (q) params.set("q", q);
    api<CdrResponse>(`/api/cdr?${params.toString()}`)
      .then(setData)
      .catch(() => undefined);
  }, [from, to, account, disposition, destination, q, snap?.revision]);

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (account) params.set("account", account);
  if (disposition) params.set("disposition", disposition);
  if (destination) params.set("destination", destination);
  if (q) params.set("q", q);

  return (
    <div>
      <PageHead title="CDR" lede="Filter the day, then export the same rows. Margin is sell minus buy on each attempt, rated per second.">
        <a className="btn btn-primary" href={`/api/cdr/export?${params.toString()}`}>
          Export CSV
        </a>
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
      {data ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Attempts" value={String(data.analytics.offered)} hint={`${data.analytics.answered} answered`} />
          <Kpi label="ASR" value={pct(data.analytics.asr)} />
          <Kpi label="ACD" value={acd(data.analytics.acdSeconds)} />
          <Kpi label="Sell" value={money(data.analytics.sell, 4)} />
          <Kpi label="Margin" value={money(data.analytics.margin, 4)} hint={pct(data.analytics.marginPercent)} />
        </div>
      ) : null}
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
              {(data?.rows ?? []).map((row) => (
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
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className="mt-4 p-4">
        <div className="kicker">Recent CEL</div>
        <p className="mt-1 text-sm text-[var(--muted)]">Channel events from asteriskcdrdb.cel, or the demo trace of the calls that are up.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {(data?.cel ?? []).slice(0, 8).map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="num">{event.eventtype}</span> · {event.cidNum} → {event.exten}
              </span>
              <span className="text-[var(--muted)]">{clock(event.eventtime)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
