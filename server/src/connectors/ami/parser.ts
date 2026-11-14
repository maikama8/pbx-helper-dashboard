export type AmiHeaders = Record<string, string>;

export interface AmiMessage {
  headers: AmiHeaders;
}

export function encodeAction(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `${lines.join("\r\n")}\r\n\r\n`;
}

/** Incremental AMI frame parser. Frames are separated by a blank line. */
export function createAmiParser(onMessage: (message: AmiMessage) => void): { push(chunk: string): void } {
  let buf = "";
  return {
    push(chunk: string) {
      buf += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let splitAt = buf.indexOf("\n\n");
      while (splitAt >= 0) {
        const raw = buf.slice(0, splitAt);
        buf = buf.slice(splitAt + 2);
        const headers: AmiHeaders = {};
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          const colon = line.indexOf(":");
          if (colon === -1) continue;
          headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }
        if (Object.keys(headers).length > 0) onMessage({ headers });
        splitAt = buf.indexOf("\n\n");
      }
    },
  };
}
