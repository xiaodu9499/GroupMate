import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChannelContext, ChannelRef, SourceMessage } from "./types.js";

export interface ChannelWorkspaceOptions {
  dataDir?: string;
}

export class ChannelWorkspace {
  private readonly dataDir: string;

  constructor(options: ChannelWorkspaceOptions = {}) {
    this.dataDir = options.dataDir ?? "data";
  }

  async buildContext(channel: ChannelRef): Promise<ChannelContext> {
    const dir = this.channelDir(channel);
    await mkdir(dir, { recursive: true });

    const channelProfile = await this.readOrCreate(path.join(dir, "CHANNEL.md"), "# Channel\n\n");
    const memory = await this.readOrCreate(path.join(dir, "MEMORY.md"), "# Memory\n\n");

    return {
      channel,
      channelProfile,
      memory,
      recentMessages: await this.readRecentMessages(channel),
    };
  }

  async appendMessage(message: SourceMessage): Promise<void> {
    const dir = this.channelDir(message.channel);
    await mkdir(dir, { recursive: true });
    const line = `${JSON.stringify(message)}\n`;
    const file = path.join(dir, "messages.ndjson");
    await writeFile(file, line, { flag: "a" });
  }

  private async readRecentMessages(_channel: ChannelRef): Promise<SourceMessage[]> {
    return [];
  }

  private async readOrCreate(file: string, initial: string): Promise<string> {
    try {
      return await readFile(file, "utf8");
    } catch {
      await writeFile(file, initial, "utf8");
      return initial;
    }
  }

  private channelDir(channel: ChannelRef): string {
    return path.join(this.dataDir, "channels", sanitize(channel.source), sanitize(channel.channelId));
  }
}

function sanitize(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export const defaultChannelWorkspace = new ChannelWorkspace();
