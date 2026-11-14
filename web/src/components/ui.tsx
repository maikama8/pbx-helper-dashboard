import type { ReactNode } from "react";

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

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "info" | "muted"; children: ReactNode }) {
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

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div className="panel w-full max-w-md p-5" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2 className="font-serif text-2xl">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
