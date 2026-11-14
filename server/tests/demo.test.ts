import { describe, expect, it } from "vitest";
import { DemoConnector } from "../src/connectors/demo/adapter.js";
import { FROZEN } from "./helpers.js";

function connector(): DemoConnector {
  return new DemoConnector({ seed: 20261114, tickMs: 0, timeZone: "UTC", now: () => FROZEN });
}

describe("demo connector", () => {
  it("opens on the documented floor", () => {
    const demo = connector();
    expect(demo.getCalls()).toHaveLength(4);
    expect(demo.getCalls().filter((call) => call.state === "ringing")).toHaveLength(1);
    expect(demo.getTrunks().filter((trunk) => trunk.status === "registered")).toHaveLength(3);
    expect(demo.getTrunks().find((trunk) => trunk.id === "backup-iax")?.detail).toBe("403 Forbidden");
    expect(demo.getCustomers().filter((row) => row.credit < 5)).toHaveLength(3);
    expect(demo.getCdrs()).toHaveLength(22);
    expect(demo.getCel().some((row) => row.eventtype === "ANSWER")).toBe(true);
    expect(demo.getQueues().map((row) => row.name)).toEqual(["sales", "support"]);
  });

  it("answers the ringing call when the roll is low", () => {
    const demo = connector();
    demo.step(0.1);
    const inbound = demo.getCalls().find((call) => call.id === "call-in-2001");
    expect(inbound?.state).toBe("up");
    expect(inbound?.answeredAt).toBe(FROZEN.toISOString());
  });

  it("hangs up an answered call into a rated CDR", async () => {
    const demo = connector();
    const result = await demo.hangup("call-ng-1004", "admin");
    expect(result.ok).toBe(true);
    expect(demo.getCalls().some((call) => call.id === "call-ng-1004")).toBe(false);
    const cdr = demo.getCdrs()[0];
    expect(cdr.disposition).toBe("ANSWERED");
    expect(cdr.destination).toBe("Nigeria Mobile");
    expect(cdr.billsec).toBe(252);
    expect(cdr.sell).toBe(0.336);
    expect(demo.getTrunks().find((trunk) => trunk.id === "telnyx-us")?.channelsInUse).toBe(0);
  });

  it("refuses an unknown call and adds credit on refill", async () => {
    const demo = connector();
    expect((await demo.hangup("missing", "admin")).ok).toBe(false);
    const before = demo.getCustomers().find((row) => row.id === "2");
    const result = await demo.refill("2", 10, "cash desk", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.credit).toBe(11.2);
    expect(demo.getRefills()[0]).toMatchObject({ customerId: "2", amount: 10, by: "admin" });
    expect(before?.credit).toBe(1.2);
  });

  it("originates when the floor has room and clears a lagged trunk on a rare roll", () => {
    const busy = connector();
    busy.step(0.7);
    expect(busy.getCalls()).toHaveLength(5);

    const quiet = connector();
    quiet.step(0.99);
    expect(quiet.getTrunks().find((trunk) => trunk.id === "didww-eu")?.status).toBe("registered");
  });

  it("draws the same first value from a seed", async () => {
    const { mulberry32 } = await import("../src/connectors/demo/adapter.js");
    const a = mulberry32(20261114);
    const b = mulberry32(20261114);
    expect(a()).toBe(b());
    expect(a()).not.toBe(0);
  });
});
