#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { CodexCliExecutor } from "./executors/codex-cli/index.js";
import { loadConfigAsync } from "./core/config.js";
import type { ExecutorAdapter } from "./core/executor.js";
import type { TaskRunRequest, TaskRunResult } from "./core/types.js";
import { syncDingTalkMessages } from "./adapters/dingtalk-cli/sync-service.js";
import {
  buildSimulatedEvent,
  createRuntime,
  runDingTalkCustom,
  runSimulatedDispatch,
} from "./runtime.js";
import { getDatabaseStatus, openStorage } from "./storage/index.js";
import { migrate } from "./storage/sqlite/migrations.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    process.stdout.write("GroupMate 0.1.0\n");
    return;
  }

  const configPath = readOption(args, "--config");

  if (command === "doctor") {
    await runDoctor(configPath);
    return;
  }

  if (command === "db") {
    await runDbCommand(args.slice(1), configPath);
    return;
  }

  if (command === "runs") {
    await runRunsCommand(args.slice(1), configPath);
    return;
  }

  if (command === "messages") {
    await runMessagesCommand(args.slice(1), configPath);
    return;
  }

  if (command === "dingtalk-sync") {
    await runDingTalkSync(args.slice(1), configPath);
    return;
  }

  if (command === "codex-smoke") {
    const text = args.slice(1).filter((arg) => arg !== "--config" && arg !== configPath).join(" ").trim() || "Say hello from GroupMate.";
    const config = await loadConfigAsync({ configPath: configPath ?? undefined });
    const executor = new CodexCliExecutor({
      command: config.executor.command,
      timeoutMs: config.executor.timeoutMs,
      dataDir: config.workspace.dataDir,
    });
    const result = await executor.run({
      event: {
        trigger: "command",
        message: {
          id: "local",
          channel: {
            source: "local",
            transport: "cli",
            workspaceId: "local",
            channelId: "local",
          },
          sender: { id: "local-user", name: "Local User" },
          text,
          mentions: [],
          timestamp: new Date().toISOString(),
        },
      },
      context: {
        channel: {
          source: "local",
          transport: "cli",
          workspaceId: "local",
          channelId: "local",
        },
        recentMessages: [],
      },
      permission: {
        mode: "ask",
        sandbox: "read-only",
        reason: "local smoke test",
      },
    });
    process.stdout.write(`${result.text}\n`);
    return;
  }

  if (command === "simulate") {
    const simulateArgs = args.slice(1);
    const text = readOption(simulateArgs, "--text");
    if (!text) {
      throw new Error('Missing required option: --text "..."');
    }

    const runtime = await createRuntime({
      configPath: readOption(simulateArgs, "--config") ?? configPath ?? undefined,
      executor: createMockExecutorIfEnabled(),
    });

    const event = buildSimulatedEvent({
      text,
      channelId: readOption(simulateArgs, "--channel") ?? "cid-test",
      senderId: readOption(simulateArgs, "--sender") ?? "user-1",
      senderName: readOption(simulateArgs, "--sender-name") ?? "Alice",
      source: readOption(simulateArgs, "--source") ?? "dingtalk",
    });

    const result = await runSimulatedDispatch(runtime, event);
    process.stdout.write(`${result.text}\n`);
    return;
  }

  if (command === "dingtalk-custom") {
    const customArgs = args.slice(1).filter((arg) => arg !== "--config" && arg !== configPath);
    const force = customArgs.includes("--force");
    const currentText = customArgs.filter((arg) => arg !== "--force").join(" ").trim();
    if (!currentText) {
      throw new Error("Missing message text for dingtalk-custom.");
    }

    const runtime = await createRuntime({
      configPath: configPath ?? undefined,
      executor: createMockExecutorIfEnabled(),
      force,
    });
    await runDingTalkCustom(runtime, currentText);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function createMockExecutorIfEnabled(): ExecutorAdapter | undefined {
  if (process.env.GROUPMATE_MOCK_EXECUTOR !== "1") {
    return undefined;
  }

  return {
    name: "mock-executor",
    async run(request: TaskRunRequest): Promise<TaskRunResult> {
      return {
        ok: true,
        text: `mock reply: ${request.event.message.text}`,
        executor: "mock-executor",
      };
    },
  };
}

async function runDoctor(configPath?: string | null): Promise<void> {
  const config = await loadConfigAsync({ configPath: configPath ?? undefined });
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push({
    name: "Node.js version",
    ok: nodeMajor >= 20,
    detail: process.versions.node,
  });

  checks.push(await checkCommandExists("dws command", config.source.command));
  checks.push(await checkCommandExists("codex command", config.executor.command));
  checks.push(await checkWritableDir("data dir", path.resolve(config.workspace.dataDir)));
  checks.push({
    name: "dingtalk group id",
    ok: Boolean(config.source.groupId),
    detail: config.source.groupId ?? "not configured (required for dingtalk-custom)",
  });

  try {
    const dbStatus = await getDatabaseStatus(config);
    checks.push({
      name: "sqlite database",
      ok: true,
      detail: `${dbStatus.path} (schema v${dbStatus.schemaVersion}, messages=${dbStatus.messageCount}, runs=${dbStatus.runCount})`,
    });
    checks.push({
      name: "fts search",
      ok: true,
      detail: dbStatus.ftsAvailable ? "FTS5 available" : "FTS5 unavailable, using LIKE fallback",
    });
  } catch (error) {
    checks.push({
      name: "sqlite database",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  for (const check of checks) {
    process.stdout.write(`${check.ok ? "[ok]" : "[fail]"} ${check.name}: ${check.detail}\n`);
  }

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

async function runDbCommand(args: string[], configPath?: string | null): Promise<void> {
  const sub = args[0];
  const config = await loadConfigAsync({ configPath: configPath ?? undefined });

  if (sub === "migrate") {
    const storage = await openStorage(config);
    const result = await migrate(storage.db);
    process.stdout.write(`migrated schema v${result.version} fts=${result.ftsAvailable}\n`);
    return;
  }

  if (sub === "status") {
    const status = await getDatabaseStatus(config);
    process.stdout.write(`path=${status.path}\n`);
    process.stdout.write(`schemaVersion=${status.schemaVersion}\n`);
    process.stdout.write(`ftsAvailable=${status.ftsAvailable}\n`);
    process.stdout.write(`channels=${status.channelCount}\n`);
    process.stdout.write(`messages=${status.messageCount}\n`);
    process.stdout.write(`runs=${status.runCount}\n`);
    return;
  }

  throw new Error(`Unknown db subcommand: ${sub ?? "(none)"}. Use: db migrate | db status`);
}

async function runRunsCommand(args: string[], configPath?: string | null): Promise<void> {
  const sub = args[0];
  const config = await loadConfigAsync({ configPath: configPath ?? undefined });
  const storage = await openStorage(config);
  const channelId = readOption(args, "--channel") ?? config.source.groupId ?? "cid-test";
  const channel = {
    source: "dingtalk" as const,
    transport: "cli" as const,
    workspaceId: "default",
    channelId,
  };

  if (sub === "list") {
    const limit = Number.parseInt(readOption(args, "--limit") ?? "20", 10);
    const runs = await storage.runLedger.listRuns(channel, { limit });
    for (const run of runs) {
      process.stdout.write(
        `${run.id}\t${run.status}\t${run.requesterName ?? run.requesterId}\t${run.startedAt}\t${truncate(run.resultText ?? run.errorMessage ?? "", 60)}\n`,
      );
    }
    return;
  }

  if (sub === "show") {
    const runId = args[1];
    if (!runId) {
      throw new Error("Usage: groupmate runs show <runId>");
    }
    const run = await storage.runLedger.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const events = await storage.runLedger.listEvents(runId);
    process.stdout.write(`${JSON.stringify({ run, events }, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown runs subcommand: ${sub ?? "(none)"}. Use: runs list | runs show`);
}

async function runMessagesCommand(args: string[], configPath?: string | null): Promise<void> {
  const sub = args[0];
  const config = await loadConfigAsync({ configPath: configPath ?? undefined });
  const storage = await openStorage(config);
  const channelId = readOption(args, "--channel") ?? config.source.groupId ?? "cid-test";
  const channel = {
    source: "dingtalk" as const,
    transport: "cli" as const,
    workspaceId: "default",
    channelId,
  };

  if (sub === "recent") {
    const limit = Number.parseInt(readOption(args, "--limit") ?? "20", 10);
    const messages = await storage.messageStore.getRecentMessages(channel, { limit });
    for (const message of messages) {
      process.stdout.write(
        `${message.timestamp}\t${message.sender.name ?? message.sender.id}\t${truncate(message.text, 80)}\n`,
      );
    }
    return;
  }

  if (sub === "search") {
    const query = readOption(args, "--query");
    if (!query) {
      throw new Error('Usage: groupmate messages search --channel <cid> --query "keyword"');
    }
    const limit = Number.parseInt(readOption(args, "--limit") ?? "20", 10);
    const messages = await storage.messageStore.searchMessages(channel, query, { limit });
    for (const message of messages) {
      process.stdout.write(
        `${message.timestamp}\t${message.sender.name ?? message.sender.id}\t${truncate(message.text, 80)}\n`,
      );
    }
    return;
  }

  throw new Error(`Unknown messages subcommand: ${sub ?? "(none)"}. Use: messages recent | messages search`);
}

async function runDingTalkSync(args: string[], configPath?: string | null): Promise<void> {
  const config = await loadConfigAsync({ configPath: configPath ?? undefined });
  const storage = await openStorage(config);
  const groupId = readOption(args, "--group") ?? config.source.groupId;
  if (!groupId) {
    throw new Error("Missing --group <cid> or GROUPMATE_DINGTALK_GROUP_ID.");
  }

  const since = readOption(args, "--since");
  const limit = readOption(args, "--limit");
  const result = await syncDingTalkMessages({
    config,
    messageStore: storage.messageStore,
    groupId,
    since,
    limit: limit ? Number.parseInt(limit, 10) : undefined,
  });

  process.stdout.write(
    `fetched=${result.fetched} inserted=${result.inserted} duplicated=${result.duplicated} skippedBot=${result.skippedBot}\n`,
  );
}

async function checkCommandExists(name: string, command: string): Promise<{ name: string; ok: boolean; detail: string }> {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "command";
  const lookupArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = await runProbe(lookupCommand, lookupArgs);

  if (result.ok) {
    return { name, ok: true, detail: result.stdout.split(/\r?\n/)[0]?.trim() || command };
  }

  return { name, ok: false, detail: `${command} not found in PATH` };
}

async function checkWritableDir(name: string, dir: string): Promise<{ name: string; ok: boolean; detail: string }> {
  try {
    const { mkdir, writeFile, rm } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    await writeFile(probe, "ok", "utf8");
    await rm(probe, { force: true });
    return { name, ok: true, detail: dir };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: `${dir} is not writable (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

function readOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value.replace(/\s+/g, " ").trim();
  }
  return `${value.slice(0, max).replace(/\s+/g, " ").trim()}…`;
}

function runProbe(command: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform !== "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      resolve({ ok: false, stdout });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout });
    });
  });
}

function printHelp(): void {
  process.stdout.write(`GroupMate

Usage:
  groupmate help
  groupmate version
  groupmate doctor [--config <path>]
  groupmate db migrate|status [--config <path>]
  groupmate codex-smoke [prompt]
  groupmate simulate --text "..." [--channel <id>] [--sender <id>] [--sender-name <name>]
  groupmate dingtalk-sync --group <cid> [--since "yyyy-MM-dd HH:mm:ss"] [--limit 200]
  groupmate dingtalk-custom [--force] "用户消息文本"
  groupmate runs list [--channel <cid>] [--limit 20]
  groupmate runs show <runId>
  groupmate messages recent --channel <cid> [--limit 20]
  groupmate messages search --channel <cid> --query "keyword"

Environment:
  GROUPMATE_DATA_DIR
  GROUPMATE_DB_PATH
  GROUPMATE_DWS_COMMAND
  GROUPMATE_DINGTALK_GROUP_ID
  GROUPMATE_DINGTALK_BOT_NAME
  GROUPMATE_CODEX_COMMAND
  GROUPMATE_CODEX_TIMEOUT_MS
  GROUPMATE_OWNER_IDS
  GROUPMATE_WRITER_IDS
  GROUPMATE_DEBUG
  GROUPMATE_DEBUG_ARTIFACTS
  GROUPMATE_MOCK_EXECUTOR
`);
}

main().catch((error) => {
  if (process.env.GROUPMATE_DEBUG === "1" && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(1);
});
