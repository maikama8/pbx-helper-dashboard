import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTimeZone } from "./domain/time.js";

/** Repo root from either `server/src` (tsx) or `server/dist` (node). */
export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

/** Fill keys that are not already set. Existing environment variables win. */
export function applyEnvFile(text: string, env: NodeJS.ProcessEnv): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}

export function loadEnvFile(env: NodeJS.ProcessEnv = process.env, file = path.join(repoRoot(), ".env")): void {
  if (!existsSync(file)) return;
  applyEnvFile(readFileSync(file, "utf8"), env);
}

export interface AmiConfig {
  host: string;
  port: number;
  username: string;
  secret: string;
  reconnectMs: number;
}

export interface AriConfig {
  url: string;
  username: string;
  password: string;
}

export interface MagnusConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface FreePbxConfig {
  url: string;
  token: string;
}

export interface CdrMysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface Config {
  host: string;
  port: number;
  source: "demo" | "live";
  timezone: string;
  sessionSecret: string;
  adminUsername: string;
  adminPassword: string;
  viewerUsername: string;
  viewerPassword: string;
  cookieSecure: boolean;
  lowBalance: number;
  simTickMs: number;
  simSeed: number;
  webDist: string | null;
  logLevel: string;
  ami: AmiConfig | null;
  ari: AriConfig | null;
  magnus: MagnusConfig | null;
  freepbx: FreePbxConfig | null;
  cdrMysql: CdrMysqlConfig | null;
}

function required(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  if (value === undefined || value === "") return fallback;
  return value;
}

