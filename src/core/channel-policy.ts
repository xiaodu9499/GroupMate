import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GroupMateConfig } from "./config.js";
import type { ChannelWorkspace } from "./channel-workspace.js";
import type { PermissionMode, SandboxMode } from "./types.js";

export interface ChannelPolicy {
  owners: string[];
  writers: string[];
  defaultMode: PermissionMode;
  allowDangerFullAccess: boolean;
  dangerousActionsRequireConfirmation: boolean;
  writeSandbox?: SandboxMode;
}

export interface ResolvedChannelPolicy {
  owners: string[];
  writers: string[];
  defaultMode: PermissionMode;
  allowDangerFullAccess: boolean;
  dangerousActionsRequireConfirmation: boolean;
  writeSandbox: SandboxMode;
  source: "channel-policy" | "env" | "config" | "defaults";
}

const DEFAULT_CHANNEL_POLICY: ChannelPolicy = {
  owners: [],
  writers: [],
  defaultMode: "ask",
  allowDangerFullAccess: false,
  dangerousActionsRequireConfirmation: true,
};

export async function loadChannelPolicy(
  workspace: ChannelWorkspace,
  channel: { source: string; channelId: string },
): Promise<ChannelPolicy | null> {
  const file = path.join(workspace.channelDir({ source: channel.source, transport: "cli", workspaceId: "default", channelId: channel.channelId }), "policy.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<ChannelPolicy>;
    return {
      owners: parsed.owners ?? [],
      writers: parsed.writers ?? [],
      defaultMode: parsed.defaultMode ?? "ask",
      allowDangerFullAccess: parsed.allowDangerFullAccess ?? false,
      dangerousActionsRequireConfirmation: parsed.dangerousActionsRequireConfirmation ?? true,
      writeSandbox: parsed.writeSandbox,
    };
  } catch {
    return null;
  }
}

export function resolveChannelPolicy(
  config: GroupMateConfig,
  channelPolicy: ChannelPolicy | null,
): ResolvedChannelPolicy {
  if (channelPolicy) {
    return {
      owners: channelPolicy.owners.length > 0 ? channelPolicy.owners : config.permissions.owners,
      writers: channelPolicy.writers.length > 0 ? channelPolicy.writers : config.permissions.writers,
      defaultMode: channelPolicy.defaultMode,
      allowDangerFullAccess: channelPolicy.allowDangerFullAccess,
      dangerousActionsRequireConfirmation: channelPolicy.dangerousActionsRequireConfirmation,
      writeSandbox: channelPolicy.writeSandbox ?? config.execution.writeSandbox,
      source: "channel-policy",
    };
  }

  const hasEnvOwners = Boolean(process.env.GROUPMATE_OWNER_IDS?.trim());
  const hasEnvWriters = Boolean(process.env.GROUPMATE_WRITER_IDS?.trim());

  if (hasEnvOwners || hasEnvWriters) {
    return {
      owners: config.permissions.owners,
      writers: config.permissions.writers,
      defaultMode: config.permissions.defaultMode,
      allowDangerFullAccess: false,
      dangerousActionsRequireConfirmation: config.execution.dangerousActionsRequireConfirmation,
      writeSandbox: config.execution.writeSandbox,
      source: "env",
    };
  }

  if (config.permissions.owners.length > 0 || config.permissions.writers.length > 0) {
    return {
      owners: config.permissions.owners,
      writers: config.permissions.writers,
      defaultMode: config.permissions.defaultMode,
      allowDangerFullAccess: false,
      dangerousActionsRequireConfirmation: config.execution.dangerousActionsRequireConfirmation,
      writeSandbox: config.execution.writeSandbox,
      source: "config",
    };
  }

  return {
    ...DEFAULT_CHANNEL_POLICY,
    writeSandbox: config.execution.writeSandbox,
    source: "defaults",
  };
}
