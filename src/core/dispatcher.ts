import type { ChannelWorkspace } from "./channel-workspace.js";
import type { ExecutorAdapter } from "./executor.js";
import type { PermissionEngine } from "./permissions.js";
import { createRunId, RunStore, summarizeRaw } from "./run-store.js";
import type { SourceAdapter } from "./source-adapter.js";
import type { SourceEvent, TaskRunResult } from "./types.js";

export interface DispatcherOptions {
  workspace: ChannelWorkspace;
  permissionEngine: PermissionEngine;
  executor: ExecutorAdapter;
  sourceAdapter?: SourceAdapter;
}

export class Dispatcher {
  private readonly runStore: RunStore;

  constructor(private readonly options: DispatcherOptions) {
    this.runStore = new RunStore(options.workspace);
  }

  async dispatch(event: SourceEvent): Promise<TaskRunResult> {
    const startedAt = new Date().toISOString();
    const runId = createRunId();

    await this.options.workspace.appendMessage(event.message);
    const context = await this.options.workspace.buildContext(event.message.channel);
    const permission = this.options.permissionEngine.decide(event.message.sender);

    const result = await this.options.executor.run({
      event,
      context,
      permission,
    });

    const endedAt = new Date().toISOString();
    await this.runStore.save(event.message.channel, {
      id: runId,
      sourceMessageId: event.message.id,
      requester: event.message.sender,
      permission,
      executor: result.executor,
      status: result.ok ? "completed" : "failed",
      startedAt,
      endedAt,
      resultText: result.text,
      rawSummary: summarizeRaw(result.raw),
    });

    if (this.options.sourceAdapter) {
      await this.options.sourceAdapter.reply(event.message, result.text);
    }

    return {
      ...result,
      runId,
    };
  }
}
