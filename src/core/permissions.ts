import type { GroupMateConfig } from "./config.js";
import type { ResolvedChannelPolicy } from "./channel-policy.js";
import type { ActorIdentity, PermissionDecision } from "./types.js";

export interface PermissionEngineOptions {
  config: Pick<GroupMateConfig, "permissions" | "execution">;
  channelPolicy?: ResolvedChannelPolicy;
}

export class PermissionEngine {
  constructor(private readonly options: PermissionEngineOptions) {}

  decide(actor: ActorIdentity): PermissionDecision {
    const policy = this.options.channelPolicy ?? {
      owners: this.options.config.permissions.owners,
      writers: this.options.config.permissions.writers,
      defaultMode: this.options.config.permissions.defaultMode,
      allowDangerFullAccess: false,
      dangerousActionsRequireConfirmation: this.options.config.execution.dangerousActionsRequireConfirmation,
      writeSandbox: this.options.config.execution.writeSandbox,
      source: "config" as const,
    };

    const actorIds = [actor.id, actor.name, actor.staffId]
      .filter((value): value is string => Boolean(value))
      .map(normalizeIdentity);

    for (const owner of policy.owners) {
      if (actorIds.includes(normalizeIdentity(owner))) {
        return {
          mode: "admin",
          sandbox: policy.allowDangerFullAccess ? "danger-full-access" : policy.writeSandbox,
          reason: `actor matched owner list (${owner})`,
        };
      }
    }

    for (const writer of policy.writers) {
      if (actorIds.includes(normalizeIdentity(writer))) {
        return {
          mode: "write",
          sandbox: policy.allowDangerFullAccess ? "danger-full-access" : policy.writeSandbox,
          reason: `actor matched writer list (${writer})`,
        };
      }
    }

    if (actor.id === "unknown") {
      return {
        mode: "ask",
        sandbox: this.options.config.execution.askSandbox,
        reason: "unknown actor defaults to ask/read-only",
      };
    }

    return {
      mode: policy.defaultMode,
      sandbox: this.options.config.execution.askSandbox,
      reason: `${policy.source} default ask/read-only mode`,
    };
  }

  canConfirm(actor: ActorIdentity): boolean {
    const decision = this.decide(actor);
    return decision.mode === "admin" || decision.mode === "write";
  }
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

export function createPermissionEngine(
  config: GroupMateConfig,
  channelPolicy?: ResolvedChannelPolicy,
): PermissionEngine {
  return new PermissionEngine({ config, channelPolicy });
}
