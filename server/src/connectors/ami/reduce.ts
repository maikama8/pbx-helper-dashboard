import type { Extension, LiveCall, QueueStat, Trunk } from "../../domain/types.js";
import { mapCoreChannel, mapPeerEntry, mapQueueParams, mapRegistry, mapTrunkStatus, trunkFromChannel } from "./map.js";
import type { AmiMessage } from "./parser.js";

export interface AmiState {
  calls: LiveCall[];
  trunks: Trunk[];
  extensions: Extension[];
  queues: QueueStat[];
}

export function emptyAmiState(): AmiState {
  return { calls: [], trunks: [], extensions: [], queues: [] };
}

function upsertCall(state: AmiState, message: AmiMessage): AmiState {
  const trunkNames = state.trunks.map((trunk) => trunk.name);
  const observed = mapCoreChannel(message.headers);
  if (!observed) return state;
  const calls = state.calls.filter((call) => call.id !== observed.id);
  const previous = state.calls.find((call) => call.id === observed.id);
  const startedAt = previous?.startedAt ?? new Date().toISOString();
  let answeredAt = previous?.answeredAt ?? null;
  if (observed.state === "up" && !answeredAt) answeredAt = new Date().toISOString();
  const next: LiveCall = {
    id: observed.id,
    channel: observed.channel,
    caller: observed.caller,
    callerName: observed.callerName,
    destination: observed.destination,
    direction: observed.direction,
    state: observed.state,
    startedAt,
    answeredAt,
    trunk: trunkFromChannel(observed.channel, trunkNames) ?? previous?.trunk ?? null,
    account: observed.account ?? previous?.account ?? null,
    codec: previous?.codec ?? "ulaw",
  };
  return { ...state, calls: [...calls, next] };
}

function applyPeer(state: AmiState, message: AmiMessage): AmiState {
  const peer = mapPeerEntry(message.headers);
  if (!peer) return state;
  const trunk = state.trunks.find((row) => row.name === peer.name || row.id === peer.name || row.host === peer.name);
  if (trunk) {
    const trunks = state.trunks.map((row) =>
      row.id === trunk.id
        ? {
            ...row,
            status: mapTrunkStatus(peer.kind),
            rttMs: peer.rttMs,
            detail: message.headers.Status || message.headers.PeerStatus || row.detail,
            lastRegistration: peer.kind === "ok" ? new Date().toISOString() : row.lastRegistration,
          }
        : row,
    );
    return { ...state, trunks };
  }
  const known = state.extensions.find((row) => row.extension === peer.name || row.id === peer.name);
  if (known) {
    const extensions = state.extensions.map((row) =>
      row.id === known.id ? { ...row, status: peer.status, address: peer.address ?? row.address } : row,
    );
    return { ...state, extensions };
  }
  const extension: Extension = {
    id: peer.name,
    extension: peer.name,
    name: peer.name,
    technology: "pjsip",
    context: "",
    callerId: peer.name,
    account: null,
    status: peer.status,
    address: peer.address,
    userAgent: null,
    codec: "",
    source: "asterisk",
  };
  return { ...state, extensions: [...state.extensions, extension] };
}

function applyRegistry(state: AmiState, message: AmiMessage): AmiState {
  const registry = mapRegistry(message.headers);
  if (!registry) return state;
  const trunk = state.trunks.find(
    (row) => row.name === registry.name || row.host === registry.host || row.id === registry.name,
  );
  if (!trunk) {
    const created: Trunk = {
      id: registry.name || registry.host,
      name: registry.name || registry.host,
      provider: registry.host || registry.name,
      technology: "sip",
      host: registry.host,
      status: registry.status,
      rttMs: null,
      channelsInUse: 0,
      maxChannels: 0,
      lastRegistration: registry.status === "registered" ? new Date().toISOString() : null,
      detail: registry.detail,
    };
    return { ...state, trunks: [...state.trunks, created] };
  }
  const trunks = state.trunks.map((row) =>
    row.id === trunk.id
      ? {
          ...row,
          status: registry.status,
          detail: registry.detail,
          lastRegistration: registry.status === "registered" ? new Date().toISOString() : row.lastRegistration,
        }
      : row,
  );
  return { ...state, trunks };
}

function applyQueue(state: AmiState, message: AmiMessage): AmiState {
  const queue = mapQueueParams(message.headers);
  if (!queue) return state;
  const queues = state.queues.filter((row) => row.name !== queue.name);
  return { ...state, queues: [...queues, queue] };
}

const CHANNEL_EVENTS = new Set(["CoreShowChannel", "Newchannel", "Newstate"]);

/** Pure fold of one AMI message into channel, peer, registry, and queue state. */
export function reduceAmi(state: AmiState, message: AmiMessage): AmiState {
  const event = message.headers.Event ?? "";
  if (event === "Hangup") {
    const id = message.headers.Uniqueid;
    if (!id) return state;
    return { ...state, calls: state.calls.filter((call) => call.id !== id) };
  }
  if (CHANNEL_EVENTS.has(event)) return upsertCall(state, message);
  if (event === "PeerEntry" || event === "PeerStatus" || event === "ContactStatus" || event === "EndpointList") {
    return applyPeer(state, message);
  }
  if (event === "Registry" || event === "RegistryEntry") return applyRegistry(state, message);
  if (event === "QueueParams") return applyQueue(state, message);
  return state;
}

export function reduceAmiBatch(state: AmiState, messages: readonly AmiMessage[]): AmiState {
  return messages.reduce(reduceAmi, state);
}
