import type { SourceMessage } from "../../core/types.js";

export interface DingTalkRawMessage {
  content?: string;
  createTime?: string;
  openConversationId?: string;
  openMessageId?: string;
  sender?: string;
  senderOpenDingTalkId?: string;
  [key: string]: unknown;
}

export function normalizeText(text: string): string {
  return text
    .replace(/@[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeDingTalkMessage(
  row: DingTalkRawMessage,
  options: { workspaceId?: string; groupId?: string } = {},
): SourceMessage {
  const senderName = row.sender ?? "unknown";
  const senderId = row.senderOpenDingTalkId ?? senderName;
  const channelId = row.openConversationId ?? options.groupId ?? "unknown";
  const text = row.content ?? "";

  return {
    id: row.openMessageId ?? `local-${Date.now()}`,
    channel: {
      source: "dingtalk",
      transport: "cli",
      workspaceId: options.workspaceId ?? "default",
      channelId,
    },
    sender: {
      id: senderId,
      name: senderName,
      raw: row,
    },
    text,
    mentions: extractMentions(text),
    timestamp: row.createTime ?? new Date().toISOString(),
    raw: row,
  };
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@[^\s]+/g);
  if (!matches) {
    return [];
  }
  return matches.map((mention) => mention.slice(1));
}

export function isBotMessage(message: DingTalkRawMessage | SourceMessage, botName?: string): boolean {
  if (!botName) {
    return false;
  }

  const normalizedBot = normalizeText(botName);
  const senderName =
    "sender" in message && typeof message.sender === "object"
      ? message.sender.name ?? message.sender.id
      : message.sender ?? "";
  const normalizedSender = normalizeText(String(senderName));

  if (normalizedSender === normalizedBot) {
    return true;
  }

  const text = "text" in message ? message.text : message.content ?? "";
  return normalizeText(String(text)).startsWith(`@${normalizedBot}`);
}

export function findCurrentMessage(
  rows: DingTalkRawMessage[],
  currentText: string,
  botName?: string,
): DingTalkRawMessage | undefined {
  const normalizedCurrent = normalizeText(currentText);
  if (!normalizedCurrent) {
    return undefined;
  }

  const candidates = rows.filter((row) => !isBotMessage(row, botName));

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const row = candidates[index];
    const content = row.content ?? "";
    const normalizedContent = normalizeText(content);
    if (!normalizedContent) {
      continue;
    }

    if (normalizedContent.includes(normalizedCurrent) || normalizedCurrent.includes(normalizedContent)) {
      return row;
    }
  }

  return undefined;
}

export function createFallbackMessage(
  currentText: string,
  options: { groupId?: string; workspaceId?: string } = {},
): SourceMessage {
  return {
    id: `local-${Date.now()}`,
    channel: {
      source: "dingtalk",
      transport: "cli",
      workspaceId: options.workspaceId ?? "default",
      channelId: options.groupId ?? "unknown",
    },
    sender: {
      id: "unknown",
      name: "unknown",
    },
    text: currentText,
    mentions: extractMentions(currentText),
    timestamp: new Date().toISOString(),
  };
}
