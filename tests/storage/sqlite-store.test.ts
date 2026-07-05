import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openStorage, resetStorageCache } from "../../src/storage/index.js";
import { migrate } from "../../src/storage/sqlite/migrations.js";
import type { SourceMessage } from "../../src/core/types.js";

function sampleMessage(id: string, text: string, timestamp: string): SourceMessage {
  return {
    id,
    channel: {
      source: "dingtalk",
      transport: "cli",
      workspaceId: "default",
      channelId: "cid-test",
    },
    sender: { id: "user-1", name: "Alice" },
    text,
    mentions: [],
    timestamp,
  };
}

describe("SQLite storage", () => {
  let tempDir: string;
  let storage: Awaited<ReturnType<typeof openStorage>> | undefined;

  afterEach(async () => {
    if (storage) {
      await storage.close();
      storage = undefined;
    }
    resetStorageCache();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("migrates schema and upserts messages idempotently", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-db-"));
    storage = await openStorage({ workspace: { dataDir: tempDir } });
    const version = await migrate(storage.db);
    expect(version.version).toBeGreaterThanOrEqual(1);

    const message = sampleMessage("msg-1", "hello sqlite", "2026-07-05T10:00:00.000Z");
    const first = await storage.messageStore.upsertMessage(message);
    const second = await storage.messageStore.upsertMessage(message);
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const recent = await storage.messageStore.getRecentMessages(message.channel, { limit: 10 });
    expect(recent).toHaveLength(1);
  });

  it("creates and lists runs", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-db-"));
    storage = await openStorage({ workspace: { dataDir: tempDir } });
    const channel = sampleMessage("msg-2", "run test", "2026-07-05T11:00:00.000Z").channel;

    const run = await storage.runLedger.createRun({
      channel,
      sourceMessageId: "msg-2",
      requester: { id: "user-1", name: "Alice" },
      permission: { mode: "ask", sandbox: "read-only", reason: "test" },
      executor: "mock",
      sandbox: "read-only",
      status: "completed",
    });

    await storage.runLedger.appendEvent(run.id, { type: "created" });
    const listed = await storage.runLedger.listRuns(channel, { limit: 5 });
    expect(listed.some((item) => item.id === run.id)).toBe(true);

    const events = await storage.runLedger.listEvents(run.id);
    expect(events.some((event) => event.type === "created")).toBe(true);
  });

  it("searches messages by keyword", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-db-"));
    storage = await openStorage({ workspace: { dataDir: tempDir } });
    const channel = sampleMessage("msg-3", "alpha", "2026-07-05T12:00:00.000Z").channel;

    await storage.messageStore.upsertMessage(sampleMessage("msg-3", "部署生产环境", "2026-07-05T12:00:00.000Z"));
    await storage.messageStore.upsertMessage(sampleMessage("msg-4", "普通讨论", "2026-07-05T12:01:00.000Z"));

    const results = await storage.messageStore.searchMessages(channel, "部署", { limit: 5 });
    expect(results.some((item) => item.id === "msg-3")).toBe(true);
  });
});
