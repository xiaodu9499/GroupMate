import { describe, expect, it } from "vitest";
import { buildDwsListMessagesArgs, parseDwsOutput } from "../../../src/adapters/dingtalk-cli/dws-client.js";

describe("buildDwsListMessagesArgs", () => {
  it("uses the dws chat message list flags supported by the CLI", () => {
    const args = buildDwsListMessagesArgs({
      groupId: "cid123",
      limit: 10,
      lookbackMinutes: 30,
    });

    expect(args).toContain("--group");
    expect(args).toContain("cid123");
    expect(args).toContain("--forward");
    expect(args).toContain("true");
    expect(args).toContain("--format");
    expect(args).toContain("json");
    expect(args).not.toContain("--group-id");
  });
});

describe("parseDwsOutput", () => {
  it("parses JSON array output", () => {
    const stdout = JSON.stringify([
      {
        content: "hello",
        createTime: "2026-07-04 23:45:39",
        openConversationId: "cid123",
        openMessageId: "msg001",
        sender: "Alice",
        senderOpenDingTalkId: "DSn001",
      },
    ]);

    const parsed = parseDwsOutput(stdout);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.openMessageId).toBe("msg001");
  });

  it("parses wrapped object output", () => {
    const stdout = JSON.stringify({
      rows: [
        {
          content: "wrapped",
          openMessageId: "msg002",
        },
      ],
    });

    const parsed = parseDwsOutput(stdout);
    expect(parsed.rows[0]?.openMessageId).toBe("msg002");
  });

  it("parses dws result.messages output", () => {
    const stdout = JSON.stringify({
      success: true,
      result: {
        messages: [
          {
            content: "nested",
            openMessageId: "msg003",
          },
        ],
      },
    });

    const parsed = parseDwsOutput(stdout);
    expect(parsed.rows[0]?.openMessageId).toBe("msg003");
  });

  it("parses NDJSON output", () => {
    const stdout = [
      JSON.stringify({ openMessageId: "msg-a", content: "a" }),
      JSON.stringify({ openMessageId: "msg-b", content: "b" }),
    ].join("\n");

    const parsed = parseDwsOutput(stdout);
    expect(parsed.rows.map((row) => row.openMessageId)).toEqual(["msg-a", "msg-b"]);
  });
});
