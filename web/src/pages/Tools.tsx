import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import { Loading, PageHead, Panel } from "../components/ui.js";

interface Provider {
  id: string;
  label: string;
  host: string;
  port: number;
  transport: string;
  codecs: string[];
  note: string;
}

interface CheckItem {
  id: string;
  area: string;
  title: string;
  why: string;
  check: string;
}

interface Tip {
  id: string;
  symptom: string;
  lookAt: string[];
}

type Tab = "sip" | "dialplan" | "checklist" | "nat";

export function Tools() {
  const [tab, setTab] = useState<Tab>("sip");
  return (
    <div>
      <PageHead
        title="Tools"
        lede="Snippets for a trunk you already own. Span prints them. It does not write pjsip.conf or reload the dialplan."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["sip", "SIP trunk"],
            ["dialplan", "Dialplan"],
            ["checklist", "Security"],
            ["nat", "Codec and NAT"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`btn ${tab === id ? "btn-primary" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "sip" ? <SipTool /> : null}
      {tab === "dialplan" ? <DialplanTool /> : null}
      {tab === "checklist" ? <Checklist /> : null}
      {tab === "nat" ? <NatTips /> : null}
    </div>
  );
}

function SipTool() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [provider, setProvider] = useState("telnyx");
  const [format, setFormat] = useState("pjsip");
  const [name, setName] = useState("telnyx-us");
  const [username, setUsername] = useState("acct1");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api<{ providers: Provider[] }>("/api/tools/providers")
      .then((payload) => setProviders(payload.providers))
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : "Could not load providers."));
  }, []);

  const preset = providers?.find((row) => row.id === provider);

  async function generate() {
    setError("");
    try {
      const result = await api<{ text: string; note: string }>("/api/tools/sip", {
        method: "POST",
        body: JSON.stringify({ provider, format, name, username, password, host: host || undefined }),
      });
      setText(result.text);
      setNote(result.note);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the snippet.");
    }
  }

  if (loadError) return <p className="text-sm text-[var(--danger)]">{loadError}</p>;
  if (!providers) return <Loading label="Loading providers…" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-3 p-4">
        <label className="field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              const next = providers.find((row) => row.id === event.target.value);
              if (next && !name) setName(next.id);
            }}
          >
            {providers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="pjsip">PJSIP</option>
            <option value="chan_sip">chan_sip</option>
          </select>
        </label>
        <label className="field">
          <span>Trunk name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Host</span>
          <input value={host} placeholder={preset?.host || "hostname"} onChange={(event) => setHost(event.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void generate()}>
          Generate
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {note ? <p className="text-sm text-[var(--muted)]">{note}</p> : null}
      </Panel>
      <pre className="snippet min-h-64">{text || "; The snippet appears here."}</pre>
    </div>
  );
}

function DialplanTool() {
  const [did, setDid] = useState("442079460958");
  const [extension, setExtension] = useState("2001");
  const [outboundPrefix, setOutboundPrefix] = useState("9");
  const [strip, setStrip] = useState("1");
  const [trunk, setTrunk] = useState("voipms-east");
  const [callerId, setCallerId] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setError("");
    try {
      const result = await api<{ text: string }>("/api/tools/dialplan", {
        method: "POST",
        body: JSON.stringify({ did, extension, outboundPrefix, strip: Number(strip), trunk, callerId }),
      });
      setText(result.text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the snippet.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="field">
          <span>Inbound DID</span>
          <input value={did} onChange={(event) => setDid(event.target.value)} />
        </label>
        <label className="field">
          <span>Send to extension</span>
          <input value={extension} onChange={(event) => setExtension(event.target.value)} />
        </label>
        <label className="field">
          <span>Outbound prefix</span>
          <input value={outboundPrefix} onChange={(event) => setOutboundPrefix(event.target.value)} />
        </label>
        <label className="field">
          <span>Digits to strip</span>
          <input value={strip} onChange={(event) => setStrip(event.target.value)} />
        </label>
        <label className="field">
          <span>PJSIP trunk</span>
          <input value={trunk} onChange={(event) => setTrunk(event.target.value)} />
        </label>
        <label className="field">
          <span>Caller ID</span>
          <input value={callerId} placeholder="optional" onChange={(event) => setCallerId(event.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button type="button" className="btn btn-primary" onClick={() => void generate()}>
            Generate
          </button>
          {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
      </Panel>
      <pre className="snippet min-h-64">{text || "; extensions_custom.conf appears here."}</pre>
    </div>
  );
}

function Checklist() {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ items: CheckItem[] }>("/api/tools/checklist")
      .then((payload) => setItems(payload.items))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load the checklist."));
  }, []);
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!items) return <Loading label="Loading the checklist…" />;
  if (items.length === 0) return <p className="text-sm text-[var(--muted)]">Nothing on the checklist.</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Panel key={item.id} className="p-4">
          <div className="kicker">{item.area}</div>
          <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
          <p className="mt-1 text-sm">{item.why}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{item.check}</p>
        </Panel>
      ))}
    </div>
  );
}

function NatTips() {
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ tips: Tip[] }>("/api/tools/nat")
      .then((payload) => setTips(payload.tips))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load the notes."));
  }, []);
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!tips) return <Loading label="Loading notes…" />;
  if (tips.length === 0) return <p className="text-sm text-[var(--muted)]">No notes yet.</p>;
  return (
    <div className="space-y-3">
      {tips.map((tip) => (
        <Panel key={tip.id} className="p-4">
          <h2 className="text-lg font-semibold">{tip.symptom}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {tip.lookAt.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
