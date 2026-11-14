import type { FreePbxConfig } from "../../config.js";
import type { Extension, Trunk } from "../../domain/types.js";
import type { FetchLike } from "../magnus/client.js";

export const EXTENSIONS_QUERY = `query SpanExtensions {
  fetchAllExtensions {
    status
    message
    extension {
      extensionId
      tech
      user { name outboundCid }
      coreDevice { dial devicetype tech }
    }
  }
}`;

export const TRUNKS_QUERY = `query SpanTrunks {
  fetchAllTrunks {
    status
    message
    trunks {
      trunkid
      name
      tech
      channelid
      disabled
      outcid
    }
  }
}`;

interface GqlExtension {
  extensionId?: string;
  tech?: string;
  user?: { name?: string; outboundCid?: string };
  coreDevice?: { dial?: string; devicetype?: string; tech?: string };
}

interface GqlTrunk {
  trunkid?: string;
  name?: string;
  tech?: string;
  channelid?: string;
  disabled?: string | boolean;
  outcid?: string;
}

function techOf(value: string | undefined): Extension["technology"] {
  const tech = (value ?? "").toLowerCase();
  if (tech.includes("iax")) return "iax2";
  if (tech.includes("virtual") || tech.includes("custom")) return "virtual";
  if (tech === "sip") return "sip";
  return "pjsip";
}

export function mapFreePbxExtensions(payload: unknown): Extension[] {
  const root = payload as { data?: { fetchAllExtensions?: { extension?: GqlExtension[] } } };
  const rows = root.data?.fetchAllExtensions?.extension ?? [];
  return rows
    .filter((row) => row.extensionId)
    .map((row) => ({
      id: `fpbx-${row.extensionId}`,
      extension: String(row.extensionId),
      name: row.user?.name || String(row.extensionId),
      technology: techOf(row.coreDevice?.tech || row.tech),
      context: "from-internal",
      callerId: row.user?.outboundCid || `${row.user?.name ?? row.extensionId} <${row.extensionId}>`,
      account: null,
      status: "unavailable" as const,
      address: null,
      userAgent: row.coreDevice?.devicetype ?? null,
      codec: "",
      source: "freepbx" as const,
    }));
}

export function mapFreePbxTrunks(payload: unknown): Trunk[] {
  const root = payload as { data?: { fetchAllTrunks?: { trunks?: GqlTrunk[] } } };
  const rows = root.data?.fetchAllTrunks?.trunks ?? [];
  return rows
    .filter((row) => row.name || row.trunkid)
    .map((row) => {
      const disabled = row.disabled === true || row.disabled === "on" || row.disabled === "1";
      const tech = (row.tech ?? "").toLowerCase();
      return {
        id: `fpbx-${row.trunkid ?? row.name}`,
        name: row.name || String(row.trunkid),
        provider: row.name || "FreePBX trunk",
        technology: tech.includes("iax") ? "iax2" as const : tech === "sip" ? "sip" as const : "pjsip" as const,
        host: row.channelid || "",
        status: "unregistered" as const,
        rttMs: null,
        channelsInUse: 0,
        maxChannels: 0,
        lastRegistration: null,
        detail: disabled
          ? "Disabled in FreePBX"
          : "Inventory from FreePBX. Registration comes from AMI when it is connected.",
      };
    });
}

/** FreePBX GraphQL client. The queries ask for inventory and do not ask for SIP secrets. */
export class FreePbxClient {
  constructor(
    private readonly config: FreePbxConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async query(document: string): Promise<unknown> {
    const response = await this.fetchImpl(this.config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: document }),
    });
    if (!response.ok) throw new Error(`FreePBX GraphQL returned HTTP ${response.status}`);
    const payload = (await response.json()) as { errors?: { message?: string }[] };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "FreePBX GraphQL error");
    }
    return payload;
  }

  async listExtensions(): Promise<Extension[]> {
    return mapFreePbxExtensions(await this.query(EXTENSIONS_QUERY));
  }

  async listTrunks(): Promise<Trunk[]> {
    return mapFreePbxTrunks(await this.query(TRUNKS_QUERY));
  }
}
