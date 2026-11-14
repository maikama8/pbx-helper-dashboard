import { describe, expect, it } from "vitest";
import { AriClient, ariBasicAuth, ariHangupUrl } from "../src/connectors/ari/client.js";
import { mapMysqlCdr, mapMysqlCel, cdrQuery, celQuery } from "../src/connectors/cdr/sql.js";
import { EXTENSIONS_QUERY, FreePbxClient, mapFreePbxExtensions, mapFreePbxTrunks } from "../src/connectors/freepbx/client.js";
import { buildMagnusRequest, MagnusClient, magnusSign } from "../src/connectors/magnus/client.js";
import { DEMO_RATES } from "../src/connectors/demo/opening.js";
import { overlayExtensions, overlayTrunks } from "../src/connectors/merge.js";

const MAGNUS_VECTOR = "7e1e5904dc9d438bae1c09b734f53a7caa32a817e8022e7539633d1dd09977674f0caa9837f3dea074aefde130ccf0376395708a688c2ca9c7a89fb5fa9b4193";

describe("MagnusBilling client", () => {
  it("signs the form body with HMAC-SHA512 and never sends the secret", () => {
    expect(magnusSign("credit=10.00&id_user=3&nonce=1", "secret")).toBe(MAGNUS_VECTOR);
    const request = buildMagnusRequest(
      { url: "https://billing.example/mbilling/index.php", apiKey: "key-1", apiSecret: "secret" },
      "refill",
      "save",
      { id_user: "3", credit: "10.00", description: "desk", payment: "1" },
      "1",
    );
    expect(request.url).toBe("https://billing.example/mbilling/index.php/refill/save");
    expect(request.headers.Key).toBe("key-1");
    expect(request.headers.Sign).toBe(magnusSign(request.body, "secret"));
    expect(request.body).not.toContain("secret");
    expect(JSON.stringify(request.headers)).not.toContain("secret");
    expect(request.body.startsWith("id_user=3&credit=10.00")).toBe(true);
  });

  it("maps users and posts a refill", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      const rows = url.endsWith("/user/read")
        ? [{ id: "2", username: "harbor-clinic", firstname: "Harbor", lastname: "Clinic", credit: "1.2000", active: "1", email: "ops@harbor.example" }]
        : [];
      return new Response(JSON.stringify({ rows }), { status: 200 });
    };
    const client = new MagnusClient(
      { url: "https://billing.example/mbilling/index.php", apiKey: "key", apiSecret: "secret" },
      fetchImpl,
      () => "99",
    );
    const customers = await client.listCustomers();
    expect(customers[0]).toMatchObject({ id: "2", username: "harbor-clinic", credit: 1.2, name: "Harbor Clinic" });
    await client.refill("2", 10, "cash");
    expect(calls[1].url).toContain("/refill/save");
    expect(calls[1].body).toContain("credit=10.00");
    expect(calls[1].body).toContain("id_user=2");
  });

  it("rates a call row when sessionbill is empty", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          rows: [{ id: "9", starttime: "2026-11-14 08:12:00", src: "1004", calledstation: "2348099882211", sessiontime: "60", sessionbill: "0", buycost: "0" }],
        }),
        { status: 200 },
      );
    const client = new MagnusClient(
      { url: "https://billing.example/mbilling/index.php", apiKey: "k", apiSecret: "s" },
      fetchImpl,
      () => "1",
    );
    const rows = await client.listCdr(DEMO_RATES, []);
    expect(rows[0].disposition).toBe("ANSWERED");
    expect(rows[0].destination).toBe("Nigeria Mobile");
    expect(rows[0].sell).toBe(mulSafe());
  });
});

function mulSafe(): number {
  return Math.round((60 * 0.08 * 1_000_000) / 60) / 1_000_000;
}

