import type { SourceAdapter } from "../../core/source-adapter.js";
import type { SourceEvent, SourceMessage } from "../../core/types.js";

export interface DingTalkCliAdapterOptions {
  command?: string;
}

export class DingTalkCliAdapter implements SourceAdapter {
  readonly name = "dingtalk-cli";

  constructor(private readonly options: DingTalkCliAdapterOptions = {}) {}

  async start(_onEvent: (event: SourceEvent) => Promise<void>): Promise<void> {
    throw new Error(
      `${this.name} is not implemented yet. First milestone: wrap dws dev connect and normalize events.`,
    );
  }

  async reply(_message: SourceMessage, _text: string): Promise<void> {
    throw new Error(`${this.name} reply is not implemented yet.`);
  }

  command(): string {
    return this.options.command ?? "dws.cmd";
  }
}
