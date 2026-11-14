import { acd, hourLabel, money, pct } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { Banner, Kpi, Loading, PageHead, Panel, Pill, trunkTone } from "../components/ui.js";

export function Overview() {
  const { snap } = useLive();
  const view = snap?.overview;
  if (!view) return <Loading label="Loading the floor…" />;
  const max = Math.max(1, ...view.callsPerHour.map((row) => row.answered + row.missed));

  return (
    <div>
      <PageHead
        title="Overview"
        lede="Answer-seizure ratio and average call duration are today's attempts. Trunk registration is the live board."
      />
      {view.warnings.length > 0 ? (
        <Banner>
          {view.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </Banner>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Live calls" value={String(view.liveCalls)} hint={`${view.ringing} ringing`} />
        <Kpi label="ASR" value={pct(view.asr)} hint={`${view.answered} of ${view.offered}`} />
        <Kpi label="ACD" value={acd(view.acdSeconds)} hint={`${view.minutes.toFixed(2)} min`} />
        <Kpi label="Margin" value={money(view.margin, 2)} hint={view.marginPercent === null ? "—" : pct(view.marginPercent)} />
        <Kpi label="Trunks up" value={`${view.trunksUp}/${view.trunksTotal}`} hint="Registered" />
        <Kpi label="Low balance" value={String(view.lowBalanceCount)} hint="Under the threshold" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel className="p-4 xl:col-span-3">
          <div className="kicker">Calls per hour</div>
          {view.callsPerHour.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">No attempts in this window.</p>
          ) : (
          <div className="mt-4 flex h-44 items-end gap-1.5">
            {view.callsPerHour.map((row) => {
              const answered = (row.answered / max) * 100;
              const missed = (row.missed / max) * 100;
              return (
                <div key={row.hour} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-36 w-full flex-col justify-end">
                    <div className="w-full rounded-t bg-[var(--danger)]" style={{ height: `${missed}%` }} title={`${row.missed} missed`} />
                    <div className="w-full bg-[var(--accent)]" style={{ height: `${answered}%` }} title={`${row.answered} answered`} />
                  </div>
                  <div className="num text-[0.65rem] text-[var(--muted)]">{hourLabel(row.hour).slice(0, 2)}</div>
                </div>
              );
            })}
          </div>
          )}
          {view.callsPerHour.length > 0 ? (
          <div className="mt-2 flex gap-4 text-sm text-[var(--muted)]">
            <span>Copper is answered</span>
            <span>Red is missed</span>
          </div>
          ) : null}
        </Panel>
        <Panel className="p-4 xl:col-span-2">
          <div className="kicker">Trunk health</div>
          {(snap?.trunks ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">No trunks are configured.</p>
          ) : (
          <ul className="mt-3 space-y-3">
            {(snap?.trunks ?? []).map((trunk) => (
              <li key={trunk.id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{trunk.provider}</div>
                  <div className="num text-sm text-[var(--muted)]">
                    {trunk.channelsInUse}/{trunk.maxChannels || "–"} · {trunk.rttMs === null ? "no qualify" : `${trunk.rttMs} ms`}
                  </div>
                </div>
                <Pill tone={trunkTone(trunk.status)}>{trunk.status}</Pill>
              </li>
            ))}
          </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-2">
          <div className="kicker">Top destinations</div>
          {view.topDestinations.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">No destinations yet.</p>
          ) : (
          <div className="table-wrap mt-2">
            <table className="data">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Calls</th>
                  <th>Minutes</th>
                  <th>Sell</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {view.topDestinations.map((row) => (
                  <tr key={row.destination}>
                    <td>{row.destination}</td>
                    <td className="num">{row.calls}</td>
                    <td className="num">{row.minutes.toFixed(2)}</td>
                    <td className="num">{money(row.sell, 4)}</td>
                    <td className="num">{money(row.margin, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="kicker">Queues</div>
            {view.queues.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No queues reported.</p>
            ) : (
            <ul className="mt-3 space-y-3">
              {view.queues.map((queue) => (
                <li key={queue.name}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold capitalize">{queue.name}</span>
                    <span className="num text-sm">{queue.serviceLevel === null ? "—" : `${queue.serviceLevel.toFixed(1)}%`}</span>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    {queue.waiting} waiting · {queue.completed} answered · {queue.abandoned} abandoned
                  </div>
                </li>
              ))}
            </ul>
            )}
          </Panel>
          <Panel className="p-4">
            <div className="kicker">Low balance</div>
            <ul className="mt-3 space-y-2">
              {view.lowBalance.map((customer) => (
                <li key={customer.id} className="flex items-center justify-between gap-3">
                  <span>{customer.name}</span>
                  <span className="num text-[var(--danger)]">{money(customer.credit)}</span>
                </li>
              ))}
              {view.lowBalance.length === 0 ? <li className="text-sm text-[var(--muted)]">Nobody is under the threshold.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
