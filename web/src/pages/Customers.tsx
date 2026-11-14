import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib/api.js";
import { clock, money } from "../lib/format.js";
import { useLive } from "../lib/live.js";
import { Banner, PageHead, Panel, Pill } from "../components/ui.js";
import type { Customer, Refill } from "../types.js";

interface CustomersPayload {
  threshold: number;
  customers: Customer[];
  refills: Refill[];
  lowBalance: number;
}

export function Customers() {
  const { me, snap } = useLive();
  const [data, setData] = useState<CustomersPayload | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [description, setDescription] = useState("Counter refill");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<CustomersPayload>("/api/customers")
      .then((payload) => {
        setData(payload);
        setCustomerId((current) => current || payload.customers[0]?.id || "");
      })
      .catch(() => undefined);
  }, [snap?.revision]);

  async function refill(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const updated = await api<Customer>(`/api/customers/${encodeURIComponent(customerId)}/refill`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), description }),
      });
      setMessage(`${updated.name} is now ${money(updated.credit)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Refill failed.");
    }
  }

  if (!data) return <p className="text-[var(--muted)]">Loading customers…</p>;

  return (
    <div>
      <PageHead
        title="Customers"
        lede={`Active accounts under ${money(data.threshold)} are flagged. Refill posts to MagnusBilling refill/save when that connector is on.`}
      />
      {data.lowBalance > 0 ? (
        <Banner>
          {data.lowBalance} active account{data.lowBalance === 1 ? "" : "s"} under {money(data.threshold)}.
        </Banner>
      ) : null}
      <Panel className="mb-4 p-4">
        <div className="kicker">Refill</div>
        {me.role !== "admin" ? (
          <p className="mt-2 text-sm text-[var(--muted)]">This account is read only. Credit is unchanged.</p>
        ) : (
          <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={(event) => void refill(event)}>
            <label className="field md:col-span-2">
              <span>Customer</span>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                {data.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({money(customer.credit)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Amount</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Description</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <div className="md:col-span-4">
              <button className="btn btn-primary" type="submit">
                Add credit
              </button>
            </div>
          </form>
        )}
        {message ? <p className="mt-3 text-sm text-[var(--ok)]">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      </Panel>
      <Panel>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Credit</th>
                <th>SIP users</th>
                <th>Last refill</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => {
                const low = customer.active && customer.credit < data.threshold;
                return (
                  <tr key={customer.id}>
                    <td>
                      <div className="font-semibold">{customer.name}</div>
                      <div className="text-sm text-[var(--muted)]">{customer.username}</div>
                    </td>
                    <td className={`num ${low ? "text-[var(--danger)]" : ""}`}>{money(customer.credit)}</td>
                    <td className="num">{customer.sipUsers}</td>
                    <td>
                      {customer.lastRefillAmount ? (
                        <span>
                          {money(customer.lastRefillAmount)} · {clock(customer.lastRefillAt)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{low ? <Pill tone="bad">Low</Pill> : <Pill tone="ok">OK</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className="mt-4 p-4">
        <div className="kicker">Recent refills</div>
        <ul className="mt-3 space-y-2 text-sm">
          {data.refills.slice(0, 8).map((refill) => (
            <li key={refill.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="num">{money(refill.amount)}</span> · {refill.description}
              </span>
              <span className="text-[var(--muted)]">
                {refill.by} · {clock(refill.at)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
