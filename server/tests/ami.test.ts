import { describe, expect, it } from "vitest";
import { createAmiParser, encodeAction } from "../src/connectors/ami/parser.js";
import { mapPeerEntry, mapQueueParams, mapRegistry, parsePeerStatus, trunkFromChannel } from "../src/connectors/ami/map.js";
import { emptyAmiState, reduceAmi } from "../src/connectors/ami/reduce.js";
import { AmiSession } from "../src/connectors/ami/session.js";

describe("AMI parser", () => {
  it("splits frames and a chunk that breaks a CRLF", () => {
    const frames: string[] = [];
    const parser = createAmiParser((message) => frames.push(message.headers.Event ?? message.headers.Response ?? ""));
    parser.push("Response: Success\r\nMessage: ok\r");
    expect(frames).toEqual([]);
    parser.push("\n\r\nEvent: Hangup\r\nUniqueid: 1\r\n\r\n");
    expect(frames).toEqual(["Success", "Hangup"]);
  });

  it("encodes an action with a trailing blank line", () => {
    expect(encodeAction({ Action: "Ping", ActionID: "span-1" })).toBe("Action: Ping\r\nActionID: span-1\r\n\r\n");
  });
});

describe("AMI session", () => {
  it("correlates a login by ActionID", async () => {
    const session = new AmiSession((payload) => {
      const id = /ActionID: (\S+)/.exec(payload)?.[1];
      session.push(`Response: Success\r\nActionID: ${id}\r\nMessage: Authentication accepted\r\n\r\n`);
    });
    const messages = await session.request(
      { Action: "Login", Username: "span", Secret: "secret" },
      (message) => message.headers.Response === "Success" || message.headers.Response === "Error",
    );
    expect(messages[0].headers.Message).toBe("Authentication accepted");
  });
});

describe("AMI mapping", () => {
  it("reads peer qualify text", () => {
    expect(parsePeerStatus("OK (42 ms)")).toEqual({ kind: "ok", rttMs: 42 });
    expect(parsePeerStatus("LAGGED (400 ms)").kind).toBe("lagged");
    expect(parsePeerStatus("UNREACHABLE").kind).toBe("unreachable");
    expect(trunkFromChannel("PJSIP/telnyx-us-0000002b", ["telnyx-us"])).toBe("telnyx-us");
    expect(trunkFromChannel("PJSIP/1001-0000003d", ["telnyx-us"])).toBeNull();
  });

  it("maps a registry rejection and a queue", () => {
    expect(mapRegistry({ Event: "Registry", Username: "backup", Domain: "198.51.100.80", Status: "Rejected" })).toMatchObject({
      status: "rejected",
      host: "198.51.100.80",
    });
    expect(mapPeerEntry({ Event: "PeerEntry", ObjectName: "1001", Status: "OK (12 ms)", IPaddress: "203.0.113.21" })).toMatchObject({
      name: "1001",
      status: "online",
      rttMs: 12,
    });
    expect(
      mapQueueParams({
        Event: "QueueParams",
        Queue: "sales",
        Calls: "2",
        Completed: "10",
        Abandoned: "1",
        Holdtime: "8",
        TalkTime: "40",
        ServicelevelPerf: "91.5",
      }),
    ).toMatchObject({ name: "sales", waiting: 2, serviceLevel: 91.5 });
  });
});

describe("AMI reducer", () => {
  it("tracks a channel from Newchannel through answer to Hangup", () => {
    let state = emptyAmiState();
    state = {
      ...state,
      trunks: [
        {
          id: "telnyx-us",
          name: "telnyx-us",
          provider: "Telnyx",
          technology: "pjsip",
          host: "sip.telnyx.com",
          status: "unregistered",
          rttMs: null,
          channelsInUse: 0,
          maxChannels: 30,
          lastRegistration: null,
          detail: "",
        },
      ],
    };
    state = reduceAmi(state, {
      headers: {
        Event: "Newchannel",
        Channel: "PJSIP/telnyx-us-0000002b",
        Uniqueid: "1730.2",
        CallerIDNum: "1004",
        CallerIDName: "Idris",
        Exten: "2348099882211",
        Context: "from-internal",
        ChannelState: "0",
        ChannelStateDesc: "Down",
        AccountCode: "northwind",
      },
    });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].direction).toBe("outbound");
    expect(state.calls[0].trunk).toBe("telnyx-us");
    state = reduceAmi(state, {
      headers: {
        Event: "Newstate",
        Channel: "PJSIP/telnyx-us-0000002b",
        Uniqueid: "1730.2",
        CallerIDNum: "1004",
        Exten: "2348099882211",
        Context: "from-internal",
        ChannelStateDesc: "Up",
      },
    });
    expect(state.calls[0].state).toBe("up");
    expect(state.calls[0].answeredAt).not.toBeNull();
    state = reduceAmi(state, { headers: { Event: "Registry", Username: "telnyx-us", Domain: "sip.telnyx.com", Status: "Registered" } });
    expect(state.trunks[0].status).toBe("registered");
    state = reduceAmi(state, { headers: { Event: "Hangup", Uniqueid: "1730.2", Cause: "16" } });
    expect(state.calls).toHaveLength(0);
  });
});
