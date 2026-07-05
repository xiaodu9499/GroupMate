import { stdoutReply } from "./reply.js";
import type { SourceAdapter } from "../../core/source-adapter.js";
import type { GroupMateConfig } from "../../core/config.js";
import type { MessageStore } from "../../storage/types.js";
import { getLogger } from "../../core/logger.js";
import { DwsClient } from "./dws-client.js";
import { reconstructEventWithStore } from "./event-normalizer.js";
import { syncDingTalkMessages } from "./sync-service.js";
import { normalizeDingTalkMessage } from "./message-parser.js";
import type { SourceEvent, SourceMessage } from "../../core/types.js";

export interface DingTalkCliAdapterOptions {
  config: Pick<GroupMateConfig, "source">;
  messageStore?: MessageStore;
  dwsClient?: DwsClient;
  replyImpl?: (text: string) => Promise<void>;
}

export class DingTalkCliAdapter implements SourceAdapter {
  readonly name = "dingtalk-cli";
  private readonly dwsClient: DwsClient;
  private readonly logger = getLogger();

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

  async syncRecentMessages(): Promise<void> {
    const { source } = this.options.config;
    if (!source.groupId || !this.options.messageStore) {
      return;
    }

    try {
      await syncDingTalkMessages({
        config: this.options.config,
        messageStore: this.options.messageStore,
        dwsClient: this.dwsClient,
        groupId: source.groupId,
        limit: source.fetchLimit,
      });
    } catch (error) {
      this.logger.warn("dws.list.failed", {
        groupId: source.groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async reconstructEvent(currentText: string): Promise<SourceEvent> {
    const { source } = this.options.config;
    const channel = {
      source: "dingtalk" as const,
      transport: "cli" as const,
      workspaceId: "default",
      channelId: source.groupId ?? "unknown",
    };

    if (source.groupId && this.options.messageStore) {
      await this.syncRecentMessages();
    }

    if (!source.groupId) {
      return reconstructEventWithStore({
        currentText,
        rows: [],
        botName: source.botName,
        groupId: source.groupId,
        messageStore: this.options.messageStore,
        channel,
      });
    }

    let rows: import("./message-parser.js").DingTalkRawMessage[] = [];
    try {
      const result = await this.dwsClient.listMessages({
        groupId: source.groupId,
        limit: source.fetchLimit,
        lookbackMinutes: source.lookbackMinutes,
      });
      rows = result.rows;

      if (this.options.messageStore) {
        const messages = rows.map((row) =>
          normalizeDingTalkMessage(row, { workspaceId: "default", groupId: source.groupId }),
        );
        await this.options.messageStore.upsertMessages(messages, { botName: source.botName });
      }
    } catch (error) {
      if (process.env.GROUPMATE_DEBUG === "1") {
        process.stderr.write(
          `[groupmate:dingtalk-cli] failed to read recent messages: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      }
    }

    return reconstructEventWithStore({
      currentText,
      rows,
      botName: source.botName,
      groupId: source.groupId,
      messageStore: this.options.messageStore,
      channel,
    });
  }

  command(): string {
    return this.options.config.source.command;
  }
}
