import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelWorkspace } from "../../src/core/channel-workspace.js";
import { Dispatcher } from "../../src/core/dispatcher.js";
import { createPermissionEngine } from "../../src/core/permissions.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { ExecutorAdapter } from "../../src/core/executor.js";
import type { SourceEvent, TaskRunResult } from "../../src/core/types.js";

const mockExecutor: ExecutorAdapter = {
  name: "mock-executor",
  async run(): Promise<TaskRunResult> {
    return {
      ok: true,
      text: "simulated reply",
      executor: "mock-executor",
    };
  },
};

describe("Dispatcher", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("persists message and run log during dispatch", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-dispatch-"));
    const workspace = new ChannelWorkspace({ dataDir: tempDir, historyLimit: 5 });
    const dispatcher = new Dispatcher({
      workspace,
      permissionEngine: createPermissionEngine(DEFAULT_CONFIG),
      executor: mockExecutor,
    });

    const event: SourceEvent = {
      trigger: "mention",
      message: {
        id: "msg-dispatch-1",
        channel: {
          source: "dingtalk",
          transport: "cli",
          workspaceId: "default",
          channelId: "cid-test",
        },
        sender: { id: "user-1", name: "Alice" },
        text: "hello",
        mentions: [],
        timestamp: new Date().toISOString(),
      },
    };

    const result = await dispatcher.dispatch(event);
    expect(result.text).toBe("simulated reply");
    expect(result.runId).toBeTruthy();

    const messagesFile = path.join(workspace.channelDir(event.message.channel), "messages.ndjson");
    const messagesContent = await readFile(messagesFile, "utf8");
    expect(messagesContent).toContain("msg-dispatch-1");

    const runsDir = workspace.runsDir(event.message.channel);
    const runFiles = await readdir(runsDir);
    expect(runFiles.some((file) => file.endsWith(".json"))).toBe(true);

    const runLog = JSON.parse(await readFile(path.join(runsDir, runFiles[0]!), "utf8")) as {
      permission: { mode: string; sandbox: string };
      resultText: string;
    };
    expect(runLog.permission.mode).toBe("ask");
    expect(runLog.permission.sandbox).toBe("read-only");
    expect(runLog.resultText).toBe("simulated reply");
  });
});
