import type { ChannelRef } from "../core/types.js";

export function buildChannelKey(channel: ChannelRef): string {
  return `${channel.source}:${channel.workspaceId}:${channel.channelId}`;
}

export function buildMessageDbId(channel: ChannelRef, messageId: string): string {
  return `${channel.source}:${channel.workspaceId}:${channel.channelId}:${messageId}`;
}
