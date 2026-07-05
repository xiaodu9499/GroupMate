import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StructuredLogger, resetLogger } from "../../src/core/logger.js";

describe("StructuredLogger", () => {
  let tempDir: string;

  afterEach(async () => {
    resetLogger();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes jsonl without full message body by default", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-log-"));
    const logger = new StructuredLogger({ dataDir: tempDir });
    logger.messageUpserted({
      messageId: "msg-1",
      channel: "dingtalk:default:cid",
      sender: "user-1",
      textLength: 42,
      text: "secret message body",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const content = await readFile(path.join(tempDir, "logs", "groupmate.log.ndjson"), "utf8");
    const line = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(line.event).toBe("message.upserted");
    expect(line.text).toBeUndefined();
    expect(line.textLength).toBe(42);
    expect(line.textHash).toBeTruthy();
  });
});
