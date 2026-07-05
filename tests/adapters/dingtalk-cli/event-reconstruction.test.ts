import { describe, expect, it } from "vitest";
import { reconstructSourceEvent } from "../../../src/adapters/dingtalk-cli/event-normalizer.js";
import type { SourceMessage } from "../../../src/core/types.js";

describe("event reconstruction", () => {
  it("prefers batch match then sqlite recent messages", () => {
    const recentFromStore: SourceMessage[] = [
      {
        id: "stored-1",
        channel: {
          source: "dingtalk",
          transport: "cli",
          workspaceId: "default",
          channelId: "cid-test",
        },
        sender: { id: "user-2", name: "Bob" },
        text: "stored fallback message",
        mentions: [],
        timestamp: "2026-07-05T09:00:00.000Z",
      },
    ];

    const fromStore = reconstructSourceEvent({
      currentText: "stored fallback message",
      rows: [],
      recentFromStore,
      groupId: "cid-test",
    });
    expect(fromStore.message.sender.id).toBe("user-2");

    const fromBatch = reconstructSourceEvent({
      currentText: "batch current message",
      rows: [
        {
          content: "batch current message",
          openMessageId: "batch-1",
          sender: "Alice",
          senderOpenDingTalkId: "user-1",
          openConversationId: "cid-test",
          createTime: "2026-07-05T10:00:00.000Z",
        },
      ],
      recentFromStore,
      groupId: "cid-test",
    });
    expect(fromBatch.message.sender.id).toBe("user-1");
  });

  it("falls back to unknown actor", () => {
    const event = reconstructSourceEvent({
      currentText: "totally unknown text",
      rows: [],
      recentFromStore: [],
      groupId: "cid-test",
    });
    expect(event.message.sender.id).toBe("unknown");
  });
});
