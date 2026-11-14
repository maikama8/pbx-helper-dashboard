import type {
  Cdr,
  CelEvent,
  Customer,
  Disposition,
  Extension,
  LiveCall,
  QueueStat,
  Rate,
  Refill,
  Trunk,
} from "../../domain/types.js";
import { priceCall } from "../../domain/rating.js";
import { stampOnDay } from "../../domain/time.js";

export const DEMO_RATES: Rate[] = [
  { id: "us", prefix: "1", destination: "United States", buyRate: 0.004, sellRate: 0.012, minLength: 11 },
  { id: "uk", prefix: "44", destination: "United Kingdom", buyRate: 0.008, sellRate: 0.022, minLength: 11 },
  { id: "fr", prefix: "33", destination: "France", buyRate: 0.009, sellRate: 0.024, minLength: 10 },
  { id: "gh", prefix: "233", destination: "Ghana Mobile", buyRate: 0.045, sellRate: 0.09, minLength: 11 },
  { id: "ng", prefix: "234", destination: "Nigeria Mobile", buyRate: 0.038, sellRate: 0.08, minLength: 11 },
  { id: "ae", prefix: "971", destination: "United Arab Emirates", buyRate: 0.03, sellRate: 0.07, minLength: 11 },
];

/** FreePBX extensions and Magnus SIP users on the opening floor. */
export function demoExtensions(): Extension[] {
  return [
    ext("1001", "Adaeze Okonkwo", "pjsip", "from-internal", "Adaeze <1001>", "night-desk", "online", "203.0.113.21", "Linphone 5.2", "ulaw", "freepbx"),
    ext("1002", "Jonas Berg", "pjsip", "from-internal", "Jonas <1002>", "atlas-freight", "busy", "203.0.113.34", "Grandstream GXP2170", "ulaw", "freepbx"),
    ext("1003", "Reception", "pjsip", "from-internal", "Reception <1003>", null, "online", "203.0.113.10", "Yealink T54W", "ulaw", "freepbx"),
    ext("1004", "Idris Bello", "pjsip", "from-internal", "Idris <1004>", "northwind", "busy", "203.0.113.44", "Zoiper 5", "g722", "freepbx"),
    ext("1005", "Mina Costa", "pjsip", "from-internal", "Mina <1005>", "lumen-support", "offline", null, null, "ulaw", "freepbx"),
    ext("2001", "Night IVR", "virtual", "from-internal", "Night Desk <2001>", "night-desk", "online", null, "Virtual", "ulaw", "freepbx"),
    ext("sip-harbor", "Harbor Clinic", "sip", "billing", "Harbor <200>", "harbor-clinic", "online", "198.51.100.20", "Linksys SPA", "ulaw", "magnus"),
    ext("sip-keita", "Keita Trading", "sip", "billing", "Keita <201>", "keita-trading", "offline", null, null, "g729", "magnus"),
    ext("sip-sol", "Sol Radio", "pjsip", "billing", "Sol <202>", "sol-radio", "online", "198.51.100.40", "Bria", "ulaw", "magnus"),
    ext("sip-paper", "Paper Mill", "pjsip", "billing", "Paper <203>", "paper-mill", "online", "198.51.100.55", "MicroSIP", "ulaw", "magnus"),
  ];

  function ext(
    extension: string,
    name: string,
    technology: Extension["technology"],
    context: string,
    callerId: string,
    account: string | null,
    status: Extension["status"],
    address: string | null,
    userAgent: string | null,
    codec: string,
    source: Extension["source"],
  ): Extension {
    return {
      id: extension,
      extension,
      name,
      technology,
      context,
      callerId,
      account,
      status,
      address,
      userAgent,
      codec,
      source,
    };
  }
}

