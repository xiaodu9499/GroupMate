import type { GroupMateConfig } from "./core/config.js";
import { loadConfigAsync } from "./core/config.js";
import { ChannelWorkspace } from "./core/channel-workspace.js";
import { Dispatcher } from "./core/dispatcher.js";
import { createPermissionEngine } from "./core/permissions.js";
import type { ExecutorAdapter } from "./core/executor.js";
import { CodexCliExecutor } from "./executors/codex-cli/index.js";
import { DingTalkCliAdapter } from "./adapters/dingtalk-cli/index.js";
import type { SourceEvent, TaskRunResult } from "./core/types.js";

export interface CreateRuntimeOptions {
  config?: GroupMateConfig;
  configPath?: string;
  executor?: ExecutorAdapter;
}

export async function createRuntime(options: CreateRuntimeOptions = {}) {
  const config = options.config ?? (await loadConfigAsync({ configPath: options.configPath }));
  const workspace = new ChannelWorkspace({
    dataDir: config.workspace.dataDir,
    historyLimit: config.source.historyLimit,
    botName: config.source.botName,
  });
  const permissionEngine = createPermissionEngine(config);
  const executor =
    options.executor ??
    new CodexCliExecutor({
      command: config.executor.command,
      timeoutMs: config.executor.timeoutMs,
    });
  const dingTalkAdapter = new DingTalkCliAdapter({ config });

  return {
    config,
    workspace,
    permissionEngine,
    executor,
    dingTalkAdapter,
    createDispatcher(sourceAdapter?: InstanceType<typeof DingTalkCliAdapter>) {
      return new Dispatcher({
        workspace,
        permissionEngine,
        executor,
        sourceAdapter,
      });
    },
  };
}

export function buildSimulatedEvent(options: {
  text: string;
  channelId: string;
  senderId: string;
  senderName?: string;
  source?: string;
}): SourceEvent {
  const timestamp = new Date().toISOString();
  return {
    trigger: "mention",
    message: {
      id: `sim-${Date.now()}`,
      channel: {
        source: options.source ?? "dingtalk",
        transport: "cli",
        workspaceId: "default",
        channelId: options.channelId,
      },
      sender: {
        id: options.senderId,
        name: options.senderName ?? options.senderId,
      },
      text: options.text,
      mentions: [],
      timestamp,
    },
  };
}

export async function runSimulatedDispatch(
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  event: SourceEvent,
): Promise<TaskRunResult> {
  const dispatcher = runtime.createDispatcher();
  return dispatcher.dispatch(event);
}

export async function runDingTalkCustom(
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  currentText: string,
): Promise<TaskRunResult> {
  const event = await runtime.dingTalkAdapter.reconstructEvent(currentText);
  const dispatcher = runtime.createDispatcher(runtime.dingTalkAdapter);
  return dispatcher.dispatch(event);
}
