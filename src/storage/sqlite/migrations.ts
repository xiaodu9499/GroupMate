import type { SqliteDatabase } from "./database.js";
import { createFtsTable, isFtsAvailable } from "./fts.js";

const CURRENT_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      transport TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      display_name TEXT,
      bot_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source, workspace_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_key TEXT NOT NULL,
      source TEXT NOT NULL,
      transport TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      staff_id TEXT,
      text TEXT NOT NULL,
      mentions_json TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      is_bot INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source, workspace_id, channel_id, message_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_key, timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_key, created_at)`,
    `CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      channel_key TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      requester_name TEXT,
      permission_mode TEXT NOT NULL,
      sandbox TEXT NOT NULL,
      executor TEXT NOT NULL,
      status TEXT NOT NULL,
      confirmation_status TEXT NOT NULL DEFAULT 'not_required',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      result_text TEXT,
      error_code TEXT,
      error_message TEXT,
      raw_summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_runs_channel_started ON runs(channel_key, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_runs_source_message ON runs(channel_key, source_message_id)`,
    `CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT,
      data_json TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS channel_state (
      channel_key TEXT PRIMARY KEY,
      last_sync_time TEXT,
      last_message_id TEXT,
      last_cursor TEXT,
      updated_at TEXT NOT NULL
    )`,
  ],
};

export async function migrate(db: SqliteDatabase): Promise<{ version: number; ftsAvailable: boolean }> {
  let current = 0;
  try {
    const row = await db.get<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations");
    current = row?.version ?? 0;
  } catch {
    current = 0;
  }

  for (let version = current + 1; version <= CURRENT_VERSION; version += 1) {
    const statements = MIGRATIONS[version];
    if (!statements) {
      continue;
    }
    for (const sql of statements) {
      await db.run(sql);
    }
    await db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
      version,
      new Date().toISOString(),
    ]);
  }

  const ftsAvailable = await isFtsAvailable(db);
  if (ftsAvailable) {
    await createFtsTable(db);
  }

  const latest = await db.get<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations");
  return { version: latest?.version ?? 0, ftsAvailable };
}

export async function getSchemaVersion(db: SqliteDatabase): Promise<number> {
  try {
    const row = await db.get<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations");
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}
