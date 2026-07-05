import {
  createFallbackMessage,
  findCurrentMessage,
  normalizeDingTalkMessage,
  type DingTalkRawMessage,
} from "./message-parser.js";
import type { MessageStore } from "../../storage/types.js";
import type { SourceEvent, SourceMessage } from "../../core/types.js";

export interface ReconstructEventOptions {
  currentText: string;
  rows: DingTalkRawMessage[];
  recentFromStore?: SourceMessage[];
  botName?: string;
  groupId?: string;
  workspaceId?: string;
}

export function reconstructSourceEvent(options: ReconstructEventOptions): SourceEvent {
  const matchedFromBatch = findCurrentMessage(options.rows, options.currentText, options.botName);
  if (matchedFromBatch) {
    return {
      message: normalizeDingTalkMessage(matchedFromBatch, {
        workspaceId: options.workspaceId,
        groupId: options.groupId,
      }),
      trigger: "mention",
    };
  }

  const matchedFromStore = findCurrentMessageInStore(
    options.recentFromStore ?? [],
    options.currentText,
    options.botName,
  );
  if (matchedFromStore) {
    return {
      message: matchedFromStore,
      trigger: "mention",
    };
  }

  return {
    message: createFallbackMessage(options.currentText, {
      groupId: options.groupId,
      workspaceId: options.workspaceId,
    }),
    trigger: "mention",
  };
}

export function isUnknownActor(event: SourceEvent): boolean {
  return event.message.sender.id === "unknown";
}

export async function reconstructEventWithStore(
  options: ReconstructEventOptions & { messageStore?: MessageStore; channel?: SourceMessage["channel"] },
): Promise<SourceEvent> {
  let recentFromStore: SourceMessage[] = [];
  if (options.messageStore && options.channel) {
    recentFromStore = await options.messageStore.getRecentMessages(options.channel, {
      limit: 50,
      excludeBot: true,
      botName: options.botName,
    });
  }

  return reconstructSourceEvent({
    ...options,
    recentFromStore,
  });
}

function findCurrentMessageInStore(
  messages: SourceMessage[],
  currentText: string,
  botName?: string,
): SourceMessage | undefined {
  const normalizedCurrent = normalizeText(currentText);
  if (!normalizedCurrent) {
    return undefined;
  }

  const candidates = messages.filter((message) => !isBotSourceMessage(message, botName));

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]!;
    const normalizedContent = normalizeText(message.text);
    if (!normalizedContent) {
      continue;
    }
    if (normalizedContent.includes(normalizedCurrent) || normalizedCurrent.includes(normalizedContent)) {
      return message;
    }
  }

  return undefined;
}

function isBotSourceMessage(message: SourceMessage, botName?: string): boolean {
  if (!botName) {
    return false;
  }
  const normalizedBot = normalizeText(botName);
  const senderName = normalizeText(message.sender.name ?? message.sender.id);
  return senderName === normalizedBot;
}

function normalizeText(text: string): string {
  return text
    .replace(/@[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
