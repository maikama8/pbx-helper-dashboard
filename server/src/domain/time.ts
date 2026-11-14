export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Wall-clock parts of an instant in an IANA timezone. */
export function dateParts(instant: Date, timeZone: string): DateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = dateParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const stripped = instant.getTime() - instant.getUTCSeconds() * 1000 - instant.getUTCMilliseconds();
  return asUtc - stripped;
}

/** UTC instant for a wall-clock time in `timeZone`. Applied twice so a DST fold settles. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i += 1) {
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - zoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

export function dayKey(iso: string, timeZone: string): string {
  const parts = dateParts(new Date(iso), timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function hourInZone(iso: string, timeZone: string): number {
  return dateParts(new Date(iso), timeZone).hour;
}

/** Stamp hour:minute on the same civil day as `now` in `timeZone`. */
export function stampOnDay(now: Date, hour: number, minute: number, timeZone: string): string {
  const parts = dateParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, hour, minute, timeZone).toISOString();
}

export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error(`TIMEZONE is not an IANA name: ${timeZone}`);
  }
  return timeZone;
}
