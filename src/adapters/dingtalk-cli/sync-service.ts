import type { GroupMateConfig } from "../../core/config.js";
import type { ChannelRef } from "../../core/types.js";
import type { MessageStore } from "../../storage/types.js";
import { getLogger } from "../../core/logger.js";
import { DwsClient, buildDwsListMessagesArgs } from "./dws-client.js";
import { DwsError } from "./dws-error.js";
import { normalizeDingTalkMessage, type DingTalkRawMessage } from "./message-parser.js";

export interface DingTalkSyncOptions {
  config: Pick<GroupMateConfig, "source">;
  messageStore: MessageStore;
  dwsClient?: DwsClient;
  groupId: string;
  since?: string;
  limit?: number;
}

export interface DingTalkSyncResult {
  fetched: number;
  inserted: number;
  duplicated: number;
  skippedBot: number;
  channel: ChannelRef;
}

export async function syncDingTalkMessages(options: DingTalkSyncOptions): Promise<DingTalkSyncResult> {
  const logger = getLogger();
  const client = options.dwsClient ?? new DwsClient({ command: options.config.source.command });
  const groupId = options.groupId;
  const limit = options.limit ?? options.config.source.fetchLimit;
  const channel: ChannelRef = {
    source: "dingtalk",
    transport: "cli",
    workspaceId: "default",
    channelId: groupId,
  };

  logger.info("dws.list.started", { groupId, limit, since: options.since });

  let rows: DingTalkRawMessage[];
  try {
    const result = await client.listMessages({
      groupId,
      limit,
      since: options.since,
      lookbackMinutes: options.since ? undefined : options.config.source.lookbackMinutes,
      forward: true,
    });
    rows = result.rows;
    logger.info("dws.list.completed", { groupId, count: rows.length });
  } catch (error) {
    logger.error("dws.list.failed", {
      groupId,
      error: error instanceof Error ? error.message : String(error),
      category: error instanceof DwsError ? error.category : "unknown",
    });
    throw error;
  }

  await options.messageStore.upsertChannel(channel, { botName: options.config.source.botName });

  const messages = rows.map((row) =>
    normalizeDingTalkMessage(row, { workspaceId: "default", groupId }),
  );

  const batch = await options.messageStore.upsertMessages(messages, {
    botName: options.config.source.botName,
  });

  const lastMessage = messages[messages.length - 1];
  await options.messageStore.updateChannelState(channel, {
    lastSyncTime: new Date().toISOString(),
    lastMessageId: lastMessage?.id,
    lastCursor: lastMessage?.timestamp,
  });

  return {
    ...batch,
    channel,
  };
}

export { buildDwsListMessagesArgs };
