import { describe, expect, it } from "vitest";
import {
  buildConfirmationReply,
  detectDangerousAction,
  parseConfirmationCommand,
} from "../../src/core/dangerous-action.js";

describe("dangerous-action", () => {
  it("detects delete and production keywords", () => {
    const result = detectDangerousAction("请删除生产环境的数据");
    expect(result.dangerous).toBe(true);
    expect(result.reasons).toContain("delete");
    expect(result.reasons).toContain("production");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("returns safe for normal requests", () => {
    const result = detectDangerousAction("帮我总结当前问题");
    expect(result.dangerous).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("parses confirmation commands", () => {
    expect(parseConfirmationCommand("@bot 确认执行 run-123")).toEqual({
      action: "confirm",
      runId: "run-123",
    });
    expect(parseConfirmationCommand("@bot 取消 run-123")).toEqual({
      action: "cancel",
      runId: "run-123",
    });
  });

  it("builds confirmation reply with run id", () => {
    const reply = buildConfirmationReply("run-abc", ["delete", "production"]);
    expect(reply).toContain("run-abc");
    expect(reply).toContain("确认执行");
  });
});
