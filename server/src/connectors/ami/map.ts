import type { CallDirection, CallState, ExtensionStatus, TrunkStatus } from "../../domain/types.js";
import type { AmiHeaders } from "./parser.js";

export interface ChannelObservation {
  id: string;
  channel: string;
  caller: string;
  callerName: string;
  destination: string;
  direction: CallDirection;
  state: CallState;
  account: string | null;
}

export interface PeerObservation {
  name: string;
  kind: "ok" | "lagged" | "unreachable" | "unmonitored" | "unknown";
  rttMs: number | null;
  address: string | null;
  status: ExtensionStatus;
}

export interface RegistryObservation {
  name: string;
  host: string;
  status: TrunkStatus;
  detail: string;
}

export interface QueueObservation {
  name: string;
  waiting: number;
  completed: number;
  abandoned: number;
  holdTime: number;
  talkTime: number;
  serviceLevel: number | null;
}

const CALL_STATE: Record<string, CallState> = {
  "4": "ringing",
  "5": "ringing",
  "6": "up",
  Ring: "ringing",
  Ringing: "ringing",
  Up: "up",
  Down: "dialing",
};

export function mapCallState(desc: string | undefined, code: string | undefined): CallState {
  if (desc && CALL_STATE[desc]) return CALL_STATE[desc];
  if (code && CALL_STATE[code]) return CALL_STATE[code];
  return "dialing";
}

export function mapDirection(context: string, exten: string): CallDirection {
  const ctx = context.toLowerCase();
  if (ctx.includes("from-trunk") || ctx.includes("from-pstn") || ctx.includes("ext-did")) return "inbound";
  if (exten.length <= 5) return "internal";
  return "outbound";
}

export function trunkFromChannel(channel: string, trunkNames: readonly string[]): string | null {
  const match = /^(?:PJSIP|SIP|IAX2)\/(.+)-[0-9a-fA-F]+$/.exec(channel);
  if (!match) return null;
  const name = match[1];
  return trunkNames.includes(name) ? name : null;
}

export function mapCoreChannel(headers: AmiHeaders): ChannelObservation | null {
  const channel = headers.Channel;
  const id = headers.Uniqueid;
  if (!channel || !id) return null;
  if (headers.Event && headers.Event !== "CoreShowChannel" && headers.Event !== "Newchannel" && headers.Event !== "Newstate") {
    return null;
  }
  const exten = headers.ConnectedLineNum || headers.Exten || "";
  const context = headers.Context ?? "";
  return {
    id,
    channel,
    caller: headers.CallerIDNum || "",
    callerName: headers.CallerIDName || "",
    destination: exten,
    direction: mapDirection(context, exten),
    state: mapCallState(headers.ChannelStateDesc, headers.ChannelState),
    account: headers.AccountCode || null,
  };
}

/** "OK (42 ms)", "LAGGED (400 ms)", "UNREACHABLE", "Reachable", "Registered". */
export function parsePeerStatus(status: string): { kind: PeerObservation["kind"]; rttMs: number | null } {
  const rtt = /\((\d+)\s*ms\)/i.exec(status);
  const rttMs = rtt ? Number(rtt[1]) : null;
  const upper = status.toUpperCase();
  if (upper.includes("LAGGED")) return { kind: "lagged", rttMs };
  if (upper.includes("UNREACHABLE") || upper.includes("UNREGISTERED") || upper.includes("REJECT")) {
    return { kind: "unreachable", rttMs };
  }
  if (upper.startsWith("OK") || upper.includes("REACHABLE") || upper.includes("REGISTERED")) {
    return { kind: "ok", rttMs };
  }
  if (upper.includes("UNMONITORED")) return { kind: "unmonitored", rttMs: null };
  return { kind: "unknown", rttMs };
}

function peerToExtension(kind: PeerObservation["kind"]): ExtensionStatus {
  if (kind === "ok") return "online";
  if (kind === "lagged") return "online";
  if (kind === "unreachable") return "offline";
  return "unavailable";
}

export function mapPeerEntry(headers: AmiHeaders): PeerObservation | null {
  const name = headers.ObjectName || headers.EndpointName || headers.Endpoint || headers.Peer;
  if (!name) return null;
  const raw = headers.Status || headers.DeviceState || headers.PeerStatus || "";
  const parsed = parsePeerStatus(raw);
  const address = headers.IPaddress || headers.Uri || null;
  const usec = headers.RoundtripUsec ? Math.round(Number(headers.RoundtripUsec) / 1000) : null;
  return {
    name: name.replace(/^(SIP|PJSIP|IAX2)\//, ""),
    kind: parsed.kind,
    rttMs: parsed.rttMs ?? (Number.isFinite(usec) ? usec : null),
    address: address && address !== "-none-" ? address : null,
    status: peerToExtension(parsed.kind),
  };
}

export function mapRegistry(headers: AmiHeaders): RegistryObservation | null {
  const host = headers.Domain || headers.Host || "";
  const name = headers.Username || headers.ObjectName || host;
  if (!name && !host) return null;
  const raw = (headers.Status || headers.State || "").toLowerCase();
  let status: TrunkStatus = "unregistered";
  let detail = headers.Status || headers.State || "Unknown";
  if (raw.includes("reject") || raw.includes("forbidden") || raw.includes("failed")) {
    status = "rejected";
    detail = headers.Status || "Rejected";
  } else if (raw.includes("registered") && !raw.includes("unregistered")) {
    status = "registered";
    detail = "Registered";
  } else if (raw.includes("lag")) {
    status = "lagged";
  }
  return { name, host, status, detail };
}

export function mapQueueParams(headers: AmiHeaders): QueueObservation | null {
  const name = headers.Queue;
  if (!name) return null;
  const perf = headers.ServicelevelPerf ?? headers.ServiceLevelPerf;
  const serviceLevel = perf === undefined || perf === "" ? null : Number(perf);
  return {
    name,
    waiting: Number(headers.Calls ?? 0) || 0,
    completed: Number(headers.Completed ?? 0) || 0,
    abandoned: Number(headers.Abandoned ?? 0) || 0,
    holdTime: Number(headers.Holdtime ?? headers.HoldTime ?? 0) || 0,
    talkTime: Number(headers.TalkTime ?? headers.Talktime ?? 0) || 0,
    serviceLevel: serviceLevel !== null && Number.isFinite(serviceLevel) ? serviceLevel : null,
  };
}

export function mapTrunkStatus(kind: PeerObservation["kind"]): TrunkStatus {
  if (kind === "ok") return "registered";
  if (kind === "lagged") return "lagged";
  if (kind === "unreachable") return "rejected";
  return "unregistered";
}
