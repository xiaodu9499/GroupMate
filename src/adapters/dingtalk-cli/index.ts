import { stdoutReply } from "./reply.js";
import type { SourceAdapter } from "../../core/source-adapter.js";
import type { GroupMateConfig } from "../../core/config.js";
import { DwsClient } from "./dws-client.js";
import { reconstructSourceEvent } from "./event-normalizer.js";
import type { SourceEvent, SourceMessage } from "../../core/types.js";

export interface DingTalkCliAdapterOptions {
  config: Pick<GroupMateConfig, "source">;
  dwsClient?: DwsClient;
  replyImpl?: (text: string) => Promise<void>;
}

export class DingTalkCliAdapter implements SourceAdapter {
  readonly name = "dingtalk-cli";
  private readonly dwsClient: DwsClient;

  constructor(private readonly options: DingTalkCliAdapterOptions) {
    this.dwsClient = options.dwsClient ?? new DwsClient({ command: options.config.source.command });
  }

  async start(_onEvent: (event: SourceEvent) => Promise<void>): Promise<void> {
    throw new Error(`${this.name} streaming mode is not implemented. Use dingtalk-custom one-shot command.`);
  }

  async reply(message: SourceMessage, text: string): Promise<void> {
    const reply = this.options.replyImpl ?? stdoutReply;
    await reply(text);
  }

  async reconstructEvent(currentText: string): Promise<SourceEvent> {
    const { source } = this.options.config;
    if (!source.groupId) {
      return reconstructSourceEvent({
        currentText,
        rows: [],
        botName: source.botName,
        groupId: source.groupId,
      });
    }

    let result;
    try {
      result = await this.dwsClient.listMessages({
        groupId: source.groupId,
        limit: source.fetchLimit,
        lookbackMinutes: source.lookbackMinutes,
      });
    } catch (error) {
      if (process.env.GROUPMATE_DEBUG === "1") {
        process.stderr.write(
          `[groupmate:dingtalk-cli] failed to read recent messages: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      }
      return reconstructSourceEvent({
        currentText,
        rows: [],
        botName: source.botName,
        groupId: source.groupId,
      });
    }

    return reconstructSourceEvent({
      currentText,
      rows: result.rows,
      botName: source.botName,
      groupId: source.groupId,
    });
  }

  command(): string {
    return this.options.config.source.command;
  }
}
