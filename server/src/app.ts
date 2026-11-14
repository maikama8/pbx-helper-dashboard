import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { authenticate, clearSession, LoginLimiter, readSession, writeSession, type Session } from "./auth.js";
import type { Config } from "./config.js";
import type { TelephonyConnector } from "./connectors/types.js";
import { analyze, filterCdrs, type CdrFilter } from "./domain/analytics.js";
import { cdrToCsv } from "./domain/csv.js";
import { clampInt, parseAmount, parseDescription } from "./domain/validate.js";
import { buildOverview, buildSnapshot } from "./snapshot.js";
import { securityChecklist } from "./tools/checklist.js";
import { renderDialplan } from "./tools/dialplan.js";
import { natAndCodecTips } from "./tools/nat.js";
import { PROVIDERS, renderSip, type SipInput } from "./tools/sip.js";

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}

export interface AppOptions {
  config: Config;
  connector: TelephonyConnector;
  logger?: boolean | object;
}

const DISPOSITIONS = new Set(["ANSWERED", "NO ANSWER", "BUSY", "FAILED", "CONGESTION"]);

function queryFilter(query: Record<string, unknown>): CdrFilter {
  const disposition = typeof query.disposition === "string" ? query.disposition : undefined;
  return {
    from: typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : undefined,
    to: typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : undefined,
    account: typeof query.account === "string" && query.account ? query.account : undefined,
    disposition: disposition && DISPOSITIONS.has(disposition) ? disposition : undefined,
    destination: typeof query.destination === "string" && query.destination ? query.destination : undefined,
    q: typeof query.q === "string" && query.q ? query.q : undefined,
  };
}

