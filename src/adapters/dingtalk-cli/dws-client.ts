import { spawn } from "node:child_process";
import type { DingTalkRawMessage } from "./message-parser.js";

export interface DwsListMessagesOptions {
  command?: string;
  groupId: string;
  limit?: number;
  lookbackMinutes?: number;
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

    const { stdout, stderr, code, timedOut } = await runCommand(
      command,
      args,
      options.timeoutMs ?? this.timeoutMs,
    );

    if (timedOut) {
      throw new Error("DWS command timed out.");
    }

    if (code !== 0) {
      throw new Error(stderr.trim() || "DWS command failed.");
    }

    const parsed = parseDwsOutput(stdout);
    return {
      rows: parsed.rows,
      raw: parsed.raw,
    };
  }
}

export function buildDwsListMessagesArgs(options: DwsListMessagesOptions): string[] {
  const limit = options.limit ?? 20;
  const lookbackMinutes = options.lookbackMinutes ?? 60;
  const start = new Date(Date.now() - Math.abs(lookbackMinutes) * 60_000);
  const args = [
    "chat",
    "message",
    "list",
    "--group",
    options.groupId,
    "--time",
    formatDwsTime(start),
    "--forward",
    String(options.forward ?? true),
    "--limit",
    String(limit),
    "--format",
    "json",
  ];

  return args;
}

function formatDwsTime(date: Date): string {
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

  return { rows, raw: rows };
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

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
      resolve({ stdout, stderr: error.message, code: 1, timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}
