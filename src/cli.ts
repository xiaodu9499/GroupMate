#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { CodexCliExecutor } from "./executors/codex-cli/index.js";
import { loadConfigAsync } from "./core/config.js";
import type { ExecutorAdapter } from "./core/executor.js";
import type { TaskRunRequest, TaskRunResult } from "./core/types.js";
import {
  buildSimulatedEvent,
  createRuntime,
  runDingTalkCustom,
  runSimulatedDispatch,
} from "./runtime.js";

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

  if (command === "codex-smoke") {
    const text = args.slice(1).filter((arg) => arg !== "--config" && arg !== configPath).join(" ").trim() || "Say hello from GroupMate.";
    const config = await loadConfigAsync({ configPath: configPath ?? undefined });
    const executor = new CodexCliExecutor({
      command: config.executor.command,
      timeoutMs: config.executor.timeoutMs,
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
    const currentText = args.slice(1).filter((arg) => arg !== "--config" && arg !== configPath).join(" ").trim();
    if (!currentText) {
      throw new Error("Missing message text for dingtalk-custom.");
    }

    const runtime = await createRuntime({
      configPath: configPath ?? undefined,
      executor: createMockExecutorIfEnabled(),
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

  for (const check of checks) {
    process.stdout.write(`${check.ok ? "[ok]" : "[fail]"} ${check.name}: ${check.detail}\n`);
  }

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
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
  groupmate codex-smoke [prompt]
  groupmate simulate --text "..." [--channel <id>] [--sender <id>] [--sender-name <name>] [--source dingtalk]
  groupmate dingtalk-custom "用户消息文本"

Environment:
  GROUPMATE_DATA_DIR
  GROUPMATE_DWS_COMMAND
  GROUPMATE_DINGTALK_GROUP_ID
  GROUPMATE_DINGTALK_BOT_NAME
  GROUPMATE_CODEX_COMMAND
  GROUPMATE_CODEX_TIMEOUT_MS
  GROUPMATE_OWNER_IDS
  GROUPMATE_WRITER_IDS
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
