import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.js";
import type { Me, Snapshot } from "../types.js";

interface LiveValue {
  me: Me;
  snap: Snapshot | null;
  connected: boolean;
}

const LiveContext = createContext<LiveValue | null>(null);

export function LiveProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stop = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    api<Snapshot>("/api/snapshot")
      .then((first) => {
        if (!stop) setSnap(first);
      })
      .catch(() => undefined);

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/ws`);
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!stop) retry = setTimeout(connect, 1500);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as Snapshot;
          if (message.type === "snapshot") setSnap(message);
        } catch {
          // A frame that is not a snapshot is ignored. The next one replaces it.
        }
      };
    };
    connect();
    return () => {
      stop = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return <LiveContext.Provider value={{ me, snap, connected }}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveValue {
  const value = useContext(LiveContext);
  if (!value) throw new Error("useLive outside provider");
  return value;
}
