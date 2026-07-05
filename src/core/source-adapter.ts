import type { SourceEvent, SourceMessage } from "./types.js";

export interface SourceAdapter {
  readonly name: string;
  start(onEvent: (event: SourceEvent) => Promise<void>): Promise<void>;
  stop?(): Promise<void>;
  reply(message: SourceMessage, text: string): Promise<void>;
}
