import type { ChannelRef, SourceMessage } from "../../core/types.js";
import { buildChannelKey, buildMessageDbId } from "../channel-key.js";
import type {
  BatchUpsertResult,
  ChannelMetadata,
  ChannelRecord,
  ChannelState,
  MessageStore,
  RecentMessageOptions,
  SearchOptions,
  UpsertResult,
} from "../types.js";
import type { SqliteDatabase } from "./database.js";
import { isFtsAvailable } from "./fts.js";

interface MessageRow {
  id: string;
  channel_key: string;
  source: string;
  transport: string;
  workspace_id: string;
  channel_id: string;
  message_id: string;
  sender_id: string;
  sender_name: string | null;
  staff_id: string | null;
  text: string;
  mentions_json: string;
  timestamp: string;
  is_bot: number;
  raw_json: string | null;
  created_at: string;
}

export class SqliteMessageStore implements MessageStore {
  private ftsAvailable: boolean | null = null;

  constructor(private readonly db: SqliteDatabase) {}

  async upsertChannel(channel: ChannelRef, metadata: ChannelMetadata = {}): Promise<ChannelRecord> {
    const now = new Date().toISOString();
    const id = buildChannelKey(channel);
    const existing = await this.db.get<ChannelRecordRow>(
      "SELECT * FROM channels WHERE source = ? AND workspace_id = ? AND channel_id = ?",
      [channel.source, channel.workspaceId, channel.channelId],
    );

    if (existing) {
      await this.db.run(
        `UPDATE channels SET display_name = ?, bot_name = ?, updated_at = ? WHERE id = ?`,
        [metadata.displayName ?? existing.display_name, metadata.botName ?? existing.bot_name, now, existing.id],
      );
      return rowToChannelRecord({
        ...existing,
        display_name: metadata.displayName ?? existing.display_name,
        bot_name: metadata.botName ?? existing.bot_name,
        updated_at: now,
      });
    }

    await this.db.run(
      `INSERT INTO channels (id, source, transport, workspace_id, channel_id, display_name, bot_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        channel.source,
        channel.transport,
        channel.workspaceId,
        channel.channelId,
        metadata.displayName ?? null,
        metadata.botName ?? null,
        now,
        now,
      ],
    );

    return {
      id,
      source: channel.source,
      transport: channel.transport,
      workspaceId: channel.workspaceId,
      channelId: channel.channelId,
      displayName: metadata.displayName,
      botName: metadata.botName,
      createdAt: now,
      updatedAt: now,
    };
  }

  async upsertMessage(message: SourceMessage, options: { isBot?: boolean } = {}): Promise<UpsertResult> {
    const channelKey = buildChannelKey(message.channel);
    const dbId = buildMessageDbId(message.channel, message.id);
    const now = new Date().toISOString();
    const existing = await this.db.get<{ id: string }>("SELECT id FROM messages WHERE id = ?", [dbId]);

    if (existing) {
      return { inserted: false, messageId: message.id };
    }

    await this.db.run(
      `INSERT INTO messages (
        id, channel_key, source, transport, workspace_id, channel_id, message_id,
        sender_id, sender_name, staff_id, text, mentions_json, timestamp, is_bot, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbId,
        channelKey,
        message.channel.source,
        message.channel.transport,
        message.channel.workspaceId,
        message.channel.channelId,
        message.id,
        message.sender.id,
        message.sender.name ?? null,
        message.sender.staffId ?? null,
        message.text,
        JSON.stringify(message.mentions),
        message.timestamp,
        options.isBot ? 1 : 0,
        message.raw ? JSON.stringify(message.raw) : null,
        now,
      ],
    );

    return { inserted: true, messageId: message.id };
  }

  async upsertMessages(messages: SourceMessage[], options: { botName?: string } = {}): Promise<BatchUpsertResult> {
    let inserted = 0;
    let duplicated = 0;
    let skippedBot = 0;

    for (const message of messages) {
      const isBot = isBotMessage(message, options.botName);
      if (isBot) {
        skippedBot += 1;
        continue;
      }
      const result = await this.upsertMessage(message, { isBot });
      if (result.inserted) {
        inserted += 1;
      } else {
        duplicated += 1;
      }
    }

    return {
      fetched: messages.length,
      inserted,
      duplicated,
      skippedBot,
    };
  }

  async getRecentMessages(channel: ChannelRef, options: RecentMessageOptions = {}): Promise<SourceMessage[]> {
    const channelKey = buildChannelKey(channel);
    const limit = options.limit ?? 80;
    const excludeBot = options.excludeBot ?? true;

    let sql = "SELECT * FROM messages WHERE channel_key = ?";
    const params: unknown[] = [channelKey];

    if (excludeBot) {
      sql += " AND is_bot = 0";
    }

    sql += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    const rows = await this.db.all<MessageRow>(sql, params);
    return rows.map(rowToSourceMessage).reverse();
  }

