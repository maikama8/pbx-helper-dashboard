import { useState } from "react";
import { ApiError, api } from "../lib/api.js";
import { elapsed, useNow } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { callTone, EmptyRow, Loading, Modal, PageHead, Panel, Pill } from "../components/ui.js";
import type { LiveCall } from "../types.js";

export function Calls() {
  const { snap, me } = useLive();
  const now = useNow();
  const [pending, setPending] = useState<LiveCall | null>(null);
  const [error, setError] = useState("");
  const calls = snap?.calls;

  async function hangup() {
    if (!pending) return;
    setError("");
    try {
      await api(`/api/calls/${encodeURIComponent(pending.id)}/hangup`, { method: "POST" });
      setPending(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hangup failed.");
    }
  }

  return (
    <div>
      <PageHead title="Live calls" lede="Hangup sends ARI DELETE when ARI is configured, otherwise AMI Action Hangup. A viewer cannot press it." />
      {!calls ? (
        <Loading label="Loading channels…" />
      ) : (
      <Panel>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Destination</th>
                <th>Dir</th>
                <th>State</th>
                <th>Duration</th>
                <th>Trunk</th>
                <th>Account</th>
                <th>Codec</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td>
                    <div className="font-semibold">{call.callerName || call.caller}</div>
                    <div className="num text-sm text-[var(--muted)]">{call.caller}</div>
                  </td>
                  <td className="num">{call.destination}</td>
                  <td className="capitalize">{call.direction}</td>
                  <td>
                    <Pill tone={callTone(call.state)}>{call.state}</Pill>
                  </td>
                  <td className="num">{elapsed(call.answeredAt ?? call.startedAt, now)}</td>
                  <td>{call.trunk ?? "—"}</td>
                  <td>{call.account ?? "—"}</td>
                  <td className="num">{call.codec}</td>
                  <td>
                    <button type="button" className="btn btn-danger" disabled={me.role !== "admin"} onClick={() => setPending(call)}>
                      Hang up
                    </button>
                  </td>
                </tr>
              ))}
              {calls.length === 0 ? <EmptyRow cols={9}>No channels are up.</EmptyRow> : null}
            </tbody>
          </table>
        </div>
      </Panel>
      )}
      {pending ? (
        <Modal title="Hang up this channel?" onClose={() => setPending(null)}>
          <p>
            {pending.callerName || pending.caller} to <span className="num">{pending.destination}</span>
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{pending.channel}</p>
          {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void hangup()}>
              Hang up
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
