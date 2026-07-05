import { describe, expect, it } from "vitest";
import { USER_FRIENDLY_ERRORS } from "../../../src/executors/codex-cli/index.js";
import { parseCodexJsonl, summarizeCodexRaw } from "../../../src/executors/codex-cli/jsonl-parser.js";

describe("Codex executor errors", () => {
  it("maps timeout to friendly message", () => {
    expect(USER_FRIENDLY_ERRORS.timeout).toContain("超时");
  });

  it("parses jsonl final message", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "t-1" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "ok" },
      }),
    ].join("\n");

    const parsed = parseCodexJsonl(stdout);
    expect(parsed.lastAgentMessage).toBe("ok");
    expect(parsed.threadId).toBe("t-1");
  });

  it("summarizes raw without full stdout", () => {
    const summary = summarizeCodexRaw({
      stdout: "x".repeat(1000),
      stderr: "err",
      code: 1,
      timedOut: false,
    });
    expect(summary.stdoutLength).toBe(1000);
    expect(summary).not.toHaveProperty("stdout");
  });
});
