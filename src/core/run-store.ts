export { createRunId } from "../storage/sqlite/run-ledger.js";

export function summarizeRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const value = raw as Record<string, unknown>;
  return {
    code: value.code,
    timedOut: value.timedOut,
    stderrLength: value.stderrLength ?? (typeof value.stderr === "string" ? value.stderr.length : undefined),
    stdoutLength: value.stdoutLength ?? (typeof value.stdout === "string" ? value.stdout.length : undefined),
    threadId: value.threadId,
    errorCategory: value.errorCategory,
    finalTextLength: typeof value.finalText === "string" ? value.finalText.length : undefined,
  };
}
