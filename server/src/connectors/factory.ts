import type { Config } from "../config.js";
import { DemoConnector } from "./demo/adapter.js";
import { LiveConnector } from "./live.js";
import type { TelephonyConnector } from "./types.js";

/** Demo floor when `SOURCE=demo`, otherwise the live connector. */
export function createConnector(config: Config, now?: () => Date): TelephonyConnector {
  if (config.source === "demo") return DemoConnector.fromConfig(config, now);
  return new LiveConnector(config);
}
