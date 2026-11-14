import type { AmiConfig } from "../../config.js";
import type { AmiMessage } from "./parser.js";
import { AmiSession, untilComplete } from "./session.js";
import { connectAmiSocket, type ByteStream } from "./tcp.js";

export interface AmiRunOptions {
  config: AmiConfig;
  onBatch: (messages: AmiMessage[]) => void;
  onEvent: (message: AmiMessage) => void;
  signal: AbortSignal;
  connect?: (host: string, port: number) => Promise<ByteStream>;
}

const SNAPSHOTS: { action: string; complete: string }[] = [
  { action: "CoreShowChannels", complete: "CoreShowChannelsComplete" },
  { action: "SIPpeers", complete: "PeerlistComplete" },
  { action: "PJSIPShowEndpoints", complete: "EndpointListComplete" },
  { action: "SIPshowregistry", complete: "RegistrationsComplete" },
  { action: "QueueStatus", complete: "QueueStatusComplete" },
];

async function runOnce(options: AmiRunOptions): Promise<void> {
  const connect = options.connect ?? connectAmiSocket;
  const stream = await connect(options.config.host, options.config.port);
  const session = new AmiSession((payload) => stream.write(payload));
  stream.onData((chunk) => session.push(chunk));
  const closed = new Promise<void>((resolve, reject) => {
    stream.onClose((error) => (error ? reject(error) : resolve()));
    options.signal.addEventListener("abort", () => {
      stream.end();
      resolve();
    }, { once: true });
  });

  const login = await session.request(
    { Action: "Login", Username: options.config.username, Secret: options.config.secret, Events: "on" },
    (message) => message.headers.Response === "Success" || message.headers.Response === "Error",
  );
  const outcome = login.at(-1)?.headers.Response;
  if (outcome !== "Success") {
    stream.end();
    throw new Error(login.at(-1)?.headers.Message || "AMI login failed");
  }
  session.onEvent(options.onEvent);

  for (const snap of SNAPSHOTS) {
    if (options.signal.aborted) break;
    try {
      const messages = await session.request({ Action: snap.action }, untilComplete(snap.complete));
      options.onBatch(messages);
    } catch {
      // A missing module (chan_sip on a PJSIP-only box, or no queues) is not fatal.
    }
  }

  const ping = setInterval(() => {
    session
      .request({ Action: "Ping" }, (message) => message.headers.Response === "Success" || message.headers.Response === "Error", 4000)
      .catch(() => undefined);
  }, 15_000);
  ping.unref?.();
  try {
    await closed;
  } finally {
    clearInterval(ping);
  }
}

/** Reconnect until aborted. The first connection attempt is awaited by the caller of `startAmi`. */
export async function runAmi(options: AmiRunOptions): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await runOnce(options);
    } catch (error) {
      if (options.signal.aborted) return;
      options.onEvent({
        headers: {
          Event: "SpanConnectFailed",
          Message: error instanceof Error ? error.message : "AMI connection failed",
        },
      });
    }
    if (options.signal.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, options.config.reconnectMs));
  }
}

export async function amiHangup(session: AmiSession, channel: string): Promise<void> {
  const messages = await session.request(
    { Action: "Hangup", Channel: channel, Cause: "16" },
    (message) => message.headers.Response === "Success" || message.headers.Response === "Error",
  );
  if (messages.at(-1)?.headers.Response !== "Success") {
    throw new Error(messages.at(-1)?.headers.Message || "AMI hangup failed");
  }
}
