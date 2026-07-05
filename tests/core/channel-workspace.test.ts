import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelWorkspace } from "../../src/core/channel-workspace.js";
import type { SourceMessage } from "../../src/core/types.js";

function sampleMessage(id: string, timestamp: string, senderName = "Alice"): SourceMessage {
  return {
    id,
    channel: {
      source: "dingtalk",
      transport: "cli",
      workspaceId: "default",
      channelId: "cid-test",
    },
    sender: {
      id: senderName.toLowerCase(),
      name: senderName,
    },
    text: `message ${id}`,
    mentions: [],
    timestamp,
  };
}

describe("ChannelWorkspace", () => {
  let tempDir: string;
  let workspace: ChannelWorkspace;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("deduplicates messages by id", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-ws-"));
    workspace = new ChannelWorkspace({ dataDir: tempDir, historyLimit: 5 });
    const message = sampleMessage("msg-1", "2026-07-04T10:00:00.000Z");

    expect(await workspace.appendMessage(message)).toBe(true);
    expect(await workspace.appendMessage(message)).toBe(false);

    const recent = await workspace.readRecentMessages(message.channel);
    expect(recent).toHaveLength(1);
  });

  it("returns recent messages sorted by timestamp", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-ws-"));
    workspace = new ChannelWorkspace({ dataDir: tempDir, historyLimit: 5, botName: "bot" });

    const channel = sampleMessage("msg-1", "2026-07-04T10:00:00.000Z").channel;
    await workspace.appendMessage(sampleMessage("msg-1", "2026-07-04T10:00:00.000Z"));
    await workspace.appendMessage(sampleMessage("msg-2", "2026-07-04T11:00:00.000Z"));
    await workspace.appendMessage(sampleMessage("msg-3", "2026-07-04T12:00:00.000Z", "bot"));

    const recent = await workspace.readRecentMessages(channel, "bot");
    expect(recent.map((item) => item.id)).toEqual(["msg-1", "msg-2"]);
  });

  it("creates channel files and runs directory", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-ws-"));
    workspace = new ChannelWorkspace({ dataDir: tempDir });
    const channel = sampleMessage("msg-1", "2026-07-04T10:00:00.000Z").channel;

    await workspace.buildContext(channel);
    const dir = workspace.channelDir(channel);
    await expect(readFile(path.join(dir, "CHANNEL.md"), "utf8")).resolves.toContain("# Channel");
    await expect(readFile(path.join(dir, "MEMORY.md"), "utf8")).resolves.toContain("# Memory");
    expect(workspace.runsDir(channel)).toContain(workspace.encodeChannelId(channel.channelId));
  });
});
