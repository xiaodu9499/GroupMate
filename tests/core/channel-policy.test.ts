import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelWorkspace } from "../../src/core/channel-workspace.js";
import { loadChannelPolicy, resolveChannelPolicy } from "../../src/core/channel-policy.js";
import { createPermissionEngine } from "../../src/core/permissions.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

describe("channel policy", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("channel policy overrides global config", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "groupmate-policy-"));
    const workspace = new ChannelWorkspace({ dataDir: tempDir });
    const channel = {
      source: "dingtalk" as const,
      transport: "cli" as const,
      workspaceId: "default" as const,
      channelId: "cid-policy",
    };

    const dir = workspace.channelDir(channel);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "policy.json"),
      JSON.stringify({
        owners: ["owner-1"],
        writers: ["writer-1"],
        defaultMode: "ask",
        allowDangerFullAccess: false,
        dangerousActionsRequireConfirmation: true,
      }),
      "utf8",
    );

    const policy = await loadChannelPolicy(workspace, channel);
    const resolved = resolveChannelPolicy(DEFAULT_CONFIG, policy);
    const engine = createPermissionEngine(DEFAULT_CONFIG, resolved);

    expect(engine.decide({ id: "owner-1", name: "Owner" }).mode).toBe("admin");
    expect(engine.decide({ id: "writer-1", name: "Writer" }).mode).toBe("write");
    expect(engine.decide({ id: "random", name: "Random" }).mode).toBe("ask");
    expect(engine.decide({ id: "unknown", name: "unknown" }).sandbox).toBe("read-only");
  });
});
