import { clock } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { Empty, Loading, PageHead, Panel, Pill, trunkTone } from "../components/ui.js";

export function Trunks() {
  const { snap } = useLive();
  const trunks = snap?.trunks;
  return (
    <div>
      <PageHead
        title="Trunks"
        lede="Inventory can come from MagnusBilling or FreePBX. When AMI is connected, registration and qualify replace that status."
      />
      {!trunks ? (
        <Loading label="Loading trunks…" />
      ) : trunks.length === 0 ? (
        <Empty>No trunks are configured.</Empty>
      ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {trunks.map((trunk) => (
          <Panel key={trunk.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-serif text-2xl">{trunk.provider}</div>
                <div className="num text-sm text-[var(--muted)]">{trunk.name}</div>
              </div>
              <Pill tone={trunkTone(trunk.status)}>{trunk.status}</Pill>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="kicker">Host</dt>
                <dd className="num mt-1">{trunk.host || "—"}</dd>
              </div>
              <div>
                <dt className="kicker">Tech</dt>
                <dd className="mt-1 uppercase">{trunk.technology}</dd>
              </div>
              <div>
                <dt className="kicker">Channels</dt>
                <dd className="num mt-1">
                  {trunk.channelsInUse}/{trunk.maxChannels || "–"}
                </dd>
              </div>
              <div>
                <dt className="kicker">Qualify</dt>
                <dd className="num mt-1">{trunk.rttMs === null ? "—" : `${trunk.rttMs} ms`}</dd>
              </div>
              <div className="col-span-2">
                <dt className="kicker">Last registration</dt>
                <dd className="mt-1">{clock(trunk.lastRegistration)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-[var(--muted)]">{trunk.detail}</p>
          </Panel>
        ))}
      </div>
      )}
    </div>
  );
}
