import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ByteStream } from "../src/connectors/ami/tcp.js";
import { AriClient } from "../src/connectors/ari/client.js";
import { LiveConnector } from "../src/connectors/live.js";
import type { MagnusClient } from "../src/connectors/magnus/client.js";

function liveEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SOURCE: "live",
    TIMEZONE: "UTC",
    SESSION_SECRET: "not-the-demo-secret",
    LOG_LEVEL: "silent",
    ...extra,
  };
}

function scriptedSocket(onWrite: (payload: string, push: (frame: string) => void) => void): ByteStream {
  let onData: (chunk: string) => void = () => undefined;
  let onClose: (error?: Error) => void = () => undefined;
  return {
    write(data) {
      onWrite(data, (frame) => onData(frame));
    },
    onData(cb) {
      onData = cb;
    },
    onClose(cb) {
      onClose = cb;
    },
    end() {
      onClose();
    },
  };
}

function amiSocket(hangup: "ok" | "error", hangups: { n: number }): ByteStream {
  return scriptedSocket((payload, push) => {
    const id = /ActionID: (\S+)/.exec(payload)?.[1] ?? "";
    const action = /Action: (\S+)/.exec(payload)?.[1];
    if (action === "Login") {
      push(`Response: Success\r\nActionID: ${id}\r\nMessage: Authentication accepted\r\n\r\n`);
      return;
    }
    if (action === "CoreShowChannels") {
      push(
        `Event: CoreShowChannel\r\nActionID: ${id}\r\nChannel: PJSIP/telnyx-us-0000002b\r\nUniqueid: call-1\r\nCallerIDNum: 1004\r\nCallerIDName: Idris\r\nConnectedLineNum: 2348099882211\r\nContext: from-internal\r\nChannelStateDesc: Up\r\n\r\n`,
      );
      push(`Event: CoreShowChannelsComplete\r\nActionID: ${id}\r\n\r\n`);
      return;
    }
    if (action === "Hangup") {
      hangups.n += 1;
      const response = hangup === "error" ? "Error" : "Success";
      const message = hangup === "error" ? "No such channel" : "Channel hung up";
      push(`Response: ${response}\r\nActionID: ${id}\r\nMessage: ${message}\r\n\r\n`);
      return;
    }
    push(`Response: Error\r\nActionID: ${id}\r\nMessage: No such command\r\n\r\n`);
  });
}

