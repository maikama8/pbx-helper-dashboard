import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Role } from "./domain/types.js";

export interface Session {
  sub: string;
  role: Role;
  exp: number;
}

export const SESSION_COOKIE = "span.sid";

export function passwordsMatch(input: string, expected: string): boolean {
  const left = crypto.createHash("sha256").update(input).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export function seal(session: Session, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openSession(token: string, secret: string, now = Date.now()): Session | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (typeof parsed.sub !== "string" || (parsed.role !== "admin" && parsed.role !== "viewer")) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function authenticate(username: string, password: string, config: Config): Session | null {
  const accounts = [
    { username: config.adminUsername, password: config.adminPassword, role: "admin" as const },
    { username: config.viewerUsername, password: config.viewerPassword, role: "viewer" as const },
  ];
  const account = accounts.find((row) => row.username === username);
  if (!account || !passwordsMatch(password, account.password)) return null;
  return { sub: account.username, role: account.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 };
}

export function readSession(request: FastifyRequest, config: Config): Session | null {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  return openSession(token, config.sessionSecret);
}

export function writeSession(reply: FastifyReply, session: Session, config: Config): void {
  reply.setCookie(SESSION_COOKIE, seal(session, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
    maxAge: 60 * 60 * 12,
  });
}

export function clearSession(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", secure: config.cookieSecure });
}

interface Attempt {
  fails: number;
  resetAt: number;
}

/** Eight failures in ten minutes, then 429. A success clears the address. */
export class LoginLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly maxFails = 8,
    private readonly windowMs = 10 * 60 * 1000,
  ) {}

  blocked(key: string, now = Date.now()): boolean {
    const row = this.attempts.get(key);
    if (!row) return false;
    if (row.resetAt < now) {
      this.attempts.delete(key);
      return false;
    }
    return row.fails >= this.maxFails;
  }

  failure(key: string, now = Date.now()): void {
    const row = this.attempts.get(key);
    if (!row || row.resetAt < now) {
      this.attempts.set(key, { fails: 1, resetAt: now + this.windowMs });
      return;
    }
    row.fails += 1;
  }

  success(key: string): void {
    this.attempts.delete(key);
  }
}
