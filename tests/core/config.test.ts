import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig, loadConfigAsync } from "../../src/core/config.js";

const ENV_KEYS = [
  "GROUPMATE_DATA_DIR",
  "GROUPMATE_DWS_COMMAND",
  "GROUPMATE_DINGTALK_GROUP_ID",
  "GROUPMATE_DINGTALK_BOT_NAME",
  "GROUPMATE_DINGTALK_FETCH_LIMIT",
  "GROUPMATE_DINGTALK_HISTORY_LIMIT",
  "GROUPMATE_DINGTALK_LOOKBACK_MINUTES",
  "GROUPMATE_CODEX_COMMAND",
  "GROUPMATE_CODEX_TIMEOUT_MS",
  "GROUPMATE_OWNER_IDS",
  "GROUPMATE_WRITER_IDS",
] as const;

describe("loadConfig", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("returns secure defaults", () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.permissions.defaultMode).toBe("ask");
    expect(config.execution.askSandbox).toBe("read-only");
    expect(config.execution.writeSandbox).toBe("workspace-write");
  });

  it("applies environment variable overrides", () => {
    process.env.GROUPMATE_DATA_DIR = "/tmp/groupmate";
    process.env.GROUPMATE_DWS_COMMAND = "custom-dws.cmd";
    process.env.GROUPMATE_DINGTALK_GROUP_ID = "cid-test";
    process.env.GROUPMATE_DINGTALK_BOT_NAME = "bot";
    process.env.GROUPMATE_DINGTALK_FETCH_LIMIT = "50";
    process.env.GROUPMATE_DINGTALK_HISTORY_LIMIT = "25";
    process.env.GROUPMATE_DINGTALK_LOOKBACK_MINUTES = "360";
    process.env.GROUPMATE_CODEX_COMMAND = "custom-codex.cmd";
    process.env.GROUPMATE_CODEX_TIMEOUT_MS = "60000";
    process.env.GROUPMATE_OWNER_IDS = "owner-1, owner-2";
    process.env.GROUPMATE_WRITER_IDS = "writer-1";

    const config = loadConfig();
    expect(config.workspace.dataDir).toBe("/tmp/groupmate");
    expect(config.source.command).toBe("custom-dws.cmd");
    expect(config.source.groupId).toBe("cid-test");
    expect(config.source.botName).toBe("bot");
    expect(config.source.fetchLimit).toBe(50);
    expect(config.source.historyLimit).toBe(25);
    expect(config.source.lookbackMinutes).toBe(360);
    expect(config.executor.command).toBe("custom-codex.cmd");
    expect(config.executor.timeoutMs).toBe(60_000);
    expect(config.permissions.owners).toEqual(["owner-1", "owner-2"]);
    expect(config.permissions.writers).toEqual(["writer-1"]);
  });

  it("loads JSON config file overrides", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "groupmate-config-"));
    const configPath = path.join(dir, "groupmate.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        workspace: { dataDir: "custom-data" },
        source: { groupId: "cid-from-file", fetchLimit: 5 },
        permissions: { owners: ["alice"] },
      }),
      "utf8",
    );

    const config = await loadConfigAsync({ configPath });
    expect(config.workspace.dataDir).toBe("custom-data");
    expect(config.source.groupId).toBe("cid-from-file");
    expect(config.source.fetchLimit).toBe(5);
    expect(config.permissions.owners).toEqual(["alice"]);
    expect(config.execution.askSandbox).toBe("read-only");

    await rm(dir, { recursive: true, force: true });
  });
});
