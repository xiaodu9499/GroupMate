export interface CodexJsonlEvent {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
  };
}

export interface CodexParseResult {
  lastAgentMessage: string;
  threadId?: string;
}

export function parseCodexJsonl(stdout: string): CodexParseResult {
  let lastAgentMessage = "";
  let threadId: string | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const event = JSON.parse(line) as CodexJsonlEvent;
      if (event.type === "thread.started" && event.thread_id) {
        threadId = event.thread_id;
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        lastAgentMessage = event.item.text ?? "";
      }
    } catch {
      // Ignore non-JSON progress output.
    }
  }

  return {
    lastAgentMessage: lastAgentMessage.trim(),
    threadId,
  };
}

export function summarizeCodexRaw(input: {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  threadId?: string;
}): Record<string, unknown> {
  return {
    code: input.code,
    timedOut: input.timedOut,
    stderrLength: input.stderr.length,
    stdoutLength: input.stdout.length,
    threadId: input.threadId,
  };
}
