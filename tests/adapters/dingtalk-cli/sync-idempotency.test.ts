import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncDingTalkMessages } from "../../../src/adapters/dingtalk-cli/sync-service.js";
import { openStorage, resetStorageCache } from "../../../src/storage/index.js";
import { DEFAULT_CONFIG } from "../../../src/core/config.js";
import type { DwsClient } from "../../../src/adapters/dingtalk-cli/dws-client.js";

describe("DingTalk sync", () => {
  let tempDir: string;

  afterEach(async () => {
    resetStorageCache();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("syncs messages idempotently", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-sync-"));
    const storage = await openStorage({ workspace: { dataDir: tempDir } });
    const mockClient = {
      listMessages: vi.fn().mockResolvedValue({
        rows: [
          {
            content: "hello sync",
            createTime: "2026-07-05T10:00:00.000Z",
            openConversationId: "cid-sync",
            openMessageId: "msg-sync-1",
            sender: "Alice",
            senderOpenDingTalkId: "user-1",
          },
        ],
        raw: [],
      }),
    } as unknown as DwsClient;

    const config = { ...DEFAULT_CONFIG, source: { ...DEFAULT_CONFIG.source, groupId: "cid-sync" } };
    const first = await syncDingTalkMessages({
      config,
      messageStore: storage.messageStore,
      dwsClient: mockClient,
      groupId: "cid-sync",
    });
    const second = await syncDingTalkMessages({
      config,
      messageStore: storage.messageStore,
      dwsClient: mockClient,
      groupId: "cid-sync",
    });

    expect(first.inserted).toBe(1);
    expect(second.duplicated).toBe(1);
    await storage.close();
  });
});
