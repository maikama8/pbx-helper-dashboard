export type Role = "admin" | "viewer";

export type CallState = "ringing" | "up" | "dialing";

export type CallDirection = "inbound" | "outbound" | "internal";

export type TrunkStatus = "registered" | "rejected" | "unregistered" | "lagged";

export type ExtensionStatus = "online" | "offline" | "busy" | "unavailable";

export type Disposition = "ANSWERED" | "NO ANSWER" | "BUSY" | "FAILED" | "CONGESTION";

export interface LiveCall {
  id: string;
  channel: string;
  caller: string;
  callerName: string;
  destination: string;
  direction: CallDirection;
  state: CallState;
  startedAt: string;
  answeredAt: string | null;
  trunk: string | null;
  account: string | null;
  codec: string;
}

export interface Trunk {
  id: string;
  name: string;
  provider: string;
  technology: "pjsip" | "sip" | "iax2";
  host: string;
  status: TrunkStatus;
  rttMs: number | null;
  channelsInUse: number;
  maxChannels: number;
  lastRegistration: string | null;
  detail: string;
}

export interface Extension {
  id: string;
  extension: string;
  name: string;
  technology: "pjsip" | "sip" | "iax2" | "virtual";
  context: string;
  callerId: string;
  account: string | null;
  status: ExtensionStatus;
  address: string | null;
  userAgent: string | null;
  codec: string;
  source: "freepbx" | "magnus" | "asterisk";
}

export interface Customer {
  id: string;
  username: string;
  name: string;
  email: string;
  credit: number;
  currency: string;
  active: boolean;
  sipUsers: number;
  lastRefillAt: string | null;
  lastRefillAmount: number | null;
}

export interface Refill {
  id: string;
  customerId: string;
  amount: number;
  description: string;
  at: string;
  by: string;
}

export interface Rate {
  id: string;
  prefix: string;
  destination: string;
  buyRate: number;
  sellRate: number;
  /** Dialed length required before this prefix is a country, not an extension. */
  minLength: number;
}

export interface Cdr {
  id: string;
  calldate: string;
  src: string;
  dst: string;
  destination: string;
  disposition: Disposition;
  duration: number;
  billsec: number;
  account: string;
  trunk: string;
  sell: number;
  buy: number;
  uniqueid: string;
}

export interface CelEvent {
  id: string;
  eventtime: string;
  eventtype: string;
  cidNum: string;
  exten: string;
  channel: string;
  uniqueid: string;
  context: string;
}

export interface QueueStat {
  name: string;
  waiting: number;
  completed: number;
  abandoned: number;
  holdTime: number;
  talkTime: number;
  /** Asterisk ServicelevelPerf, as reported. Not recomputed here. */
  serviceLevel: number | null;
}

export interface HourBucket {
  hour: number;
  answered: number;
  missed: number;
}

export interface DestinationStat {
  destination: string;
  calls: number;
  minutes: number;
  sell: number;
  buy: number;
  margin: number;
}

export interface Analytics {
  offered: number;
  answered: number;
  asr: number | null;
  acdSeconds: number | null;
  minutes: number;
  sell: number;
  buy: number;
  margin: number;
  marginPercent: number | null;
  callsPerHour: HourBucket[];
  topDestinations: DestinationStat[];
}
