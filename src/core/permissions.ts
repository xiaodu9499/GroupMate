import type { GroupMateConfig } from "./config.js";
import type { ActorIdentity, PermissionDecision } from "./types.js";

export interface PermissionEngineOptions {
  config: Pick<GroupMateConfig, "permissions" | "execution">;
}

export class PermissionEngine {
  constructor(private readonly options: PermissionEngineOptions) {}

  decide(actor: ActorIdentity): PermissionDecision {
    const { permissions, execution } = this.options.config;
    const actorIds = [actor.id, actor.name].filter((value): value is string => Boolean(value)).map(normalizeIdentity);

    for (const owner of permissions.owners) {
      if (actorIds.includes(normalizeIdentity(owner))) {
        return {
          mode: "admin",
          sandbox: execution.writeSandbox,
          reason: `actor matched owner list (${owner})`,
        };
      }
    }

    for (const writer of permissions.writers) {
      if (actorIds.includes(normalizeIdentity(writer))) {
        return {
          mode: "write",
          sandbox: execution.writeSandbox,
          reason: `actor matched writer list (${writer})`,
        };
      }
    }

    if (actor.id === "unknown") {
      return {
        mode: "ask",
        sandbox: execution.askSandbox,
        reason: "unknown actor defaults to ask/read-only",
      };
    }

    return {
      mode: permissions.defaultMode,
      sandbox: execution.askSandbox,
      reason: "default ask/read-only mode",
    };
  }
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

export function createPermissionEngine(config: GroupMateConfig): PermissionEngine {
  return new PermissionEngine({ config });
}
