import { spawn } from "node:child_process";
import type { ExecutorAdapter } from "../../core/executor.js";
import type { TaskRunRequest, TaskRunResult } from "../../core/types.js";

export interface CodexCliExecutorOptions {
  command?: string;
  timeoutMs?: number;
}

export class CodexCliExecutor implements ExecutorAdapter {
  readonly name = "codex-cli";

  constructor(private readonly options: CodexCliExecutorOptions = {}) {}

  async run(request: TaskRunRequest): Promise<TaskRunResult> {
    const prompt = buildPrompt(request);
    const result = await runCodex(this.options.command ?? "codex.cmd", prompt, request.permission.sandbox, {
      timeoutMs: this.options.timeoutMs ?? 120_000,
    });

    return {
      ok: result.ok,
      text: result.text,
      executor: this.name,
      raw: result.raw,
    };
  }
}

function buildPrompt(request: TaskRunRequest): string {
  const recentMessages = request.context.recentMessages
    .map((message) => `[${message.timestamp} ${message.sender.name ?? message.sender.id}] ${message.text}`)
    .join("\n");

  return `You are GroupMate, a channel-scoped work assistant.

Reply in the same language as the user's request.

Permission:
- mode: ${request.permission.mode}
- sandbox: ${request.permission.sandbox}
- reason: ${request.permission.reason}

Channel profile:
${request.context.channelProfile ?? "(none)"}

Channel memory:
${request.context.memory ?? "(none)"}

Recent channel messages:
${recentMessages || "(none)"}

Current requester:
${request.event.message.sender.name ?? request.event.message.sender.id}

Current request:
${request.event.message.text}

Final answer:`;
}

async function runCodex(
  command: string,
  prompt: string,
  sandbox: string,
  options: { timeoutMs: number },
): Promise<{ ok: boolean; text: string; raw: unknown }> {
  return new Promise((resolve) => {
    const child = spawn(command, ["exec", "--json", "--ignore-rules", "-s", sandbox, "--skip-git-repo-check", "-"], {
      windowsHide: true,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.end(prompt, "utf8");

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, text: `Codex CLI failed: ${error.message}`, raw: { stderr, timedOut } });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, text: "Codex CLI timed out.", raw: { stdout, stderr, code, timedOut } });
        return;
      }

      const text = parseLastAgentMessage(stdout);
      if (text) {
        resolve({ ok: true, text, raw: { stdout, stderr, code } });
        return;
      }

      resolve({
        ok: false,
        text: code === 0 ? "Codex CLI produced no final message." : "Codex CLI failed.",
        raw: { stdout, stderr, code },
      });
    });
  });
}

function parseLastAgentMessage(stdout: string): string {
  let last = "";
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        last = event.item.text ?? "";
      }
    } catch {
      // Ignore non-JSON progress output.
    }
  }
  return last.trim();
}
