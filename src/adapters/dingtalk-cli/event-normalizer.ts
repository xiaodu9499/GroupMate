import type { SourceEvent } from "../../core/types.js";
import {
  createFallbackMessage,
  findCurrentMessage,
  normalizeDingTalkMessage,
  type DingTalkRawMessage,
} from "./message-parser.js";

export interface ReconstructEventOptions {
  currentText: string;
  rows: DingTalkRawMessage[];
  botName?: string;
  groupId?: string;
  workspaceId?: string;
}

export function reconstructSourceEvent(options: ReconstructEventOptions): SourceEvent {
  const matched = findCurrentMessage(options.rows, options.currentText, options.botName);
  if (matched) {
    const message = normalizeDingTalkMessage(matched, {
      workspaceId: options.workspaceId,
    });
    return {
      message,
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
