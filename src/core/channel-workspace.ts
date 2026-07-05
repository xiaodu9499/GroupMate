import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChannelContext, ChannelRef, SourceMessage } from "./types.js";

export interface ChannelWorkspaceOptions {
  dataDir?: string;
  historyLimit?: number;
  botName?: string;
}

export class ChannelWorkspace {
  private readonly dataDir: string;
  private readonly historyLimit: number;
  private readonly botName?: string;

  constructor(options: ChannelWorkspaceOptions = {}) {
    this.dataDir = options.dataDir ?? "data";
    this.historyLimit = options.historyLimit ?? 10;
    this.botName = options.botName;
  }

  async buildContext(channel: ChannelRef, _options: { botName?: string } = {}): Promise<ChannelContext> {
    const dir = await this.ensureChannelDir(channel);
    await mkdir(path.join(dir, "runs"), { recursive: true });

    const channelProfile = await this.readOrCreate(path.join(dir, "CHANNEL.md"), "# Channel\n\n");
    const memory = await this.readOrCreate(path.join(dir, "MEMORY.md"), "# Memory\n\n");

    return {
      channel,
      channelProfile,
      memory,
      recentMessages: [],
    };
  }

  async appendMessage(message: SourceMessage): Promise<boolean> {
    const dir = await this.ensureChannelDir(message.channel);
    const file = path.join(dir, "messages.ndjson");
    const existing = await this.readAllMessages(file);
    if (existing.some((item) => item.id === message.id)) {
      return false;
    }

    const line = `${JSON.stringify(message)}\n`;
    await writeFile(file, line, { flag: "a" });
    return true;
  }

  async readRecentMessages(channel: ChannelRef, botName?: string): Promise<SourceMessage[]> {
    const file = path.join(this.channelDir(channel), "messages.ndjson");
    const messages = await this.readAllMessages(file);
    const filtered = messages.filter((message) => !this.isBotMessage(message, botName ?? this.botName));
    filtered.sort((left, right) => compareTimestamp(left.timestamp, right.timestamp));
    return filtered.slice(-this.historyLimit);
  }

  runsDir(channel: ChannelRef): string {
    return path.join(this.channelDir(channel), "runs");
  }

  encodeChannelId(channelId: string): string {
    return Buffer.from(channelId).toString("base64url");
  }

  private async ensureChannelDir(channel: ChannelRef): Promise<string> {
    const dir = this.channelDir(channel);
    await mkdir(dir, { recursive: true });
    await mkdir(path.join(dir, "runs"), { recursive: true });
    return dir;
  }

  private async readAllMessages(file: string): Promise<SourceMessage[]> {
    try {
      const content = await readFile(file, "utf8");
      const messages: SourceMessage[] = [];
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        try {
          messages.push(JSON.parse(line) as SourceMessage);
        } catch {
          // Skip malformed lines.
        }
      }
      return messages;
    } catch {
      return [];
    }
  }

  private isBotMessage(message: SourceMessage, botName?: string): boolean {
    if (!botName) {
      return false;
    }
    const normalizedBot = normalizeActor(botName);
    const senderName = normalizeActor(message.sender.name ?? message.sender.id);
    return senderName === normalizedBot;
  }

  private async readOrCreate(file: string, initial: string): Promise<string> {
    try {
      return await readFile(file, "utf8");
    } catch {
      await writeFile(file, initial, "utf8");
      return initial;
    }
  }

  channelDir(channel: ChannelRef): string {
    return path.join(
      this.dataDir,
      "channels",
      sanitizeSegment(channel.source),
      this.encodeChannelId(channel.channelId),
    );
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeActor(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return leftTime - rightTime;
  }
  return left.localeCompare(right);
}

export const defaultChannelWorkspace = new ChannelWorkspace();