describe("live connector", () => {
  it("keeps the board up when Magnus is down and refuses a refill with no billing connector", async () => {
    const magnus = {
      listCustomers: async () => {
        throw new Error("down");
      },
      listSip: async () => [],
      listTrunks: async () => [],
      listRates: async () => [],
      listCdr: async () => [],
      refill: async () => undefined,
    } as unknown as MagnusClient;
    const down = new LiveConnector(
      loadConfig(liveEnv({
        MAGNUS_URL: "https://billing.example/mbilling/index.php",
        MAGNUS_API_KEY: "key",
        MAGNUS_API_SECRET: "secret",
        NODE_ENV: "production",
      })),
      { magnus },
    );
    await down.start();
    expect(down.warnings().join(" ")).toMatch(/MagnusBilling customers: down/);
    expect(down.getCustomers()).toEqual([]);
    await down.stop();

    const cdrOnly = new LiveConnector(
      loadConfig(liveEnv({ CDR_HOST: "127.0.0.1", CDR_USER: "span", CDR_PASSWORD: "secret" })),
      { loadCdr: async () => ({ cdrs: [], cel: [] }) },
    );
    const refused = await cdrOnly.refill("2", 10, "desk", "admin");
    expect(refused).toEqual({ ok: false, status: 409, message: "MagnusBilling is not configured." });
    const missing = await cdrOnly.hangup("call-1", "admin");
    expect(missing).toMatchObject({ ok: false, status: 404 });
  });

  it("re-reads a customer after a Magnus refill", async () => {
    let credit = 1.2;
    const magnus = {
      listCustomers: async () => [
        {
          id: "2",
          username: "harbor-clinic",
          name: "Harbor Clinic",
          email: "ops@harbor.example",
          credit,
          currency: "USD",
          active: true,
          sipUsers: 0,
          lastRefillAt: null,
          lastRefillAmount: null,
        },
      ],
      listSip: async () => [],
      listTrunks: async () => [],
      listRates: async () => [],
      listCdr: async () => [],
      refill: async (_id: string, amount: number) => {
        credit += amount;
      },
    } as unknown as MagnusClient;
    const connector = new LiveConnector(
      loadConfig(liveEnv({
        MAGNUS_URL: "https://billing.example/mbilling/index.php",
        MAGNUS_API_KEY: "key",
        MAGNUS_API_SECRET: "secret",
      })),
      { magnus },
    );
    await connector.start();
    const result = await connector.refill("2", 10, "cash desk", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.credit).toBeCloseTo(11.2);
    expect(connector.getRefills()[0]).toMatchObject({ by: "admin", amount: 10, description: "cash desk" });
    expect(await connector.refill("missing", 10, "cash desk", "admin")).toMatchObject({ ok: false, status: 404 });
    await connector.stop();
  });

  it("hangs up through ARI first and falls back to AMI", async () => {
    const hangups = { n: 0 };
    const config = loadConfig(liveEnv({
      AMI_HOST: "127.0.0.1",
      AMI_SECRET: "lab-secret",
      AMI_RECONNECT_MS: "500",
      ARI_URL: "http://127.0.0.1:8088",
      ARI_USERNAME: "span",
      ARI_PASSWORD: "ari-secret",
    }));
    const ari = {
      hangup: async () => {
        throw new Error("ARI down");
      },
    } as unknown as AriClient;
    const connector = new LiveConnector(config, {
      ari,
      connect: async () => amiSocket("ok", hangups),
    });
    await connector.start();
    await vi.waitFor(() => {
      if (connector.getCalls().length !== 1) throw new Error("channel not up yet");
    });
    const result = await connector.hangup("call-1", "admin");
    expect(result).toEqual({ ok: true, value: { id: "call-1" } });
    expect(hangups.n).toBe(1);
    expect(connector.getCalls()).toHaveLength(0);
    await connector.stop();
  });

  it("returns 502 when AMI refuses, and prefers ARI when that hangup succeeds", async () => {
    const failures = { n: 0 };
    const config = loadConfig(liveEnv({ AMI_HOST: "127.0.0.1", AMI_SECRET: "lab-secret", AMI_RECONNECT_MS: "500" }));
    const failing = new LiveConnector(config, { connect: async () => amiSocket("error", failures) });
    await failing.start();
    await vi.waitFor(() => {
      if (failing.getCalls().length !== 1) throw new Error("channel not up yet");
    });
    const refused = await failing.hangup("call-1", "admin");
    expect(refused).toMatchObject({ ok: false, status: 502 });
    expect(failing.getCalls()).toHaveLength(1);
    await failing.stop();

    const cleared = { n: 0 };
    let ariCalled = 0;
    const withAri = new LiveConnector(
      loadConfig(liveEnv({
        AMI_HOST: "127.0.0.1",
        AMI_SECRET: "lab-secret",
        AMI_RECONNECT_MS: "500",
        ARI_URL: "http://127.0.0.1:8088",
        ARI_USERNAME: "span",
        ARI_PASSWORD: "ari-secret",
      })),
      {
        connect: async () => amiSocket("ok", cleared),
        ari: { hangup: async () => { ariCalled += 1; } } as unknown as AriClient,
      },
    );
    await withAri.start();
    await vi.waitFor(() => {
      if (withAri.getCalls().length !== 1) throw new Error("channel not up yet");
    });
    expect(await withAri.hangup("call-1", "admin")).toEqual({ ok: true, value: { id: "call-1" } });
    expect(ariCalled).toBe(1);
    expect(cleared.n).toBe(0);
    await withAri.stop();
  });
});
