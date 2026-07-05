import { describe, expect, it } from "vitest";
import { isUnknownActor, reconstructSourceEvent } from "../../../src/adapters/dingtalk-cli/event-normalizer.js";
import {
  createFallbackMessage,
  findCurrentMessage,
  isBotMessage,
  normalizeDingTalkMessage,
  normalizeText,
} from "../../../src/adapters/dingtalk-cli/message-parser.js";

const FIXTURE_ROWS = [
  {
    content: "大家早上好",
    createTime: "2026-07-04 23:40:00",
    openConversationId: "cid123",
    openMessageId: "msg001",
    sender: "Alice",
    senderOpenDingTalkId: "DSn001",
  },
  {
    content: "@ducf_agent 开始查 告诉我结果",
    createTime: "2026-07-04 23:45:39",
    openConversationId: "cid123",
    openMessageId: "msg002",
    sender: "杜超凡",
    senderOpenDingTalkId: "DSn002",
  },
  {
    content: "@ducf_agent 收到，正在处理",
    createTime: "2026-07-04 23:46:00",
    openConversationId: "cid123",
    openMessageId: "msg003",
    sender: "ducf_agent",
    senderOpenDingTalkId: "bot001",
  },
];

describe("normalizeText", () => {
  it("strips mentions and normalizes whitespace", () => {
    expect(normalizeText("  @ducf_agent   开始查  告诉我结果  ")).toBe("开始查 告诉我结果");
  });
});

describe("normalizeDingTalkMessage", () => {
  it("maps DWS fields to SourceMessage", () => {
    const message = normalizeDingTalkMessage(FIXTURE_ROWS[1]!);
    expect(message.id).toBe("msg002");
    expect(message.channel.source).toBe("dingtalk");
    expect(message.channel.channelId).toBe("cid123");
    expect(message.sender.id).toBe("DSn002");
    expect(message.sender.name).toBe("杜超凡");
    expect(message.text).toBe("@ducf_agent 开始查 告诉我结果");
    expect(message.mentions).toEqual(["ducf_agent"]);
  });
});

describe("findCurrentMessage", () => {
  it("matches @ mention text against recent messages", () => {
    const matched = findCurrentMessage(FIXTURE_ROWS, "开始查 告诉我结果", "ducf_agent");
    expect(matched?.openMessageId).toBe("msg002");
  });

  it("skips bot messages", () => {
    const matched = findCurrentMessage(FIXTURE_ROWS, "收到，正在处理", "ducf_agent");
    expect(matched).toBeUndefined();
  });

  it("returns undefined when no match", () => {
    expect(findCurrentMessage(FIXTURE_ROWS, "完全不相关", "ducf_agent")).toBeUndefined();
  });
});

describe("isBotMessage", () => {
  it("detects bot sender by name", () => {
    expect(isBotMessage(FIXTURE_ROWS[2]!, "ducf_agent")).toBe(true);
    expect(isBotMessage(FIXTURE_ROWS[1]!, "ducf_agent")).toBe(false);
  });
});

describe("reconstructSourceEvent", () => {
  it("builds event from matched row", () => {
    const event = reconstructSourceEvent({
      currentText: "开始查 告诉我结果",
      rows: FIXTURE_ROWS,
      botName: "ducf_agent",
    });
    expect(event.message.id).toBe("msg002");
    expect(event.message.sender.name).toBe("杜超凡");
    expect(isUnknownActor(event)).toBe(false);
  });

  it("falls back to unknown sender when unmatched", () => {
    const event = reconstructSourceEvent({
      currentText: "找不到的消息",
      rows: FIXTURE_ROWS,
      botName: "ducf_agent",
      groupId: "cid123",
    });
    expect(event.message.sender.id).toBe("unknown");
    expect(isUnknownActor(event)).toBe(true);
  });
});

describe("createFallbackMessage", () => {
  it("uses local id and unknown sender", () => {
    const message = createFallbackMessage("hello", { groupId: "cid-test" });
    expect(message.sender.id).toBe("unknown");
    expect(message.channel.channelId).toBe("cid-test");
  });
});
