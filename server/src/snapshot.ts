import type { Config } from "./config.js";
import type { Analytics, Customer, Extension, LiveCall, QueueStat, Trunk } from "./domain/types.js";
import { analyze, filterCdrs } from "./domain/analytics.js";
import { dayKey } from "./domain/time.js";
import type { TelephonyConnector } from "./connectors/types.js";

export interface Overview extends Analytics {
  liveCalls: number;
  ringing: number;
  trunksUp: number;
  trunksTotal: number;
  lowBalance: Customer[];
  lowBalanceCount: number;
  queues: QueueStat[];
  warnings: string[];
}

export interface Snapshot {
  type: "snapshot";
  revision: number;
  source: "demo" | "live";
  timezone: string;
  generatedAt: string;
  overview: Overview;
  calls: LiveCall[];
  trunks: Trunk[];
  extensions: Extension[];
  queues: QueueStat[];
}

export function buildOverview(connector: TelephonyConnector, config: Config): Overview {
  const today = dayKey(connector.now().toISOString(), config.timezone);
  const cdrs = filterCdrs(connector.getCdrs(), { from: today, to: today }, config.timezone);
  const analytics = analyze(cdrs, config.timezone);
  const calls = connector.getCalls();
  const trunks = connector.getTrunks();
  const lowBalance = connector
    .getCustomers()
    .filter((customer) => customer.active && customer.credit < config.lowBalance)
    .sort((a, b) => a.credit - b.credit);
  return {
    ...analytics,
    liveCalls: calls.length,
    ringing: calls.filter((call) => call.state === "ringing").length,
    trunksUp: trunks.filter((trunk) => trunk.status === "registered").length,
    trunksTotal: trunks.length,
    lowBalance,
    lowBalanceCount: lowBalance.length,
    queues: connector.getQueues(),
    warnings: connector.warnings(),
  };
}

export function buildSnapshot(connector: TelephonyConnector, config: Config): Snapshot {
  return {
    type: "snapshot",
    revision: connector.revision(),
    source: connector.source,
    timezone: config.timezone,
    generatedAt: connector.now().toISOString(),
    overview: buildOverview(connector, config),
    calls: connector.getCalls(),
    trunks: connector.getTrunks(),
    extensions: connector.getExtensions(),
    queues: connector.getQueues(),
  };
}
