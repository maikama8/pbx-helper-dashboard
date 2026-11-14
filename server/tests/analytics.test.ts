import { describe, expect, it } from "vitest";
import { analyze, answerSeizureRatio, averageCallDuration, filterCdrs } from "../src/domain/analytics.js";
import { cdrToCsv } from "../src/domain/csv.js";
import { matchRate, mulRate, priceCall } from "../src/domain/rating.js";
import { clampInt, parseAmount, parseDescription } from "../src/domain/validate.js";
import { demoCdrs, demoExtensions, DEMO_RATES } from "../src/connectors/demo/opening.js";
import { FROZEN } from "./helpers.js";

describe("rating", () => {
  it("bills per second and keeps six decimal places", () => {
    expect(mulRate(186, 0.08)).toBe(0.248);
    expect(mulRate(252, 0.08)).toBe(0.336);
    expect(mulRate(0, 0.08)).toBe(0);
  });

  it("does not rate a short extension as the United States", () => {
    expect(matchRate("1003", DEMO_RATES)).toBeNull();
    expect(matchRate("12125550199", DEMO_RATES)?.destination).toBe("United States");
    expect(matchRate("233201555014", DEMO_RATES)?.destination).toBe("Ghana Mobile");
    expect(priceCall("1003", 40, DEMO_RATES, ["1003"])).toEqual({ destination: "Internal", sell: 0, buy: 0 });
  });

  it("picks the longest prefix", () => {
    const rates = [
      ...DEMO_RATES,
      { id: "short", prefix: "23", destination: "Too short", buyRate: 1, sellRate: 1, minLength: 4 },
    ];
    expect(matchRate("233201555014", rates)?.destination).toBe("Ghana Mobile");
  });
});

describe("opening day analytics", () => {
  const cdrs = demoCdrs(FROZEN, "UTC", demoExtensions());
  const view = analyze(cdrs, "UTC");

  it("computes ASR and ACD for the seeded day", () => {
    expect(view.offered).toBe(22);
    expect(view.answered).toBe(14);
    expect(view.asr).toBe(63.6);
    expect(view.acdSeconds).toBe(128.1);
    expect(view.minutes).toBe(29.88);
    expect(answerSeizureRatio([])).toBeNull();
    expect(averageCallDuration(cdrs.filter((row) => row.disposition !== "ANSWERED"))).toBeNull();
  });

  it("ranks Nigeria by answered minutes and keeps missed attempts in the call count", () => {
    expect(view.topDestinations[0]).toMatchObject({ destination: "Nigeria Mobile", calls: 6, minutes: 9.08 });
    expect(view.topDestinations.map((row) => row.destination).slice(0, 3)).toEqual([
      "Nigeria Mobile",
      "United States",
      "United Kingdom",
    ]);
    const nigeria = view.topDestinations[0];
    expect(nigeria.sell).toBeCloseTo(0.726666, 5);
    expect(nigeria.margin).toBeCloseTo(nigeria.sell - nigeria.buy, 6);
    expect(view.marginPercent).toBeGreaterThan(50);
    expect(view.sell).toBeGreaterThan(view.buy);
  });

  it("buckets the 08:00 hour as two answered and one missed", () => {
    const eight = view.callsPerHour.find((row) => row.hour === 8);
    expect(eight).toEqual({ hour: 8, answered: 2, missed: 1 });
  });

  it("filters by account, disposition, and day", () => {
    const north = filterCdrs(cdrs, { account: "northwind" }, "UTC");
    expect(north.length).toBe(3);
    const missed = filterCdrs(cdrs, { disposition: "NO ANSWER" }, "UTC");
    expect(missed.every((row) => row.disposition === "NO ANSWER")).toBe(true);
    expect(filterCdrs(cdrs, { from: "2026-11-15" }, "UTC")).toHaveLength(0);
    expect(filterCdrs(cdrs, { destination: "ghana" }, "UTC").length).toBe(3);
  });

  it("uses the civil day in the dashboard timezone", () => {
    const shifted = { ...cdrs[0], calldate: "2026-11-15T02:30:00.000Z" };
    expect(filterCdrs([shifted], { from: "2026-11-14", to: "2026-11-14" }, "America/New_York")).toHaveLength(1);
    expect(filterCdrs([shifted], { from: "2026-11-15", to: "2026-11-15" }, "UTC")).toHaveLength(1);
    expect(filterCdrs([shifted], { from: "2026-11-14", to: "2026-11-14" }, "UTC")).toHaveLength(0);
  });

  it("exports a CSV with a margin column and quoted destinations", () => {
    const csv = cdrToCsv(cdrs);
    expect(csv.split("\n")[0]).toBe("calldate,src,dst,destination,disposition,duration,billsec,account,trunk,sell,buy,margin,uniqueid");
    expect(csv).toContain("Nigeria Mobile");
    expect(cdrToCsv([{ ...cdrs[0], destination: "Lagos, NG" }])).toContain('"Lagos, NG"');
  });
});

describe("validation", () => {
  it("accepts cents and rejects a third decimal place", () => {
    expect(parseAmount(10.2)).toBe(10.2);
    expect(parseAmount("0.01")).toBe(0.01);
    expect(parseAmount(0)).toBeNull();
    expect(parseAmount(10.222)).toBeNull();
    expect(parseAmount(-5)).toBeNull();
  });

  it("trims a refill note and rejects control characters and a page size outside the range", () => {
    expect(parseDescription(" cash desk ")).toBe("cash desk");
    expect(parseDescription("")).toBeNull();
    expect(parseDescription("a".repeat(81))).toBeNull();
    expect(parseDescription("line\nbreak")).toBeNull();
    expect(clampInt("40", 50, 1, 500)).toBe(40);
    expect(clampInt("nope", 50, 1, 500)).toBe(50);
    expect(clampInt("900", 50, 1, 500)).toBe(500);
  });
});
