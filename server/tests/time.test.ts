import { describe, expect, it } from "vitest";
import { dayKey, hourInZone, stampOnDay, zonedTimeToUtc } from "../src/domain/time.js";

describe("timezone stamps", () => {
  it("keeps a UTC wall clock on the UTC instant", () => {
    const instant = zonedTimeToUtc(2026, 11, 14, 8, 12, "UTC");
    expect(instant.toISOString()).toBe("2026-11-14T08:12:00.000Z");
    expect(hourInZone(instant.toISOString(), "UTC")).toBe(8);
    expect(dayKey(instant.toISOString(), "UTC")).toBe("2026-11-14");
  });

  it("shifts a New York morning to 13:12 UTC in November", () => {
    const instant = zonedTimeToUtc(2026, 11, 14, 8, 12, "America/New_York");
    expect(instant.toISOString()).toBe("2026-11-14T13:12:00.000Z");
    expect(hourInZone(instant.toISOString(), "America/New_York")).toBe(8);
  });

  it("stamps the seeded hour on the frozen day", () => {
    const iso = stampOnDay(new Date("2026-11-14T15:00:00.000Z"), 8, 12, "UTC");
    expect(iso).toBe("2026-11-14T08:12:00.000Z");
  });
});
