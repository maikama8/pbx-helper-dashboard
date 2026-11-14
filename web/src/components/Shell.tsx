import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { LiveProvider, useLive } from "../lib/live.js";
import { useTheme } from "../lib/theme.js";
import type { Me } from "../types.js";

const NAV = [
  ["/", "Overview"],
  ["/calls", "Live calls"],
  ["/trunks", "Trunks"],
  ["/extensions", "Extensions"],
  ["/customers", "Customers"],
  ["/cdr", "CDR"],
  ["/tools", "Tools"],
] as const;

export function Shell() {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => {
        setFailed(true);
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  if (!me) {
    return <div className="p-10 text-[var(--muted)]">{failed ? "Redirecting to sign in…" : "Opening the switch…"}</div>;
  }

  return (
    <LiveProvider me={me}>
      <Frame />
    </LiveProvider>
  );
}

function Frame() {
  const { me, snap, connected } = useLive();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  async function logout() {
    await api("/api/logout", { method: "POST" });
    navigate("/login");
  }

  return (
    <div className="md:flex md:min-h-screen">
      <aside className="border-b border-[var(--line)] bg-[var(--surface)] md:sticky md:top-0 md:flex md:h-screen md:w-[232px] md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div>
            <div className="font-serif text-3xl italic leading-none">Span</div>
            <div className="kicker mt-1">PBX helper</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold md:rounded-xl ${
                  isActive ? "bg-[var(--surface-2)] text-[var(--ink)]" : "text-[var(--muted)]"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-[var(--line)] px-4 py-4 md:block">
          <div className="text-sm font-semibold">{me.username}</div>
          <div className="text-sm text-[var(--muted)]">{me.role === "admin" ? "Admin" : "Read only"}</div>
          <button type="button" className="btn btn-ghost mt-3 px-0" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className={connected ? "live-dot" : "inline-block h-2 w-2 rounded-full bg-[var(--muted)]"} />
            <span>{snap?.source === "live" ? "Live connectors" : "Demo floor"}</span>
            <span>·</span>
            <span className="num">{snap?.timezone ?? "UTC"}</span>
            {me.role === "viewer" ? <span className="pill st-muted">Read only</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={toggle} aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="btn md:hidden" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>
        <main className="px-4 pb-12 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