function requireUser(request: FastifyRequest, reply: FastifyReply): Session | null {
  if (!request.session) {
    reply.code(401).send({ error: "unauthorized", message: "Sign in." });
    return null;
  }
  return request.session;
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): Session | null {
  const session = requireUser(request, reply);
  if (!session) return null;
  if (session.role !== "admin") {
    reply.code(403).send({ error: "read_only", message: "This account cannot change the switch." });
    return null;
  }
  return session;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config, connector } = options;
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const limiter = new LoginLimiter();
  await app.register(cookie);
  await app.register(websocket);
  app.decorateRequest("session", null);

  app.addHook("onRequest", async (request) => {
    request.session = readSession(request, config);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api")) reply.header("cache-control", "no-store");
    return payload;
  });

  app.get("/api/health", async () => {
    const trunks = connector.getTrunks();
    return {
      status: connector.warnings().length > 0 ? "degraded" : "ok",
      source: connector.source,
      timezone: config.timezone,
      liveCalls: connector.getCalls().length,
      trunks: trunks.length,
      trunksUp: trunks.filter((trunk) => trunk.status === "registered").length,
      customers: connector.getCustomers().length,
      lowBalance: connector.getCustomers().filter((row) => row.active && row.credit < config.lowBalance).length,
      warnings: connector.warnings(),
    };
  });

  app.post("/api/login", async (request, reply) => {
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const key = request.ip || "local";
    if (limiter.blocked(key)) {
      return reply.code(429).send({ error: "rate_limited", message: "Too many sign-in attempts. Wait a few minutes." });
    }
    const session = authenticate(username, password, config);
    if (!session) {
      limiter.failure(key);
      return reply.code(401).send({ error: "invalid_login", message: "Unknown username or password." });
    }
    limiter.success(key);
    writeSession(reply, session, config);
    return { username: session.sub, role: session.role };
  });

  app.post("/api/logout", async (request, reply) => {
    clearSession(reply, config);
    return { ok: true };
  });

  app.get("/api/me", async (request, reply) => {
    const session = requireUser(request, reply);
    if (!session) return;
    return { username: session.sub, role: session.role, source: connector.source };
  });

  app.get("/api/snapshot", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return buildSnapshot(connector, config);
  });

  app.get("/api/overview", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return buildOverview(connector, config);
  });

  app.get("/api/calls", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { calls: connector.getCalls() };
  });

  app.post("/api/calls/:id/hangup", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const result = await connector.hangup(id, session.sub);
    if (!result.ok) return reply.code(result.status).send({ error: "hangup_failed", message: result.message });
    return result.value;
  });

  app.get("/api/trunks", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { trunks: connector.getTrunks() };
  });

  app.get("/api/extensions", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { extensions: connector.getExtensions() };
  });

  app.get("/api/queues", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { queues: connector.getQueues() };
  });

  app.get("/api/customers", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const customers = connector.getCustomers();
    const lowBalance = customers.filter((row) => row.active && row.credit < config.lowBalance);
    return { threshold: config.lowBalance, customers, refills: connector.getRefills(), lowBalance: lowBalance.length };
  });

  app.post("/api/customers/:id/refill", async (request, reply) => {
    const session = requireAdmin(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { amount?: unknown; description?: unknown };
    const amount = parseAmount(body.amount);
    const description = parseDescription(body.description);
    if (amount === null) return reply.code(400).send({ error: "bad_amount", message: "Amount must be from 0.01 to 100000, with at most two decimal places." });
    if (!description) return reply.code(400).send({ error: "bad_description", message: "Description must be 1-80 characters." });
    const result = await connector.refill(id, amount, description, session.sub);
    if (!result.ok) return reply.code(result.status).send({ error: "refill_failed", message: result.message });
    return result.value;
  });

  app.get("/api/rates", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { rates: connector.getRates() };
  });

  app.get("/api/cdr", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const query = request.query as Record<string, unknown>;
    const filter = queryFilter(query);
    const filtered = filterCdrs(connector.getCdrs(), filter, config.timezone);
    const limit = clampInt(query.limit, 50, 1, 500);
    const offset = clampInt(query.offset, 0, 0, 100_000);
    return {
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
      analytics: analyze(filtered, config.timezone),
      cel: connector.getCel(),
    };
  });

  app.get("/api/cdr/export", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const filter = queryFilter(request.query as Record<string, unknown>);
    const filtered = filterCdrs(connector.getCdrs(), filter, config.timezone).slice(0, 5000);
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", "attachment; filename=\"cdr.csv\"")
      .send(cdrToCsv(filtered));
  });

  app.get("/api/tools/providers", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { providers: PROVIDERS };
  });

  app.post("/api/tools/sip", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    try {
      return renderSip((request.body ?? {}) as SipInput);
    } catch (error) {
      return reply.code(400).send({ error: "bad_sip", message: error instanceof Error ? error.message : "Could not build the snippet." });
    }
  });

  app.post("/api/tools/dialplan", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const body = (request.body ?? {}) as {
      did?: unknown;
      extension?: unknown;
      outboundPrefix?: unknown;
      strip?: unknown;
      trunk?: unknown;
      callerId?: unknown;
    };
    try {
      const text = renderDialplan({
        did: String(body.did ?? ""),
        extension: String(body.extension ?? ""),
        outboundPrefix: String(body.outboundPrefix ?? ""),
        strip: Number(body.strip ?? 0),
        trunk: String(body.trunk ?? ""),
        callerId: typeof body.callerId === "string" ? body.callerId : undefined,
      });
      return { filename: "extensions_custom.conf", text };
    } catch (error) {
      return reply.code(400).send({ error: "bad_dialplan", message: error instanceof Error ? error.message : "Could not build the snippet." });
    }
  });

  app.get("/api/tools/checklist", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { items: securityChecklist() };
  });

  app.get("/api/tools/nat", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { tips: natAndCodecTips() };
  });

  app.get("/ws", { websocket: true }, (socket, request) => {
    const session = readSession(request, config);
    if (!session) {
      socket.close(1008, "unauthorized");
      return;
    }
    const send = () => {
      if (socket.readyState === 1) socket.send(JSON.stringify(buildSnapshot(connector, config)));
    };
    send();
    const unsubscribe = connector.subscribe(send);
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  if (config.webDist) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (request.method !== "GET") return reply.code(404).send({ error: "not_found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
