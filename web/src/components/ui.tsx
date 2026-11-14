import { useEffect, type ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export function trunkTone(status: string): Tone {
  if (status === "registered") return "ok";
  if (status === "lagged") return "warn";
  if (status === "rejected") return "bad";
  return "muted";
}

export function extensionTone(status: string): Tone {
  if (status === "online") return "ok";
  if (status === "busy") return "warn";
  if (status === "offline") return "bad";
  return "muted";
}

export function callTone(state: string): Tone {
  if (state === "up") return "ok";
  if (state === "ringing") return "warn";
  return "info";
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="px-4 py-3">
      <div className="kicker">{label}</div>
      <div className="num mt-1 text-2xl font-medium tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[var(--muted)]">{hint}</div> : null}
    </Panel>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`pill st-${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function PageHead({ title, lede, children }: { title: string; lede?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-[var(--muted)]">{lede}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Banner({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--warn-soft)] px-4 py-3 text-sm">{children}</div>;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status">
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel px-4 py-10 text-center text-sm text-[var(--muted)]">{children}</div>;
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-sm text-[var(--muted)]">
        {children}
      </td>
    </tr>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div className="panel w-full max-w-md p-5" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2 className="font-serif text-2xl">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
