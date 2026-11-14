export type Role = "admin" | "viewer";

export interface Me {
  username: string;
  role: Role;
  source: "demo" | "live";
}

export interface LiveCall {
  id: string;
  channel: string;
  caller: string;
  callerName: string;
  destination: string;
  direction: "inbound" | "outbound" | "internal";
  state: "ringing" | "up" | "dialing";
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
  technology: string;
  host: string;
  status: "registered" | "rejected" | "unregistered" | "lagged";
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
  technology: string;
  context: string;
  callerId: string;
  account: string | null;
  status: "online" | "offline" | "busy" | "unavailable";
  address: string | null;
  userAgent: string | null;
  codec: string;
  source: string;
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

export interface QueueStat {
  name: string;
  waiting: number;
  completed: number;
  abandoned: number;
  holdTime: number;
  talkTime: number;
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

export interface Overview {
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

export interface CdrRow {
  id: string;
  calldate: string;
  src: string;
  dst: string;
  destination: string;
  disposition: string;
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

export interface CdrResponse {
  rows: CdrRow[];
  total: number;
  limit: number;
  offset: number;
  analytics: {
    offered: number;
    answered: number;
    asr: number | null;
    acdSeconds: number | null;
    minutes: number;
    sell: number;
    buy: number;
    margin: number;
    marginPercent: number | null;
  };
  cel: CelEvent[];
}