export function demoTrunks(now: Date): Trunk[] {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return [
    {
      id: "telnyx-us",
      name: "telnyx-us",
      provider: "Telnyx",
      technology: "pjsip",
      host: "sip.telnyx.com",
      status: "registered",
      rttMs: 38,
      channelsInUse: 1,
      maxChannels: 30,
      lastRegistration: at(14),
      detail: "Registered",
    },
    {
      id: "voipms-east",
      name: "voipms-east",
      provider: "VoIP.ms",
      technology: "pjsip",
      host: "newyork.voip.ms",
      status: "registered",
      rttMs: 61,
      channelsInUse: 2,
      maxChannels: 20,
      lastRegistration: at(6),
      detail: "Registered",
    },
    {
      id: "didww-eu",
      name: "didww-eu",
      provider: "DIDWW",
      technology: "pjsip",
      host: "out.didww.com",
      status: "lagged",
      rttMs: 410,
      channelsInUse: 0,
      maxChannels: 15,
      lastRegistration: at(3),
      detail: "Qualify lagging",
    },
    {
      id: "twilio-elastic",
      name: "twilio-elastic",
      provider: "Twilio",
      technology: "pjsip",
      host: "span-demo.pstn.twilio.com",
      status: "registered",
      rttMs: 52,
      channelsInUse: 0,
      maxChannels: 50,
      lastRegistration: at(22),
      detail: "Registered",
    },
    {
      id: "backup-iax",
      name: "backup-iax",
      provider: "Carrier backup",
      technology: "iax2",
      host: "198.51.100.80",
      status: "rejected",
      rttMs: null,
      channelsInUse: 0,
      maxChannels: 10,
      lastRegistration: null,
      detail: "403 Forbidden",
    },
  ];
}

export function demoCustomers(now: Date): Customer[] {
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  return [
    customer("1", "keita-trading", "Keita Trading", "billing@keita.example", 0.35, 1, at(18), 20),
    customer("2", "harbor-clinic", "Harbor Clinic", "ops@harbor.example", 1.2, 1, at(9), 25),
    customer("3", "sol-radio", "Sol Radio", "studio@sol.example", 3.1, 1, at(4), 15),
    customer("4", "atlas-freight", "Atlas Freight", "noc@atlas.example", 8.75, 1, at(2), 50),
    customer("5", "night-desk", "Night Desk", "desk@night.example", 15.6, 2, at(6), 40),
    customer("6", "northwind", "Northwind Logistics", "ops@northwind.example", 42.18, 1, at(1), 100),
    customer("7", "paper-mill", "Paper Mill Co", "pbx@paper.example", 56, 1, at(12), 80),
    customer("8", "lumen-support", "Lumen Support", "voice@lumen.example", 128.4, 1, at(3), 200),
  ];

  function customer(
    id: string,
    username: string,
    name: string,
    email: string,
    credit: number,
    sipUsers: number,
    lastRefillAt: string,
    lastRefillAmount: number,
  ): Customer {
    return {
      id,
      username,
      name,
      email,
      credit,
      currency: "USD",
      active: true,
      sipUsers,
      lastRefillAt,
      lastRefillAmount,
    };
  }
}

export function demoRefills(now: Date, customers: readonly Customer[]): Refill[] {
  return customers.map((customer) => ({
    id: `refill-${customer.id}`,
    customerId: customer.id,
    amount: customer.lastRefillAmount ?? 0,
    description: "Opening balance top-up",
    at: customer.lastRefillAt ?? now.toISOString(),
    by: "seed",
  }));
}

export function demoCalls(now: Date): LiveCall[] {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  return [
    {
      id: "call-in-2001",
      channel: "PJSIP/voipms-east-0000001a",
      caller: "02079460958",
      callerName: "London",
      destination: "2001",
      direction: "inbound",
      state: "ringing",
      startedAt: ago(18),
      answeredAt: null,
      trunk: "voipms-east",
      account: "night-desk",
      codec: "ulaw",
    },
    {
      id: "call-ng-1004",
      channel: "PJSIP/telnyx-us-0000002b",
      caller: "1004",
      callerName: "Idris Bello",
      destination: "2348099882211",
      direction: "outbound",
      state: "up",
      startedAt: ago(260),
      answeredAt: ago(252),
      trunk: "telnyx-us",
      account: "northwind",
      codec: "g722",
    },
    {
      id: "call-uk-1002",
      channel: "PJSIP/voipms-east-0000002c",
      caller: "1002",
      callerName: "Jonas Berg",
      destination: "442079460011",
      direction: "outbound",
      state: "up",
      startedAt: ago(80),
      answeredAt: ago(65),
      trunk: "voipms-east",
      account: "atlas-freight",
      codec: "ulaw",
    },
    {
      id: "call-int-1001",
      channel: "PJSIP/1001-0000003d",
      caller: "1001",
      callerName: "Adaeze Okonkwo",
      destination: "1003",
      direction: "internal",
      state: "up",
      startedAt: ago(45),
      answeredAt: ago(40),
      trunk: null,
      account: "night-desk",
      codec: "ulaw",
    },
  ];
}

