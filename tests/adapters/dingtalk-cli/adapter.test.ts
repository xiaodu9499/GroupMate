import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DingTalkCliAdapter } from "../../../src/adapters/dingtalk-cli/index.js";
import type { DwsListMessagesResult } from "../../../src/adapters/dingtalk-cli/dws-client.js";
import { DEFAULT_CONFIG } from "../../../src/core/config.js";

describe("DingTalkCliAdapter", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reconstructs event from mock dws rows", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-dt-"));
    const rows = [
      {
        content: "@bot 开始查 告诉我结果",
        createTime: "2026-07-04 23:45:39",
        openConversationId: "cid123",
        openMessageId: "msg002",
        sender: "Alice",
        senderOpenDingTalkId: "user-1",
      },
    ];

    const adapter = new DingTalkCliAdapter({
      config: {
        source: {
          ...DEFAULT_CONFIG.source,
          groupId: "cid123",
          botName: "bot",
        },
      },
      dwsClient: {
        listMessages: async (): Promise<DwsListMessagesResult> => ({ rows, raw: rows }),
      } as never,
    });

    const event = await adapter.reconstructEvent("开始查 告诉我结果");
    expect(event.message.id).toBe("msg002");
    expect(event.message.sender.id).toBe("user-1");
  });

  it("falls back to unknown sender without group id", async () => {
    const adapter = new DingTalkCliAdapter({
      config: {
        source: { ...DEFAULT_CONFIG.source },
      },
    });
    const event = await adapter.reconstructEvent("hello");
    expect(event.message.sender.id).toBe("unknown");
  });

  it("falls back to unknown sender when dws message lookup fails", async () => {
    const adapter = new DingTalkCliAdapter({
      config: {
        source: {
          ...DEFAULT_CONFIG.source,
          groupId: "cid123",
          botName: "bot",
        },
      },
      dwsClient: {
        listMessages: async (): Promise<DwsListMessagesResult> => {
          throw new Error("openCid or cid is required");
        },
      } as never,
    });

    const event = await adapter.reconstructEvent("hello");
    expect(event.message.sender.id).toBe("unknown");
    expect(event.message.channel.channelId).toBe("cid123");
  });
});
