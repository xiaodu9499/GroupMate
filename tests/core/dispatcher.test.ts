import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelWorkspace } from "../../src/core/channel-workspace.js";
import { ContextBuilder } from "../../src/core/context-builder.js";
import { Dispatcher } from "../../src/core/dispatcher.js";
import { resolveChannelPolicy } from "../../src/core/channel-policy.js";
import { createPermissionEngine } from "../../src/core/permissions.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { ExecutorAdapter } from "../../src/core/executor.js";
import type { SourceEvent, TaskRunResult } from "../../src/core/types.js";
import { openStorage, resetStorageCache } from "../../src/storage/index.js";

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
    resetStorageCache();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("persists message and run in sqlite during dispatch", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-dispatch-"));
    const config = { ...DEFAULT_CONFIG, workspace: { dataDir: tempDir } };
    const storage = await openStorage(config);
    const workspace = new ChannelWorkspace({ dataDir: tempDir, historyLimit: 5 });
    const channelPolicy = resolveChannelPolicy(config, null);
    const dispatcher = new Dispatcher({
      workspace,
      messageStore: storage.messageStore,
      runLedger: storage.runLedger,
      permissionEngine: createPermissionEngine(config, channelPolicy),
      channelPolicy,
      executor: mockExecutor,
      contextBuilder: new ContextBuilder({ workspace, messageStore: storage.messageStore }),
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

    const messages = await storage.messageStore.getRecentMessages(event.message.channel, { limit: 5 });
    expect(messages.some((item) => item.id === "msg-dispatch-1")).toBe(true);

    const runs = await storage.runLedger.listRuns(event.message.channel, { limit: 5 });
    expect(runs.some((run) => run.id === result.runId)).toBe(true);
    expect(runs[0]?.permissionMode).toBe("ask");

    await storage.close();
  });

  it("executes the original dangerous request after confirmation", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-dispatch-confirm-"));
    const config = {
      ...DEFAULT_CONFIG,
      workspace: { dataDir: tempDir },
      permissions: {
        ...DEFAULT_CONFIG.permissions,
        owners: ["owner-1"],
      },
    };
    const storage = await openStorage(config);
    const workspace = new ChannelWorkspace({ dataDir: tempDir, historyLimit: 5 });
    const channelPolicy = resolveChannelPolicy(config, null);
    const executedTexts: string[] = [];
    const executor: ExecutorAdapter = {
      name: "recording-executor",
      async run(request): Promise<TaskRunResult> {
        executedTexts.push(request.event.message.text);
        return {
          ok: true,
          text: `executed: ${request.event.message.text}`,
          executor: "recording-executor",
        };
      },
    };
    const dispatcher = new Dispatcher({
      workspace,
      messageStore: storage.messageStore,
      runLedger: storage.runLedger,
      permissionEngine: createPermissionEngine(config, channelPolicy),
      channelPolicy,
      executor,
      contextBuilder: new ContextBuilder({ workspace, messageStore: storage.messageStore }),
    });

    const channel = {
      source: "dingtalk",
      transport: "cli",
      workspaceId: "default",
      channelId: "cid-test",
    };
    const originalEvent: SourceEvent = {
      trigger: "mention",
      message: {
        id: "msg-danger-1",
        channel,
        sender: { id: "owner-1", name: "Owner" },
        text: "请删除生产配置",
        mentions: [],
        timestamp: new Date().toISOString(),
      },
    };

    const waiting = await dispatcher.dispatch(originalEvent);
    expect(waiting.runId).toBeTruthy();
    expect(waiting.text).toContain(waiting.runId);
    expect(executedTexts).toEqual([]);

    const waitingRun = await storage.runLedger.getRun(waiting.runId!);
    expect(waitingRun?.status).toBe("waiting_confirmation");
    expect(waitingRun?.confirmationStatus).toBe("required");

    const confirmationEvent: SourceEvent = {
      trigger: "command",
      message: {
        id: "msg-confirm-1",
        channel,
        sender: { id: "owner-1", name: "Owner" },
        text: `确认执行 ${waiting.runId}`,
        mentions: [],
        timestamp: new Date().toISOString(),
      },
    };

    const confirmed = await dispatcher.dispatch(confirmationEvent);
    expect(confirmed.text).toBe("executed: 请删除生产配置");
    expect(executedTexts).toEqual(["请删除生产配置"]);

    const completedRun = await storage.runLedger.getRun(waiting.runId!);
    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.confirmationStatus).toBe("confirmed");

    const events = await storage.runLedger.listEvents(waiting.runId!);
    expect(events.some((event) => event.type === "executor_completed")).toBe(true);

    await storage.close();
  });
});