export function demoQueues(): QueueStat[] {
  return [
    { name: "sales", waiting: 1, completed: 46, abandoned: 4, holdTime: 18, talkTime: 164, serviceLevel: 88.2 },
    { name: "support", waiting: 3, completed: 31, abandoned: 7, holdTime: 44, talkTime: 210, serviceLevel: 74.5 },
  ];
}

interface CdrSeed {
  id: string;
  hour: number;
  minute: number;
  src: string;
  dst: string;
  disposition: Disposition;
  duration: number;
  billsec: number;
  account: string;
  trunk: string;
}

const CDR_SEED: CdrSeed[] = [
  { id: "cdr-01", hour: 8, minute: 12, src: "1004", dst: "2348099882211", disposition: "ANSWERED", duration: 198, billsec: 186, account: "northwind", trunk: "telnyx-us" },
  { id: "cdr-02", hour: 8, minute: 40, src: "1005", dst: "12125550199", disposition: "ANSWERED", duration: 70, billsec: 64, account: "lumen-support", trunk: "twilio-elastic" },
  { id: "cdr-03", hour: 9, minute: 5, src: "1002", dst: "442079460011", disposition: "ANSWERED", duration: 252, billsec: 240, account: "atlas-freight", trunk: "voipms-east" },
  { id: "cdr-04", hour: 9, minute: 30, src: "sip-keita", dst: "233201555014", disposition: "ANSWERED", duration: 110, billsec: 95, account: "keita-trading", trunk: "telnyx-us" },
  { id: "cdr-05", hour: 10, minute: 2, src: "sip-harbor", dst: "234803334455", disposition: "ANSWERED", duration: 55, billsec: 42, account: "harbor-clinic", trunk: "telnyx-us" },
  { id: "cdr-06", hour: 10, minute: 18, src: "sip-paper", dst: "14155550120", disposition: "ANSWERED", duration: 330, billsec: 310, account: "paper-mill", trunk: "twilio-elastic" },
  { id: "cdr-07", hour: 11, minute: 11, src: "sip-sol", dst: "33144550022", disposition: "ANSWERED", duration: 140, billsec: 128, account: "sol-radio", trunk: "didww-eu" },
  { id: "cdr-08", hour: 11, minute: 44, src: "1001", dst: "441614960000", disposition: "ANSWERED", duration: 90, billsec: 77, account: "night-desk", trunk: "voipms-east" },
  { id: "cdr-09", hour: 12, minute: 6, src: "1004", dst: "2347012345678", disposition: "ANSWERED", duration: 220, billsec: 205, account: "northwind", trunk: "telnyx-us" },
  { id: "cdr-10", hour: 13, minute: 15, src: "1005", dst: "13125550110", disposition: "ANSWERED", duration: 60, billsec: 48, account: "lumen-support", trunk: "twilio-elastic" },
  { id: "cdr-11", hour: 13, minute: 40, src: "sip-keita", dst: "233244000111", disposition: "ANSWERED", duration: 175, billsec: 160, account: "keita-trading", trunk: "telnyx-us" },
  { id: "cdr-12", hour: 14, minute: 8, src: "1002", dst: "971455501234", disposition: "ANSWERED", duration: 100, billsec: 90, account: "atlas-freight", trunk: "didww-eu" },
  { id: "cdr-13", hour: 15, minute: 22, src: "sip-paper", dst: "442030000111", disposition: "ANSWERED", duration: 48, billsec: 36, account: "paper-mill", trunk: "voipms-east" },
  { id: "cdr-14", hour: 16, minute: 5, src: "sip-sol", dst: "2348120009988", disposition: "ANSWERED", duration: 130, billsec: 112, account: "sol-radio", trunk: "telnyx-us" },
  { id: "cdr-15", hour: 8, minute: 55, src: "1004", dst: "2348090001111", disposition: "NO ANSWER", duration: 30, billsec: 0, account: "northwind", trunk: "telnyx-us" },
  { id: "cdr-16", hour: 9, minute: 50, src: "1005", dst: "12125550999", disposition: "BUSY", duration: 8, billsec: 0, account: "lumen-support", trunk: "twilio-elastic" },
  { id: "cdr-17", hour: 10, minute: 48, src: "sip-keita", dst: "233200000000", disposition: "FAILED", duration: 0, billsec: 0, account: "keita-trading", trunk: "telnyx-us" },
  { id: "cdr-18", hour: 12, minute: 30, src: "1002", dst: "442079460099", disposition: "NO ANSWER", duration: 25, billsec: 0, account: "atlas-freight", trunk: "voipms-east" },
  { id: "cdr-19", hour: 14, minute: 45, src: "sip-harbor", dst: "234800000000", disposition: "CONGESTION", duration: 4, billsec: 0, account: "harbor-clinic", trunk: "telnyx-us" },
  { id: "cdr-20", hour: 15, minute: 5, src: "sip-sol", dst: "33100000000", disposition: "NO ANSWER", duration: 22, billsec: 0, account: "sol-radio", trunk: "didww-eu" },
  { id: "cdr-21", hour: 16, minute: 40, src: "sip-paper", dst: "14155550000", disposition: "BUSY", duration: 6, billsec: 0, account: "paper-mill", trunk: "twilio-elastic" },
  { id: "cdr-22", hour: 17, minute: 10, src: "1001", dst: "971400000000", disposition: "FAILED", duration: 0, billsec: 0, account: "night-desk", trunk: "didww-eu" },
];