describe("FreePBX GraphQL", () => {
  it("asks for extensions without passwords and maps trunks", () => {
    expect(EXTENSIONS_QUERY).not.toMatch(/password/i);
    const extensions = mapFreePbxExtensions({
      data: {
        fetchAllExtensions: {
          extension: [{ extensionId: "1001", tech: "pjsip", user: { name: "Adaeze", outboundCid: "020000" }, coreDevice: { tech: "pjsip" } }],
        },
      },
    });
    expect(extensions[0]).toMatchObject({ extension: "1001", name: "Adaeze", source: "freepbx", technology: "pjsip" });
    const trunks = mapFreePbxTrunks({
      data: { fetchAllTrunks: { trunks: [{ trunkid: "1", name: "telnyx-us", tech: "pjsip", channelid: "sip.telnyx.com", disabled: "off" }] } },
    });
    expect(trunks[0].name).toBe("telnyx-us");
    expect(trunks[0].host).toBe("sip.telnyx.com");
  });

  it("sends the bearer token and surfaces GraphQL errors", async () => {
    const headers: Record<string, string>[] = [];
    const client = new FreePbxClient({ url: "https://pbx.example/admin/api/api/gql", token: "tok" }, async (_url, init) => {
      headers.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ errors: [{ message: "fetchAllTrunks is not a field" }] }), { status: 200 });
    });
    await expect(client.listTrunks()).rejects.toThrow(/fetchAllTrunks/);
    expect(headers[0].Authorization).toBe("Bearer tok");
  });
});

describe("ARI", () => {
  it("deletes the channel with basic auth and treats 404 as already gone", async () => {
    const seen: { url: string; method?: string; authorization?: string }[] = [];
    const client = new AriClient({ url: "http://127.0.0.1:8088", username: "span", password: "ari-secret" }, async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      seen.push({ url, method: init?.method, authorization: headers.Authorization });
      return new Response(null, { status: 404 });
    });
    await client.hangup("1730.2");
    expect(seen[0]).toEqual({
      url: ariHangupUrl("http://127.0.0.1:8088", "1730.2"),
      method: "DELETE",
      authorization: ariBasicAuth("span", "ari-secret"),
    });
    expect(seen[0].authorization).not.toContain("ari-secret");
  });
});

describe("CDR SQL", () => {
  it("binds the window and the limit instead of interpolating them", () => {
    const query = cdrQuery(2, 100);
    expect(query.sql).toContain("INTERVAL ? DAY");
    expect(query.sql).toContain("LIMIT ?");
    expect(query.params).toEqual([2, 100]);
    expect(query.sql).not.toContain("2");
    expect(celQuery(99, 9).params).toEqual([31, 9]);
  });

  it("rates a mysql row and maps a CEL event", () => {
    const cdr = mapMysqlCdr(
      {
        calldate: new Date("2026-11-14T08:12:00.000Z"),
        src: "1004",
        dst: "2348099882211",
        disposition: "ANSWERED",
        duration: 198,
        billsec: 186,
        accountcode: "northwind",
        uniqueid: "1730.2",
        channel: "PJSIP/1004-0001",
        dstchannel: "PJSIP/telnyx-us-0000002b",
        did: null,
      },
      DEMO_RATES,
      ["1001"],
      ["telnyx-us"],
    );
    expect(cdr.destination).toBe("Nigeria Mobile");
    expect(cdr.sell).toBe(0.248);
    expect(cdr.trunk).toBe("telnyx-us");
    expect(
      mapMysqlCel({
        id: 4,
        eventtime: "2026-11-14 08:12:00",
        eventtype: "ANSWER",
        cid_num: "1004",
        exten: "2348099882211",
        channame: "PJSIP/telnyx-us-0000002b",
        uniqueid: "1730.2",
        context: "from-trunk",
      }).eventtype,
    ).toBe("ANSWER");
  });
});

describe("inventory overlay", () => {
  it("lets AMI registration replace the Magnus status and keeps the label", () => {
    const trunks = overlayTrunks(
      [
        {
          id: "telnyx-us",
          name: "telnyx-us",
          provider: "Telnyx",
          technology: "sip",
          host: "sip.telnyx.com",
          status: "registered",
          rttMs: null,
          channelsInUse: 0,
          maxChannels: 0,
          lastRegistration: null,
          detail: "From MagnusBilling. Registration comes from AMI when it is connected.",
        },
      ],
      [
        {
          id: "telnyx-us",
          name: "telnyx-us",
          provider: "sip.telnyx.com",
          technology: "sip",
          host: "sip.telnyx.com",
          status: "rejected",
          rttMs: null,
          channelsInUse: 0,
          maxChannels: 0,
          lastRegistration: null,
          detail: "Rejected",
        },
      ],
    );
    expect(trunks[0].provider).toBe("Telnyx");
    expect(trunks[0].status).toBe("rejected");
    expect(overlayExtensions([], [{ id: "1001", extension: "1001", name: "1001", technology: "pjsip", context: "", callerId: "1001", account: null, status: "online", address: null, userAgent: null, codec: "", source: "asterisk" }])).toHaveLength(1);
  });
});
