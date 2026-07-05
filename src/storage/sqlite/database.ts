import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";

export interface SqliteDatabaseOptions {
  dbPath: string;
}

export class SqliteDatabase {
  readonly dbPath: string;
  private db: sqlite3.Database | null = null;

  constructor(options: SqliteDatabaseOptions) {
    this.dbPath = options.dbPath;
  }

  async open(): Promise<void> {
    if (this.db) {
      return;
    }
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = await openDatabase(this.dbPath);
    await this.run("PRAGMA foreign_keys = ON");
    await this.run("PRAGMA journal_mode = WAL");
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }
    const db = this.db;
    this.db = null;
    await closeDatabase(db);
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastID: number }> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(this: sqlite3.RunResult, error: Error | null) {
        if (error) {
          reject(error);
          return;
        }
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      db.get(sql, params, (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row as T | undefined);
      });
    });
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows as T[]);
      });
    });
  }

  async exec(sql: string): Promise<void> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      db.exec(sql, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private requireDb(): sqlite3.Database {
    if (!this.db) {
      throw new Error("Database is not open. Call open() first.");
    }
    return this.db;
  }
}

function openDatabase(dbPath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(db);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function resolveDbPath(dataDir: string): string {
  const envPath = process.env.GROUPMATE_DB_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.join(dataDir, "groupmate.db");
}