export function extensionNumbers(extensions: readonly Extension[]): string[] {
  return extensions.map((row) => row.extension);
}

export function demoCdrs(now: Date, timeZone: string, extensions: readonly Extension[]): Cdr[] {
  const numbers = extensionNumbers(extensions);
  return CDR_SEED.map((seed) => {
    const priced = priceCall(seed.dst, seed.billsec, DEMO_RATES, numbers);
    return {
      id: seed.id,
      calldate: stampOnDay(now, seed.hour, seed.minute, timeZone),
      src: seed.src,
      dst: seed.dst,
      destination: priced.destination,
      disposition: seed.disposition,
      duration: seed.duration,
      billsec: seed.billsec,
      account: seed.account,
      trunk: seed.trunk,
      sell: priced.sell,
      buy: priced.buy,
      uniqueid: seed.id,
    };
  }).sort((a, b) => (a.calldate < b.calldate ? 1 : -1));
}

export function demoCel(now: Date): CelEvent[] {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  return [
    cel("cel-1", ago(260), "CHAN_START", "1004", "2348099882211", "PJSIP/1004-0000002b", "call-ng-1004", "from-internal"),
    cel("cel-2", ago(252), "ANSWER", "1004", "2348099882211", "PJSIP/telnyx-us-0000002b", "call-ng-1004", "from-trunk"),
    cel("cel-3", ago(80), "CHAN_START", "1002", "442079460011", "PJSIP/1002-0000002c", "call-uk-1002", "from-internal"),
    cel("cel-4", ago(65), "ANSWER", "1002", "442079460011", "PJSIP/voipms-east-0000002c", "call-uk-1002", "from-trunk"),
    cel("cel-5", ago(45), "CHAN_START", "1001", "1003", "PJSIP/1001-0000003d", "call-int-1001", "from-internal"),
    cel("cel-6", ago(40), "ANSWER", "1001", "1003", "PJSIP/1003-0000003e", "call-int-1001", "from-internal"),
    cel("cel-7", ago(18), "CHAN_START", "02079460958", "2001", "PJSIP/voipms-east-0000001a", "call-in-2001", "from-trunk"),
    cel("cel-8", ago(12), "APP_START", "02079460958", "2001", "PJSIP/voipms-east-0000001a", "call-in-2001", "ext-queues"),
  ];

  function cel(
    id: string,
    eventtime: string,
    eventtype: string,
    cidNum: string,
    exten: string,
    channel: string,
    uniqueid: string,
    context: string,
  ): CelEvent {
    return { id, eventtime, eventtype, cidNum, exten, channel, uniqueid, context };
  }
}

export interface DemoData {
  calls: LiveCall[];
  trunks: Trunk[];
  extensions: Extension[];
  queues: QueueStat[];
  customers: Customer[];
  refills: Refill[];
  rates: Rate[];
  cdrs: Cdr[];
  cel: CelEvent[];
}

export function openingState(now: Date, timeZone: string): DemoData {
  const extensions = demoExtensions();
  const customers = demoCustomers(now);
  return {
    calls: demoCalls(now),
    trunks: demoTrunks(now),
    extensions,
    queues: demoQueues(),
    customers,
    refills: demoRefills(now, customers),
    rates: DEMO_RATES,
    cdrs: demoCdrs(now, timeZone, extensions),
    cel: demoCel(now),
  };
}
