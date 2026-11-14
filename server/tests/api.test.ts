import { describe, expect, it } from "vitest";
import { applyEnvFile, loadConfig } from "../src/config.js";
import { securityChecklist } from "../src/tools/checklist.js";
import { renderDialplan } from "../src/tools/dialplan.js";
import { renderSip } from "../src/tools/sip.js";
import { demoApp, login } from "./helpers.js";

describe("config", () => {
  it("lets an existing variable win over the env file", () => {
    const env: NodeJS.ProcessEnv = { SOURCE: "demo" };
    applyEnvFile("# comment\nSOURCE=live\nPORT=9090\nQUOTED=\"ok\"\n", env);
    expect(env.SOURCE).toBe("demo");
    expect(env.PORT).toBe("9090");
    expect(env.QUOTED).toBe("ok");
  });

  it("rejects an unknown source and a live mode with nothing to connect to", () => {
    expect(() => loadConfig({ SOURCE: "pbx" })).toThrow(/SOURCE/);
    expect(() => loadConfig({ SOURCE: "live" })).toThrow(/at least one/);
    expect(() => loadConfig({ TIMEZONE: "Mars/Olympus" })).toThrow(/TIMEZONE/);
    expect(() => loadConfig({ SOURCE: "live", AMI_HOST: "127.0.0.1" })).toThrow(/AMI_SECRET/);
  });
});

describe("tools", () => {
  it("renders a PJSIP trunk and refuses a name that would inject a section", () => {
    const snippet = renderSip({
      provider: "telnyx",
      format: "pjsip",
      name: "telnyx-us",
      username: "acct1",
      password: "correct-horse",
    });
    expect(snippet.filename).toBe("pjsip_custom.conf");
    expect(snippet.text).toContain("type=registration");
    expect(snippet.text).toContain("password=correct-horse");
    expect(snippet.text).toContain("sip.telnyx.com");
    expect(() => renderSip({ provider: "telnyx", format: "pjsip", name: "bad\n[evil]", username: "acct1", password: "correct-horse" })).toThrow(/Trunk name/);
    expect(() => renderSip({ provider: "custom", format: "pjsip", name: "edge", username: "acct1", password: "short", host: "sip.example.com" })).toThrow(/Password/);
  });

  it("renders a dialplan snippet and a checklist that stays on the operator's own host", () => {
    const text = renderDialplan({ did: "442079460958", extension: "2001", outboundPrefix: "9", strip: 1, trunk: "voipms-east", callerId: "+442079460958" });
    expect(text).toContain("exten => 442079460958,1,NoOp");
    expect(text).toContain("Dial(PJSIP/${EXTEN:1}@voipms-east,60)");
    expect(text).toContain("extensions_custom.conf");
    expect(() => renderDialplan({ did: "4420;system", extension: "2001", outboundPrefix: "9", strip: 0, trunk: "voipms-east" })).toThrow(/DID/);
    const items = securityChecklist();
    expect(items.map((item) => item.id)).toContain("fail2ban");
    expect(items.map((item) => item.id)).toContain("cdr-user");
    expect(items.some((item) => /exploit|payload|0day/i.test(item.check))).toBe(false);
  });
});

describe("HTTP API", () => {
  it("serves health without a session and hides the floor until login", async () => {
    const { app } = await demoApp();
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", source: "demo", liveCalls: 4, lowBalance: 3, trunksUp: 3 });
    const hidden = await app.inject({ method: "GET", url: "/api/overview" });
    expect(hidden.statusCode).toBe(401);
    await app.close();
  });

  it("returns the opening overview to an admin", async () => {
    const { app } = await demoApp();
    const cookies = await login(app, "admin", "span-demo-admin");
    const overview = await app.inject({ method: "GET", url: "/api/overview", cookies });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      asr: 63.6,
      acdSeconds: 128.1,
      offered: 22,
      answered: 14,
      liveCalls: 4,
      ringing: 1,
      trunksUp: 3,
      trunksTotal: 5,
      lowBalanceCount: 3,
    });
    const me = await app.inject({ method: "GET", url: "/api/me", cookies });
    expect(me.json()).toMatchObject({ username: "admin", role: "admin", source: "demo" });
    await app.close();
  });

  it("lets an admin hang up and refill, and refuses a viewer", async () => {
    const { app } = await demoApp();
    const admin = await login(app, "admin", "span-demo-admin");
    const viewer = await login(app, "viewer", "span-demo-viewer");
    const denied = await app.inject({ method: "POST", url: "/api/calls/call-ng-1004/hangup", cookies: viewer });
    expect(denied.statusCode).toBe(403);
    const refillDenied = await app.inject({
      method: "POST",
      url: "/api/customers/2/refill",
      cookies: viewer,
      payload: { amount: 10, description: "nope" },
    });
    expect(refillDenied.statusCode).toBe(403);
    const hung = await app.inject({ method: "POST", url: "/api/calls/call-ng-1004/hangup", cookies: admin });
    expect(hung.statusCode).toBe(200);
    const calls = await app.inject({ method: "GET", url: "/api/calls", cookies: admin });
    expect(calls.json().calls.some((row: { id: string }) => row.id === "call-ng-1004")).toBe(false);
    const bad = await app.inject({
      method: "POST",
      url: "/api/customers/2/refill",
      cookies: admin,
      payload: { amount: 10.555, description: "cash" },
    });
    expect(bad.statusCode).toBe(400);
    const refill = await app.inject({
      method: "POST",
      url: "/api/customers/2/refill",
      cookies: admin,
      payload: { amount: 10, description: "cash desk" },
    });
    expect(refill.statusCode).toBe(200);
    expect(refill.json().credit).toBe(11.2);
    await app.close();
  });

  it("filters CDR rows and exports CSV", async () => {
    const { app } = await demoApp();
    const cookies = await login(app, "viewer", "span-demo-viewer");
    const cdr = await app.inject({ method: "GET", url: "/api/cdr?account=northwind&destination=Nigeria", cookies });
    expect(cdr.statusCode).toBe(200);
    const body = cdr.json();
    expect(body.total).toBe(3);
    expect(body.analytics.answered).toBe(2);
    expect(body.cel.length).toBeGreaterThan(0);
    const csv = await app.inject({ method: "GET", url: "/api/cdr/export?account=northwind", cookies });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body.split("\n").length).toBeGreaterThan(3);
    const badLogin = await app.inject({ method: "POST", url: "/api/login", payload: { username: "admin", password: "nope" } });
    expect(badLogin.statusCode).toBe(401);
    await app.close();
  });

  it("rate-limits repeated bad passwords", async () => {
    const { app } = await demoApp();
    for (let i = 0; i < 8; i += 1) {
      const response = await app.inject({ method: "POST", url: "/api/login", payload: { username: "admin", password: "wrong" } });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: "POST", url: "/api/login", payload: { username: "admin", password: "wrong" } });
    expect(limited.statusCode).toBe(429);
    await app.close();
  });
});
