import type { Cdr, LiveCall } from "../../domain/types.js";
import { priceCall, round2 } from "../../domain/rating.js";
import { extensionNumbers, type DemoData } from "./opening.js";

export function cdrFromCall(call: LiveCall, now: Date, data: DemoData): Cdr {
  const started = new Date(call.startedAt).getTime();
  const answered = call.answeredAt ? new Date(call.answeredAt).getTime() : null;
  const duration = Math.max(0, Math.round((now.getTime() - started) / 1000));
  const billsec = answered === null ? 0 : Math.max(0, Math.round((now.getTime() - answered) / 1000));
  const disposition = answered === null ? "NO ANSWER" : "ANSWERED";
  const priced = priceCall(call.destination, billsec, data.rates, extensionNumbers(data.extensions));
  return {
    id: `cdr-live-${call.id}-${now.getTime()}`,
    calldate: call.startedAt,
    src: call.caller,
    dst: call.destination,
    destination: call.direction === "internal" ? "Internal" : priced.destination,
    disposition,
    duration,
    billsec,
    account: call.account ?? "",
    trunk: call.trunk ?? "",
    sell: call.direction === "internal" ? 0 : priced.sell,
    buy: call.direction === "internal" ? 0 : priced.buy,
    uniqueid: call.id,
  };
}

function bumpTrunk(data: DemoData, trunkId: string | null, delta: number): void {
  if (!trunkId) return;
  const trunk = data.trunks.find((row) => row.id === trunkId);
  if (!trunk) return;
  trunk.channelsInUse = Math.max(0, trunk.channelsInUse + delta);
}

const ORIGINATE = [
  { src: "1005", callerName: "Mina Costa", dst: "33186950000", account: "lumen-support", trunk: "didww-eu", direction: "outbound" as const },
  { src: "sip-harbor", callerName: "Harbor Clinic", dst: "2347011112222", account: "harbor-clinic", trunk: "telnyx-us", direction: "outbound" as const },
  { src: "1003", callerName: "Reception", dst: "1005", account: null, trunk: null, direction: "internal" as const },
  { src: "sip-paper", callerName: "Paper Mill", dst: "14155550199", account: "paper-mill", trunk: "twilio-elastic", direction: "outbound" as const },
];

function originate(data: DemoData, roll: number, now: Date): LiveCall {
  const template = ORIGINATE[Math.floor(roll * ORIGINATE.length) % ORIGINATE.length];
  const id = `call-new-${now.getTime()}-${template.dst.slice(-4)}`;
  const channel = template.trunk
    ? `PJSIP/${template.trunk}-${id.slice(-6)}`
    : `PJSIP/${template.src}-${id.slice(-6)}`;
  bumpTrunk(data, template.trunk, 1);
  return {
    id,
    channel,
    caller: template.src,
    callerName: template.callerName,
    destination: template.dst,
    direction: template.direction,
    state: "ringing",
    startedAt: now.toISOString(),
    answeredAt: null,
    trunk: template.trunk,
    account: template.account,
    codec: "ulaw",
  };
}

/**
 * One demo tick. `roll` is in [0, 1). The same roll always produces the same change
 * from the same state, so the simulator and the tests share one function.
 */
export function stepDemo(state: DemoData, roll: number, now: Date): DemoData {
  const next: DemoData = structuredClone(state);
  next.trunks = next.trunks.map((trunk) => {
    if (trunk.rttMs === null) return trunk;
    const delta = Math.round((roll - 0.5) * 8);
    return { ...trunk, rttMs: Math.max(1, trunk.rttMs + delta) };
  });

  if (roll > 0.97) {
    const didww = next.trunks.find((trunk) => trunk.id === "didww-eu");
    if (didww) {
      if (didww.status === "lagged") {
        didww.status = "registered";
        didww.rttMs = 80;
        didww.detail = "Registered";
      } else {
        didww.status = "lagged";
        didww.rttMs = 410;
        didww.detail = "Qualify lagging";
      }
    }
  }

  if (roll < 0.34) {
    const ringing = next.calls.find((call) => call.state === "ringing");
    if (ringing) {
      ringing.state = "up";
      ringing.answeredAt = now.toISOString();
      return next;
    }
  }

  if (roll < 0.62) {
    const up = next.calls.find((call) => {
      if (call.state !== "up" || !call.answeredAt) return false;
      return now.getTime() - new Date(call.answeredAt).getTime() > 15_000;
    });
    if (up) {
      next.cdrs = [cdrFromCall(up, now, next), ...next.cdrs].slice(0, 500);
      next.calls = next.calls.filter((call) => call.id !== up.id);
      bumpTrunk(next, up.trunk, -1);
      const ext = next.extensions.find((row) => row.extension === up.caller);
      if (ext && ext.status === "busy") ext.status = "online";
      return next;
    }
  }

  if (roll < 0.88 && next.calls.length < 6) {
    next.calls = [...next.calls, originate(next, roll, now)];
    return next;
  }

  return next;
}

export function hangupCall(state: DemoData, id: string, now: Date): { state: DemoData; removed: boolean } {
  const call = state.calls.find((row) => row.id === id);
  if (!call) return { state, removed: false };
  const next: DemoData = structuredClone(state);
  const doomed = next.calls.find((row) => row.id === id);
  if (!doomed) return { state, removed: false };
  next.cdrs = [cdrFromCall(doomed, now, next), ...next.cdrs].slice(0, 500);
  next.calls = next.calls.filter((row) => row.id !== id);
  bumpTrunk(next, doomed.trunk, -1);
  const ext = next.extensions.find((row) => row.extension === doomed.caller);
  if (ext && ext.status === "busy") ext.status = "online";
  next.cel = [
    {
      id: `cel-hang-${id}`,
      eventtime: now.toISOString(),
      eventtype: "HANGUP",
      cidNum: doomed.caller,
      exten: doomed.destination,
      channel: doomed.channel,
      uniqueid: doomed.id,
      context: doomed.direction === "inbound" ? "from-trunk" : "from-internal",
    },
    ...next.cel,
  ].slice(0, 200);
  return { state: next, removed: true };
}

export function refillCustomer(
  state: DemoData,
  id: string,
  amount: number,
  description: string,
  actor: string,
  now: Date,
): { state: DemoData; customer: DemoData["customers"][number] | null } {
  const next: DemoData = structuredClone(state);
  const customer = next.customers.find((row) => row.id === id);
  if (!customer) return { state, customer: null };
  customer.credit = round2(customer.credit + amount);
  customer.lastRefillAmount = amount;
  customer.lastRefillAt = now.toISOString();
  next.refills = [
    {
      id: `refill-${id}-${now.getTime()}`,
      customerId: id,
      amount,
      description,
      at: now.toISOString(),
      by: actor,
    },
    ...next.refills,
  ].slice(0, 200);
  return { state: next, customer };
}
