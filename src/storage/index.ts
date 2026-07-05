import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { GroupMateConfig } from "../core/config.js";
import { buildChannelKey } from "./channel-key.js";
import { resolveDbPath, SqliteDatabase } from "./sqlite/database.js";
import { getSchemaVersion, migrate } from "./sqlite/migrations.js";
import { isFtsAvailable } from "./sqlite/fts.js";
import { SqliteMessageStore } from "./sqlite/message-store.js";
import { SqliteRunLedger } from "./sqlite/run-ledger.js";
import type { DatabaseStatus, MessageStore, RunLedger } from "./types.js";

export interface StorageBundle {
  db: SqliteDatabase;
  messageStore: MessageStore;
  runLedger: RunLedger;
  dbPath: string;
  ftsAvailable: boolean;
  close(): Promise<void>;
}

export interface OpenStorageOptions {
  dataDir?: string;
  dbPath?: string;
}

let cachedBundle: StorageBundle | null = null;
let cachedKey: string | null = null;

export async function openStorage(
  config: Pick<GroupMateConfig, "workspace">,
  options: OpenStorageOptions = {},
): Promise<StorageBundle> {
  const dataDir = options.dataDir ?? config.workspace.dataDir;
  const dbPath = options.dbPath ?? resolveDbPath(dataDir);
  const cacheKey = dbPath;

  if (cachedBundle && cachedKey === cacheKey) {
    return cachedBundle;
  }

  if (cachedBundle) {
    await cachedBundle.close();
    cachedBundle = null;
    cachedKey = null;
  }

  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = new SqliteDatabase({ dbPath });
  await db.open();
  const { ftsAvailable } = await migrate(db);

  const bundle: StorageBundle = {
    db,
    messageStore: new SqliteMessageStore(db),
    runLedger: new SqliteRunLedger(db),
    dbPath,
    ftsAvailable,
    async close() {
      await db.close();
      if (cachedBundle === bundle) {
        cachedBundle = null;
        cachedKey = null;
      }
    },
  };

  cachedBundle = bundle;
  cachedKey = cacheKey;
  return bundle;
}

export async function getDatabaseStatus(config: Pick<GroupMateConfig, "workspace">): Promise<DatabaseStatus> {
  const storage = await openStorage(config);
  const version = await getSchemaVersion(storage.db);
  const fts = await isFtsAvailable(storage.db);

  const channelCount = await storage.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM channels");
  const messageCount = await storage.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM messages");
  const runCount = await storage.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM runs");

  return {
    path: storage.dbPath,
    schemaVersion: version,
    ftsAvailable: fts,
    channelCount: channelCount?.count ?? 0,
    messageCount: messageCount?.count ?? 0,
    runCount: runCount?.count ?? 0,
  };
}

export function resetStorageCache(): void {
  cachedBundle = null;
  cachedKey = null;
}

export { buildChannelKey, resolveDbPath };
