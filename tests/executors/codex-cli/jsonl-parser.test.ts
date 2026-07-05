import { describe, expect, it } from "vitest";
import { parseCodexJsonl } from "../../../src/executors/codex-cli/jsonl-parser.js";

const FIXTURE = `
{"type":"thread.started","thread_id":"thread-abc"}
{"type":"item.completed","item":{"type":"agent_message","text":"first answer"}}
{"type":"item.completed","item":{"type":"agent_message","text":"final answer"}}
`.trim();

describe("parseCodexJsonl", () => {
  it("extracts thread id and last agent message", () => {
    const parsed = parseCodexJsonl(FIXTURE);
    expect(parsed.threadId).toBe("thread-abc");
    expect(parsed.lastAgentMessage).toBe("final answer");
  });

  it("returns empty message for invalid output", () => {
    const parsed = parseCodexJsonl("not json");
    expect(parsed.lastAgentMessage).toBe("");
    expect(parsed.threadId).toBeUndefined();
  });
});
