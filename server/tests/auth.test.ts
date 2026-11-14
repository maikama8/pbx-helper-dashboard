import { describe, expect, it } from "vitest";
import { authenticate, LoginLimiter, openSession, passwordsMatch, seal } from "../src/auth.js";
import { testConfig } from "./helpers.js";

describe("session cookie", () => {
  const secret = "test-secret";

  it("opens a sealed session and rejects a tampered or expired token", () => {
    const token = seal({ sub: "admin", role: "admin", exp: 2_000_000_000 }, secret);
    expect(openSession(token, secret, 1_700_000_000_000)?.sub).toBe("admin");
    expect(openSession(token, "other-secret", 1_700_000_000_000)).toBeNull();
    expect(openSession(`${token}x`, secret)).toBeNull();
    expect(openSession("not-a-token", secret)).toBeNull();
    expect(openSession(token, secret, 2_000_000_000_001)).toBeNull();
    const forged = seal({ sub: "admin", role: "owner" as "admin", exp: 2_000_000_000 }, secret);
    expect(openSession(forged, secret, 1_700_000_000_000)).toBeNull();
  });

  it("matches a password of a different length without throwing", () => {
    expect(passwordsMatch("span-demo-admin", "span-demo-admin")).toBe(true);
    expect(passwordsMatch("nope", "span-demo-admin")).toBe(false);
    const session = authenticate("viewer", "span-demo-viewer", testConfig());
    expect(session?.role).toBe("viewer");
    expect(authenticate("viewer", "wrong", testConfig())).toBeNull();
  });
});

describe("login limiter", () => {
  it("blocks an address after the budget and clears it on success or after the window", () => {
    const limiter = new LoginLimiter(2, 1_000);
    expect(limiter.blocked("10.0.0.8", 0)).toBe(false);
    limiter.failure("10.0.0.8", 0);
    limiter.failure("10.0.0.8", 10);
    expect(limiter.blocked("10.0.0.8", 20)).toBe(true);
    expect(limiter.blocked("10.0.0.8", 2_000)).toBe(false);
    limiter.failure("10.0.0.8", 3_000);
    limiter.success("10.0.0.8");
    expect(limiter.blocked("10.0.0.8", 3_100)).toBe(false);
  });
});
