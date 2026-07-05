import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSimulatedEvent, createRuntime, runSimulatedDispatch } from "../../src/runtime.js";
import type { ExecutorAdapter } from "../../src/core/executor.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resetStorageCache } from "../../src/storage/index.js";

describe("simulate runtime", () => {
  let tempDir: string;

  afterEach(async () => {
    resetStorageCache();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
    delete process.env.GROUPMATE_MOCK_EXECUTOR;
  });

  it("runs full dispatch loop with mock executor", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-sim-"));
    const mockExecutor: ExecutorAdapter = {
      name: "mock-executor",
      async run(request) {
        return {
          ok: true,
          text: `mock reply: ${request.event.message.text}`,
          executor: "mock-executor",
        };
      },
    };

    const runtime = await createRuntime({
      config: {
        ...DEFAULT_CONFIG,
        workspace: { dataDir: tempDir },
      },
      executor: mockExecutor,
    });

    const event = buildSimulatedEvent({
      text: "帮我总结一下当前问题",
      channelId: "cid-test",
      senderId: "user-1",
      senderName: "Alice",
    });

    const result = await runSimulatedDispatch(runtime, event);
    expect(result.text).toContain("mock reply");
    expect(result.runId).toBeTruthy();

    const runs = await runtime.storage.runLedger.listRuns(event.message.channel, { limit: 1 });
    expect(runs).toHaveLength(1);

    await runtime.storage.close();
  });
});
