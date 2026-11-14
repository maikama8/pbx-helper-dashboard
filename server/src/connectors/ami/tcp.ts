import net from "node:net";

export interface ByteStream {
  write(data: string): void;
  onData(cb: (chunk: string) => void): void;
  onClose(cb: (error?: Error) => void): void;
  end(): void;
}

export function connectAmiSocket(host: string, port: number): Promise<ByteStream> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const onError = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve({
        write: (data) => {
          socket.write(data);
        },
        onData: (cb) => {
          socket.on("data", (chunk: Buffer) => cb(chunk.toString("utf8")));
        },
        onClose: (cb) => {
          socket.on("error", (error) => cb(error));
          socket.on("close", () => cb());
        },
        end: () => socket.end(),
      });
    });
  });
}
