import type { GroupMateConfig } from "./core/config.js";
import { loadConfigAsync } from "./core/config.js";
import { ChannelWorkspace } from "./core/channel-workspace.js";
import { ContextBuilder } from "./core/context-builder.js";
import { Dispatcher } from "./core/dispatcher.js";
import { loadChannelPolicy, resolveChannelPolicy } from "./core/channel-policy.js";
import { createPermissionEngine } from "./core/permissions.js";
import { getLogger } from "./core/logger.js";
import type { ExecutorAdapter } from "./core/executor.js";
import { CodexCliExecutor } from "./executors/codex-cli/index.js";
import { DingTalkCliAdapter } from "./adapters/dingtalk-cli/index.js";
import { openStorage } from "./storage/index.js";
import type { SourceEvent, TaskRunResult } from "./core/types.js";

export interface CreateRuntimeOptions {
  config?: GroupMateConfig;
  configPath?: string;
  executor?: ExecutorAdapter;
  force?: boolean;
}

export async function createRuntime(options: CreateRuntimeOptions = {}) {
  const config = options.config ?? (await loadConfigAsync({ configPath: options.configPath }));
  const storage = await openStorage(config);
  const workspace = new ChannelWorkspace({
    dataDir: config.workspace.dataDir,
    historyLimit: config.source.historyLimit,
    botName: config.source.botName,
  });

  getLogger({ dataDir: config.workspace.dataDir });

  const channelRef = {
    source: "dingtalk" as const,
    transport: "cli" as const,
    workspaceId: "default",
    channelId: config.source.groupId ?? "unknown",
  };

  const channelPolicyFile = await loadChannelPolicy(workspace, {
    source: channelRef.source,
    channelId: channelRef.channelId,
  });
  const channelPolicy = resolveChannelPolicy(config, channelPolicyFile);
  const permissionEngine = createPermissionEngine(config, channelPolicy);

  const executor =
    options.executor ??
    new CodexCliExecutor({
      command: config.executor.command,
      timeoutMs: config.executor.timeoutMs,
      dataDir: config.workspace.dataDir,
    });

  const dingTalkAdapter = new DingTalkCliAdapter({
    config,
    messageStore: storage.messageStore,
  });

  const contextBuilder = new ContextBuilder({
    workspace,
    messageStore: storage.messageStore,
    botName: config.source.botName,
    recentMessagesLimit: config.source.historyLimit,
  });

  return {
    config,
    storage,
    workspace,
    permissionEngine,
    channelPolicy,
    executor,
    dingTalkAdapter,
    contextBuilder,
    createDispatcher(sourceAdapter?: InstanceType<typeof DingTalkCliAdapter>) {
      return new Dispatcher({
        workspace,
        messageStore: storage.messageStore,
        runLedger: storage.runLedger,
        permissionEngine,
        channelPolicy,
        executor,
        sourceAdapter,
        contextBuilder,
        botName: config.source.botName,
        force: options.force,
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
  const result = await dispatcher.dispatch(event);
  return result;
}

export async function runDingTalkCustom(
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  currentText: string,
): Promise<TaskRunResult> {
  const event = await runtime.dingTalkAdapter.reconstructEvent(currentText);
  const dispatcher = runtime.createDispatcher(runtime.dingTalkAdapter);
  const result = await dispatcher.dispatch(event);
  return result;
}
