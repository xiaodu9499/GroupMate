import type { SandboxMode, TaskRunRequest, TaskRunResult } from "./types.js";

export interface ExecutorAdapter {
  readonly name: string;
  run(request: TaskRunRequest): Promise<TaskRunResult>;
}

export function assertSandboxMode(value: string): SandboxMode {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") {
    return value;
  }
  throw new Error(`Unsupported sandbox mode: ${value}`);
}
