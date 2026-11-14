import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/api.js";
import { useTheme } from "../lib/theme.js";

export function Login() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="font-serif text-5xl italic leading-none">Span</div>
          <p className="mt-2 text-[var(--muted)]">Live calls, trunks, balances, and what the route actually cost.</p>
        </div>
        <button type="button" className="btn" onClick={toggle}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
      <form className="panel space-y-4 p-5" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-[var(--muted)]">
          A fresh checkout signs in as <span className="num">admin</span> / <span className="num">span-demo-admin</span>. The read-only
          account is <span className="num">viewer</span> / <span className="num">span-demo-viewer</span>. Change both before this faces a
          network.
        </p>
      </form>
    </div>
  );
}