function optional(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

function intValue(raw: string, key: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export const DEMO_ADMIN_PASSWORD = "span-demo-admin";
export const DEMO_VIEWER_PASSWORD = "span-demo-viewer";
export const DEMO_SESSION_SECRET = "span-dev-secret-change-me";

export function usingDemoSecrets(config: Config): string[] {
  const notes: string[] = [];
  if (config.adminPassword === DEMO_ADMIN_PASSWORD) notes.push("ADMIN_PASSWORD is the demo value");
  if (config.viewerPassword === DEMO_VIEWER_PASSWORD) notes.push("VIEWER_PASSWORD is the demo value");
  if (config.sessionSecret === DEMO_SESSION_SECRET) notes.push("SESSION_SECRET is the demo value");
  return notes;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const source = required(env, "SOURCE", "demo");
  if (source !== "demo" && source !== "live") {
    throw new Error("SOURCE must be demo or live");
  }
  const timezone = assertTimeZone(required(env, "TIMEZONE", "UTC"));
  const lowBalance = Number(required(env, "LOW_BALANCE", "5"));
  if (!Number.isFinite(lowBalance) || lowBalance < 0) {
    throw new Error("LOW_BALANCE must be a number >= 0");
  }
  const simTickMs = intValue(required(env, "SIM_TICK_MS", "1500"), "SIM_TICK_MS", 0, 60_000);
  if (simTickMs !== 0 && simTickMs < 200) {
    throw new Error("SIM_TICK_MS must be 0 (frozen) or at least 200");
  }
  const simSeed = intValue(required(env, "SIM_SEED", "20261114"), "SIM_SEED", 1, 2_147_483_647);
  const port = intValue(required(env, "PORT", "8080"), "PORT", 1, 65535);
  const adminUsername = required(env, "ADMIN_USERNAME", "admin");
  const viewerUsername = required(env, "VIEWER_USERNAME", "viewer");
  if (adminUsername === viewerUsername) {
    throw new Error("ADMIN_USERNAME and VIEWER_USERNAME must differ");
  }
  const sessionSecret = required(env, "SESSION_SECRET", DEMO_SESSION_SECRET);
  if (env.NODE_ENV === "production" && sessionSecret === DEMO_SESSION_SECRET && source === "live") {
    throw new Error("Set SESSION_SECRET before running SOURCE=live with NODE_ENV=production");
  }

  const amiHost = optional(env, "AMI_HOST");
  const amiSecret = optional(env, "AMI_SECRET");
  const amiUsername = optional(env, "AMI_USERNAME") || "span";
  let ami: AmiConfig | null = null;
  if (amiHost || amiSecret) {
    if (!amiHost || !amiSecret) throw new Error("AMI_HOST and AMI_SECRET are both required to enable AMI");
    ami = {
      host: amiHost,
      port: intValue(required(env, "AMI_PORT", "5038"), "AMI_PORT", 1, 65535),
      username: amiUsername,
      secret: amiSecret,
      reconnectMs: intValue(required(env, "AMI_RECONNECT_MS", "5000"), "AMI_RECONNECT_MS", 500, 120_000),
    };
  }

  const ariUrl = optional(env, "ARI_URL");
  const ariUser = optional(env, "ARI_USERNAME");
  const ariPassword = optional(env, "ARI_PASSWORD");
  let ari: AriConfig | null = null;
  if (ariUrl || ariUser || ariPassword) {
    if (!ariUrl || !ariUser || !ariPassword) {
      throw new Error("ARI_URL, ARI_USERNAME, and ARI_PASSWORD are all required to enable ARI");
    }
    ari = { url: ariUrl.replace(/\/$/, ""), username: ariUser, password: ariPassword };
  }

  const magnusUrl = optional(env, "MAGNUS_URL");
  const magnusKey = optional(env, "MAGNUS_API_KEY");
  const magnusSecret = optional(env, "MAGNUS_API_SECRET");
  let magnus: MagnusConfig | null = null;
  if (magnusUrl || magnusKey || magnusSecret) {
    if (!magnusUrl || !magnusKey || !magnusSecret) {
      throw new Error("MAGNUS_URL, MAGNUS_API_KEY, and MAGNUS_API_SECRET are all required");
    }
    magnus = { url: magnusUrl.replace(/\/$/, ""), apiKey: magnusKey, apiSecret: magnusSecret };
  }

  const fbxUrl = optional(env, "FREEPBX_GRAPHQL_URL");
  const fbxToken = optional(env, "FREEPBX_TOKEN");
  let freepbx: FreePbxConfig | null = null;
  if (fbxUrl || fbxToken) {
    if (!fbxUrl || !fbxToken) throw new Error("FREEPBX_GRAPHQL_URL and FREEPBX_TOKEN are both required");
    freepbx = { url: fbxUrl, token: fbxToken };
  }

  const cdrHost = optional(env, "CDR_HOST");
  let cdrMysql: CdrMysqlConfig | null = null;
  if (cdrHost) {
    const password = optional(env, "CDR_PASSWORD");
    const user = optional(env, "CDR_USER");
    if (!user || !password) throw new Error("CDR_USER and CDR_PASSWORD are required when CDR_HOST is set");
    cdrMysql = {
      host: cdrHost,
      port: intValue(required(env, "CDR_PORT", "3306"), "CDR_PORT", 1, 65535),
      user,
      password,
      database: required(env, "CDR_DATABASE", "asteriskcdrdb"),
    };
  }

  if (source === "live" && !ami && !magnus && !freepbx && !cdrMysql) {
    throw new Error("SOURCE=live needs at least one of AMI, MagnusBilling, FreePBX, or CDR MySQL");
  }

  const webDist = optional(env, "WEB_DIST");
  const logLevel = required(env, "LOG_LEVEL", "info");
  if (!["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(logLevel)) {
    throw new Error("LOG_LEVEL is not a recognised level");
  }

  return {
    host: required(env, "HOST", "0.0.0.0"),
    port,
    source,
    timezone,
    sessionSecret,
    adminUsername,
    adminPassword: required(env, "ADMIN_PASSWORD", DEMO_ADMIN_PASSWORD),
    viewerUsername,
    viewerPassword: required(env, "VIEWER_PASSWORD", DEMO_VIEWER_PASSWORD),
    cookieSecure: required(env, "COOKIE_SECURE", "0") === "1",
    lowBalance,
    simTickMs,
    simSeed,
    webDist: webDist || null,
    logLevel,
    ami,
    ari,
    magnus,
    freepbx,
    cdrMysql,
  };
}
