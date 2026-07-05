import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChannelRef } from "./types.js";
import type { ChannelWorkspace } from "./channel-workspace.js";
import type { ActorIdentity, PermissionDecision } from "./types.js";

export type RunLogStatus = "completed" | "failed";

export interface RunLog {
  id: string;
  sourceMessageId: string;
  requester: ActorIdentity;
  permission: PermissionDecision;
  executor: string;
  status: RunLogStatus;
  startedAt: string;
  endedAt: string;
  resultText: string;
  rawSummary?: unknown;
}

export class RunStore {
  constructor(private readonly workspace: ChannelWorkspace) {}

  async save(channel: ChannelRef, log: RunLog): Promise<string> {
    const dir = path.join(this.workspace.runsDir(channel));
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${log.id}.json`);
    await writeFile(file, `${JSON.stringify(log, null, 2)}\n`, "utf8");
    return file;
  }
}

export function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function summarizeRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const value = raw as Record<string, unknown>;
  return {
    code: value.code,
    timedOut: value.timedOut,
    stderrLength: typeof value.stderr === "string" ? value.stderr.length : undefined,
    stdoutLength: typeof value.stdout === "string" ? value.stdout.length : undefined,
    threadId: value.threadId,
  };
}
