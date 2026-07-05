import type { SqliteDatabase } from "./database.js";

export async function isFtsAvailable(db: SqliteDatabase): Promise<boolean> {
  try {
    await db.get("SELECT fts5(?)", ["test"]);
    return true;
  } catch {
    return false;
  }
}

export async function createFtsTable(db: SqliteDatabase): Promise<void> {
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
      text,
      sender_name,
      content='messages',
      content_rowid='rowid'
    )
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO message_fts(rowid, text, sender_name) VALUES (new.rowid, new.text, new.sender_name);
    END
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO message_fts(message_fts, rowid, text, sender_name) VALUES('delete', old.rowid, old.text, old.sender_name);
    END
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO message_fts(message_fts, rowid, text, sender_name) VALUES('delete', old.rowid, old.text, old.sender_name);
      INSERT INTO message_fts(rowid, text, sender_name) VALUES (new.rowid, new.text, new.sender_name);
    END
  `);
}

export async function rebuildFtsIndex(db: SqliteDatabase): Promise<void> {
  const available = await isFtsAvailable(db);
  if (!available) {
    return;
  }
  await db.exec("INSERT INTO message_fts(message_fts) VALUES('rebuild')");
}