  async searchMessages(channel: ChannelRef, query: string, options: SearchOptions = {}): Promise<SourceMessage[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const channelKey = buildChannelKey(channel);
    const limit = options.limit ?? 20;
    const excludeBot = options.excludeBot ?? true;
    const fts = await this.ensureFtsAvailable();

    if (fts) {
      try {
        let sql = `
          SELECT m.* FROM messages m
          JOIN message_fts fts ON m.rowid = fts.rowid
          WHERE m.channel_key = ? AND message_fts MATCH ?
        `;
        const params: unknown[] = [channelKey, escapeFtsQuery(trimmed)];

        if (excludeBot) {
          sql += " AND m.is_bot = 0";
        }

        sql += " ORDER BY m.timestamp DESC LIMIT ?";
        params.push(limit);

        const rows = await this.db.all<MessageRow>(sql, params);
        if (rows.length > 0) {
          return rows.map(rowToSourceMessage);
        }
      } catch {
        // Fall back to LIKE when FTS tokenization fails (e.g. CJK).
      }
    }

    let sql = "SELECT * FROM messages WHERE channel_key = ? AND text LIKE ?";
    const params: unknown[] = [channelKey, `%${trimmed.replace(/[%_]/g, "")}%`];

    if (excludeBot) {
      sql += " AND is_bot = 0";
    }

    sql += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    const rows = await this.db.all<MessageRow>(sql, params);
    return rows.map(rowToSourceMessage);
  }

  async getMessageByPlatformId(channel: ChannelRef, messageId: string): Promise<SourceMessage | null> {
    const dbId = buildMessageDbId(channel, messageId);
    const row = await this.db.get<MessageRow>("SELECT * FROM messages WHERE id = ?", [dbId]);
    return row ? rowToSourceMessage(row) : null;
  }

  async getChannelState(channel: ChannelRef): Promise<ChannelState | null> {
    const channelKey = buildChannelKey(channel);
    const row = await this.db.get<ChannelStateRow>("SELECT * FROM channel_state WHERE channel_key = ?", [channelKey]);
    return row ? rowToChannelState(row) : null;
  }

  async updateChannelState(
    channel: ChannelRef,
    patch: Partial<Omit<ChannelState, "channelKey">>,
  ): Promise<void> {
    const channelKey = buildChannelKey(channel);
    const now = new Date().toISOString();
    const existing = await this.getChannelState(channel);

    if (existing) {
      await this.db.run(
        `UPDATE channel_state SET last_sync_time = ?, last_message_id = ?, last_cursor = ?, updated_at = ? WHERE channel_key = ?`,
        [
          patch.lastSyncTime ?? existing.lastSyncTime ?? null,
          patch.lastMessageId ?? existing.lastMessageId ?? null,
          patch.lastCursor ?? existing.lastCursor ?? null,
          now,
          channelKey,
        ],
      );
      return;
    }

    await this.db.run(
      `INSERT INTO channel_state (channel_key, last_sync_time, last_message_id, last_cursor, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        channelKey,
        patch.lastSyncTime ?? null,
        patch.lastMessageId ?? null,
        patch.lastCursor ?? null,
        now,
      ],
    );
  }

  private async ensureFtsAvailable(): Promise<boolean> {
    if (this.ftsAvailable === null) {
      this.ftsAvailable = await isFtsAvailable(this.db);
    }
    return this.ftsAvailable;
  }
}

interface ChannelRecordRow {
  id: string;
  source: string;
  transport: string;
  workspace_id: string;
  channel_id: string;
  display_name: string | null;
  bot_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ChannelStateRow {
  channel_key: string;
  last_sync_time: string | null;
  last_message_id: string | null;
  last_cursor: string | null;
  updated_at: string;
}

function rowToChannelRecord(row: ChannelRecordRow): ChannelRecord {
  return {
    id: row.id,
    source: row.source,
    transport: row.transport,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    displayName: row.display_name ?? undefined,
    botName: row.bot_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChannelState(row: ChannelStateRow): ChannelState {
  return {
    channelKey: row.channel_key,
    lastSyncTime: row.last_sync_time ?? undefined,
    lastMessageId: row.last_message_id ?? undefined,
    lastCursor: row.last_cursor ?? undefined,
    updatedAt: row.updated_at,
  };
}

function rowToSourceMessage(row: MessageRow): SourceMessage {
  let mentions: string[] = [];
  try {
    mentions = JSON.parse(row.mentions_json) as string[];
  } catch {
    mentions = [];
  }

  return {
    id: row.message_id,
    channel: {
      source: row.source,
      transport: row.transport,
      workspaceId: row.workspace_id,
      channelId: row.channel_id,
    },
    sender: {
      id: row.sender_id,
      name: row.sender_name ?? undefined,
      staffId: row.staff_id ?? undefined,
    },
    text: row.text,
    mentions,
    timestamp: row.timestamp,
    raw: row.raw_json ? JSON.parse(row.raw_json) : undefined,
  };
}

function isBotMessage(message: SourceMessage, botName?: string): boolean {
  if (!botName) {
    return false;
  }
  const normalizedBot = normalizeActor(botName);
  const senderName = normalizeActor(message.sender.name ?? message.sender.id);
  return senderName === normalizedBot;
}

function normalizeActor(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function escapeFtsQuery(query: string): string {
  return query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" ");
}
