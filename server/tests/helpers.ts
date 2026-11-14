import { buildApp, type AppOptions } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { DemoConnector } from "../src/connectors/demo/adapter.js";
import type { FastifyInstance } from "fastify";

export const FROZEN = new Date("2026-11-14T15:00:00.000Z");

export function testConfig(extra: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    SOURCE: "demo",
    TIMEZONE: "UTC",
    SIM_TICK_MS: "0",
    SIM_SEED: "20261114",
    SESSION_SECRET: "test-secret",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "span-demo-admin",
    VIEWER_USERNAME: "viewer",
    VIEWER_PASSWORD: "span-demo-viewer",
    LOW_BALANCE: "5",
    LOG_LEVEL: "silent",
    ...extra,
  });
}

export async function demoApp(): Promise<{ app: FastifyInstance; connector: DemoConnector; config: Config }> {
  const config = testConfig();
  const connector = new DemoConnector({ seed: 20261114, tickMs: 0, timeZone: "UTC", now: () => FROZEN });
  const app = await buildApp({ config, connector } satisfies AppOptions);
  return { app, connector, config };
}

export async function login(app: FastifyInstance, username: string, password: string): Promise<Record<string, string>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { username, password },
  });
  const header = response.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new Error(`no cookie on login (${response.statusCode}) ${response.body}`);
  const [pair] = raw.split(";");
  const eq = pair.indexOf("=");
  return { [pair.slice(0, eq)]: pair.slice(eq + 1) };
}
