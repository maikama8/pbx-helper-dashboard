/** A credit amount in major units, at most two decimal places, from 0.01 to 100000. */
export function parseAmount(input: unknown): number | null {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) return null;
  return cents / 100;
}

/** A refill note, 1-80 characters, with no control characters. */
export function parseDescription(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (text.length < 1 || text.length > 80) return null;
  if (hasControl(text)) return null;
  return text;
}

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** An integer inside `[min, max]`, or `fallback` when the input is not a finite number. */
export function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const value = typeof input === "string" ? Number(input) : typeof input === "number" ? input : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
