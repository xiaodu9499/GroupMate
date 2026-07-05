import { describe, expect, it } from "vitest";
import { buildDwsListMessagesArgs } from "../../../src/adapters/dingtalk-cli/dws-client.js";

describe("DWS list args", () => {
  it("includes since time when provided", () => {
    const args = buildDwsListMessagesArgs({
      groupId: "cid123",
      since: "2026-07-05 10:00:00",
      limit: 100,
    });
    expect(args).toContain("--time");
    expect(args).toContain("2026-07-05 10:00:00");
    expect(args).toContain("100");
  });
});
