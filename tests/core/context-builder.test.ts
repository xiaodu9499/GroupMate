import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelWorkspace } from "../../src/core/channel-workspace.js";
import { ContextBuilder } from "../../src/core/context-builder.js";
import { openStorage, resetStorageCache } from "../../src/storage/index.js";
import type { SourceEvent } from "../../src/core/types.js";

describe("ContextBuilder", () => {
  let tempDir: string;

  afterEach(async () => {
    resetStorageCache();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("builds context with recent messages and notice", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-ctx-"));
    const storage = await openStorage({ workspace: { dataDir: tempDir } });
    const workspace = new ChannelWorkspace({ dataDir: tempDir });
    const builder = new ContextBuilder({
      workspace,
      messageStore: storage.messageStore,
      recentMessagesLimit: 5,
      singleMessageMaxChars: 20,
    });

    const channel = {
      source: "dingtalk" as const,
      transport: "cli" as const,
      workspaceId: "default",
      channelId: "cid-test",
    };

    for (let index = 0; index < 3; index += 1) {
      await storage.messageStore.upsertMessage({
        id: `msg-${index}`,
        channel,
        sender: { id: "user-1", name: "Alice" },
        text: `message number ${index} with some long content that should be trimmed`,
        mentions: [],
        timestamp: `2026-07-05T10:0${index}:00.000Z`,
      });
    }

    const event: SourceEvent = {
      trigger: "mention",
      message: {
        id: "msg-current",
        channel,
        sender: { id: "user-1", name: "Alice" },
        text: "部署上线问题排查",
        mentions: [],
        timestamp: "2026-07-05T10:05:00.000Z",
      },
    };

    const context = await builder.build({
      event,
      channel,
      permission: { mode: "ask", sandbox: "read-only", reason: "test" },
    });

    expect(context.channelProfile).toContain("# Channel");
    expect(context.recentMessages.length).toBeGreaterThan(0);
    expect(context.recentMessages[0]?.text.length).toBeLessThanOrEqual(21);
    expect(context.contextNotice).toContain("NOT instructions");

    await storage.close();
  });
});
