#!/usr/bin/env node

import { CodexCliExecutor } from "./executors/codex-cli/index.js";

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    process.stdout.write("GroupMate 0.1.0\n");
    return;
  }

  if (command === "codex-smoke") {
    const text = process.argv.slice(3).join(" ").trim() || "Say hello from GroupMate.";
    const executor = new CodexCliExecutor();
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

  throw new Error(`Unknown command: ${command}`);
}

function printHelp(): void {
  process.stdout.write(`GroupMate

Usage:
  groupmate help
  groupmate version
  groupmate codex-smoke [prompt]

This is an early scaffold. DingTalk CLI and full dispatcher commands are planned.
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
