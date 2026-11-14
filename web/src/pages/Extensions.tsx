import { useMemo, useState } from "react";
import { useLive } from "../lib/live.js";
import { EmptyRow, extensionTone, Loading, PageHead, Panel, Pill } from "../components/ui.js";

export function Extensions() {
  const { snap } = useLive();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (snap?.extensions ?? []).filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      if (!needle) return true;
      return `${row.extension} ${row.name} ${row.account ?? ""} ${row.address ?? ""}`.toLowerCase().includes(needle);
    });
  }, [snap, q, source]);

  return (
    <div>
      <PageHead title="Extensions" lede="FreePBX extensions and Magnus SIP users, with peer status overlaid from AMI when a name matches." />
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="field min-w-56">
          <span>Search</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, extension, account" />
        </label>
        <label className="field">
          <span>Source</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All</option>
            <option value="freepbx">FreePBX</option>
            <option value="magnus">MagnusBilling</option>
            <option value="asterisk">Asterisk</option>
          </select>
        </label>
      </div>
      {!snap ? (
        <Loading label="Loading extensions…" />
      ) : (
      <Panel>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Extension</th>
                <th>Name</th>
                <th>Status</th>
                <th>Account</th>
                <th>Address</th>
                <th>Codec</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="num">{row.extension}</td>
                  <td>
                    <div className="font-semibold">{row.name}</div>
                    <div className="text-sm text-[var(--muted)]">{row.userAgent || row.technology}</div>
                  </td>
                  <td>
                    <Pill tone={extensionTone(row.status)}>{row.status}</Pill>
                  </td>
                  <td>{row.account ?? "—"}</td>
                  <td className="num">{row.address ?? "—"}</td>
                  <td className="num">{row.codec || "—"}</td>
                  <td className="capitalize">{row.source}</td>
                </tr>
              ))}
              {rows.length === 0 ? <EmptyRow cols={7}>No extensions match this filter.</EmptyRow> : null}
            </tbody>
          </table>
        </div>
      </Panel>
      )}
    </div>
  );
}
