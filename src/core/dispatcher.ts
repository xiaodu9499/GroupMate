import type { ExecutorAdapter } from "./executor.js";
import type { PermissionDecision, SourceEvent, TaskRunResult } from "./types.js";
import { defaultChannelWorkspace } from "./channel-workspace.js";

export interface DispatcherOptions {
  executor: ExecutorAdapter;
  decidePermission?: (event: SourceEvent) => PermissionDecision;
}

export class Dispatcher {
  constructor(private readonly options: DispatcherOptions) {}

  async dispatch(event: SourceEvent): Promise<TaskRunResult> {
    const context = await defaultChannelWorkspace.buildContext(event.message.channel);
    const permission = this.options.decidePermission?.(event) ?? {
      mode: "ask",
      sandbox: "read-only",
      reason: "default ask mode",
    };

    return this.options.executor.run({
      event,
      context,
      permission,
    });
  }
}
