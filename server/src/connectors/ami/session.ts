import { createAmiParser, encodeAction, type AmiMessage } from "./parser.js";

export type Finish = (message: AmiMessage) => boolean;

interface Waiter {
  messages: AmiMessage[];
  finish: Finish;
  resolve: (messages: AmiMessage[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let actionSeq = 1;

export class AmiSession {
  private readonly waiters = new Map<string, Waiter>();
  private readonly listeners = new Set<(message: AmiMessage) => void>();
  private readonly parser: { push(chunk: string): void };

  constructor(private readonly write: (payload: string) => void) {
    this.parser = createAmiParser((message) => this.onMessage(message));
  }

  push(chunk: string): void {
    this.parser.push(chunk);
  }

  onEvent(listener: (message: AmiMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  request(fields: Record<string, string>, finish: Finish, timeoutMs = 8000): Promise<AmiMessage[]> {
    const id = `span-${actionSeq++}`;
    const messages: AmiMessage[] = [];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`AMI ${fields.Action ?? "action"} timed out`));
      }, timeoutMs);
      timer.unref?.();
      this.waiters.set(id, { messages, finish, resolve, reject, timer });
      this.write(encodeAction({ ...fields, ActionID: id }));
    });
  }

  private onMessage(message: AmiMessage): void {
    const id = message.headers.ActionID;
    const waiter = id ? this.waiters.get(id) : undefined;
    if (waiter) {
      waiter.messages.push(message);
      if (waiter.finish(message)) {
        clearTimeout(waiter.timer);
        this.waiters.delete(id as string);
        waiter.resolve(waiter.messages);
      }
      return;
    }
    if (message.headers.Event) {
      for (const listener of this.listeners) listener(message);
    }
  }
}

export function untilComplete(completeEvent: string): Finish {
  return (message) => message.headers.Event === completeEvent || message.headers.Response === "Error";
}
