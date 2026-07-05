import { spawn } from "node:child_process";
import type { DingTalkRawMessage } from "./message-parser.js";
import { DwsError } from "./dws-error.js";

export interface DwsListMessagesOptions {
  command?: string;
  groupId: string;
  limit?: number;
  lookbackMinutes?: number;
  since?: string;
  forward?: boolean;
  timeoutMs?: number;
}

export interface DwsListMessagesResult {
  rows: DingTalkRawMessage[];
  raw: unknown;
}

export interface DwsClientOptions {
  command?: string;
  timeoutMs?: number;
}

export class DwsClient {
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: DwsClientOptions = {}) {
    this.command = options.command ?? "dws.cmd";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async listMessages(options: DwsListMessagesOptions): Promise<DwsListMessagesResult> {
    const command = options.command ?? this.command;
    const args = buildDwsListMessagesArgs(options);

    const { stdout, stderr, code, timedOut, spawnFailed } = await runCommand(
      command,
      args,
      options.timeoutMs ?? this.timeoutMs,
    );

    if (spawnFailed) {
      throw new DwsError({
        category: "spawn_failed",
        message: stderr || "DWS command unavailable.",
        stderrLength: stderr.length,
      });
    }

    if (timedOut) {
      throw new DwsError({
        category: "timeout",
        message: "DWS command timed out.",
        stderrLength: stderr.length,
      });
    }

    if (code !== 0) {
      throw new DwsError({
        category: "non_zero_exit",
        message: stderr.trim() || "DWS command failed.",
        code,
        stderrLength: stderr.length,
      });
    }

    try {
      const parsed = parseDwsOutput(stdout);
      return parsed;
    } catch (error) {
      throw new DwsError({
        category: "parse_failed",
        message: error instanceof Error ? error.message : "Failed to parse DWS output.",
        code,
        stderrLength: stderr.length,
      });
    }
  }
}

export function buildDwsListMessagesArgs(options: DwsListMessagesOptions): string[] {
  const limit = options.limit ?? 20;
  const startTime = options.since ?? formatDwsTimeFromLookback(options.lookbackMinutes ?? 60);
  const args = [
    "chat",
    "message",
    "list",
    "--group",
    options.groupId,
    "--time",
    startTime,
    "--forward",
    String(options.forward ?? true),
    "--limit",
    String(limit),
    "--format",
    "json",
  ];

  return args;
}

function formatDwsTimeFromLookback(lookbackMinutes: number): string {
  const start = new Date(Date.now() - Math.abs(lookbackMinutes) * 60_000);
  return formatDwsTime(start);
}

export function formatDwsTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDwsOutput(stdout: string): { rows: DingTalkRawMessage[]; raw: unknown } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { rows: [], raw: [] };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return { rows: parsed as DingTalkRawMessage[], raw: parsed };
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const result = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
      const rows = (record.rows ??
        record.data ??
        record.messages ??
        result.rows ??
        result.data ??
        result.messages ??
        []) as DingTalkRawMessage[];
      return { rows, raw: parsed };
    }
  } catch {
    // Fall through to line parsing.
  }

  const rows: DingTalkRawMessage[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      rows.push(JSON.parse(line) as DingTalkRawMessage);
    } catch {
      // Ignore malformed lines.
    }
  }

  if (rows.length === 0 && trimmed) {
    throw new Error("DWS output is not valid JSON.");
  }

  return { rows, raw: rows };
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean; spawnFailed: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnFailed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      spawnFailed = true;
      resolve({ stdout, stderr: error.message, code: 1, timedOut, spawnFailed });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, spawnFailed });
    });
  });
}
