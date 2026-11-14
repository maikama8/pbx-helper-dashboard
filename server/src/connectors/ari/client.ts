import type { AriConfig } from "../../config.js";
import type { FetchLike } from "../magnus/client.js";

export function ariHangupUrl(baseUrl: string, channelId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/ari/channels/${encodeURIComponent(channelId)}`;
}

export function ariBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export class AriClient {
  constructor(
    private readonly config: AriConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /**
   * DELETE /ari/channels/{id}. 204 is success. 404 means the channel already ended,
   * which is a successful hangup from the operator's point of view.
   */
  async hangup(channelId: string): Promise<void> {
    const response = await this.fetchImpl(ariHangupUrl(this.config.url, channelId), {
      method: "DELETE",
      headers: { Authorization: ariBasicAuth(this.config.username, this.config.password) },
    });
    if (response.status === 204 || response.status === 404) return;
    if (!response.ok) throw new Error(`ARI hangup returned HTTP ${response.status}`);
  }
}
