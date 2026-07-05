import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  time: string;
  event: string;
  [key: string]: unknown;
}

export interface StructuredLoggerOptions {
  dataDir?: string;
  logPath?: string;
  enabled?: boolean;
}

export class StructuredLogger {
  private readonly logPath: string;
  private readonly enabled: boolean;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: StructuredLoggerOptions = {}) {
    const dataDir = options.dataDir ?? "data";
    this.logPath = options.logPath ?? path.join(dataDir, "logs", "groupmate.log.ndjson");
    this.enabled = options.enabled ?? true;
  }

  info(event: string, fields: Record<string, unknown> = {}): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    this.write("error", event, fields);
  }

  debug(event: string, fields: Record<string, unknown> = {}): void {
    if (process.env.GROUPMATE_DEBUG === "1") {
      this.write("debug", event, fields);
    }
  }

  messageUpserted(fields: {
    messageId: string;
    channel: string;
    sender: string;
    textLength: number;
    text?: string;
  }): void {
    this.info("message.upserted", {
      messageId: fields.messageId,
      channel: fields.channel,
      sender: fields.sender,
      textLength: fields.textLength,
      textHash: fields.text ? hashText(fields.text) : undefined,
    });
  }

  private write(level: LogLevel, event: string, fields: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }

    const entry: LogEvent = {
      level,
      time: new Date().toISOString(),
      event,
      ...sanitizeFields(fields),
    };

    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
    });
  }
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "text" && typeof value === "string" && process.env.GROUPMATE_DEBUG !== "1") {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

let defaultLogger: StructuredLogger | null = null;

export function getLogger(options?: StructuredLoggerOptions): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger(options);
  }
  return defaultLogger;
}

export function resetLogger(): void {
  defaultLogger = null;
}
