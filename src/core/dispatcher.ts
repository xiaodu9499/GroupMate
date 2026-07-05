import type { ChannelWorkspace } from "./channel-workspace.js";
import { ContextBuilder } from "./context-builder.js";
import {
  buildConfirmationReply,
  detectDangerousAction,
  parseConfirmationCommand,
} from "./dangerous-action.js";
import type { ExecutorAdapter } from "./executor.js";
import { getLogger } from "./logger.js";
import type { PermissionEngine } from "./permissions.js";
import type { ResolvedChannelPolicy } from "./channel-policy.js";
import type { SourceAdapter } from "./source-adapter.js";
import type { MessageStore, RunLedger } from "../storage/types.js";
import { createRunId } from "../storage/sqlite/run-ledger.js";
import { buildChannelKey } from "../storage/channel-key.js";
import type { SourceEvent, TaskRunResult } from "./types.js";

export interface DispatcherOptions {
  workspace: ChannelWorkspace;
  messageStore: MessageStore;
  runLedger: RunLedger;
  permissionEngine: PermissionEngine;
  channelPolicy: ResolvedChannelPolicy;
  executor: ExecutorAdapter;
  sourceAdapter?: SourceAdapter;
  contextBuilder?: ContextBuilder;
  botName?: string;
  force?: boolean;
}

function summarizeRaw(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return raw === undefined ? undefined : JSON.stringify(raw);
  }

  const value = raw as Record<string, unknown>;
  return JSON.stringify({
    code: value.code,
    timedOut: value.timedOut,
    stderrLength: value.stderrLength ?? (typeof value.stderr === "string" ? value.stderr.length : undefined),
    stdoutLength: value.stdoutLength ?? (typeof value.stdout === "string" ? value.stdout.length : undefined),
    threadId: value.threadId,
    errorCategory: value.errorCategory,
    finalTextLength: typeof value.finalText === "string" ? value.finalText.length : undefined,
  });
}

export class Dispatcher {
  private readonly contextBuilder: ContextBuilder;
  private readonly logger = getLogger();

  constructor(private readonly options: DispatcherOptions) {
    this.contextBuilder =
      options.contextBuilder ??
      new ContextBuilder({
        workspace: options.workspace,
        messageStore: options.messageStore,
        botName: options.botName,
      });
  }

  async dispatch(event: SourceEvent): Promise<TaskRunResult> {
    const { message } = event;
    const channelKey = buildChannelKey(message.channel);

    await this.options.messageStore.upsertChannel(message.channel, {
      botName: this.options.botName,
    });

    const upsert = await this.options.messageStore.upsertMessage(message);
    if (upsert.inserted) {
      this.logger.messageUpserted({
        messageId: message.id,
        channel: channelKey,
        sender: message.sender.id,
        textLength: message.text.length,
      });
    }

    const confirmation = parseConfirmationCommand(message.text);
    if (confirmation) {
      return this.handleConfirmation(event, confirmation);
    }

    if (!this.options.force) {
      const existingRun = await this.options.runLedger.getRunBySourceMessageId(message.channel, message.id);
      if (existingRun && existingRun.status !== "waiting_confirmation") {
        const summary = existingRun.resultText ?? existingRun.errorMessage ?? "already processed";
        const text = `该消息已处理过（${existingRun.id}）：${summary}`;
        await this.replyIfNeeded(event, text);
        return {
          ok: true,
          text,
          executor: existingRun.executor,
          runId: existingRun.id,
        };
      }
    }

    const permission = this.options.permissionEngine.decide(message.sender);
    this.logger.info("permission.decided", {
      runId: "pending",
      requester: message.sender.id,
      mode: permission.mode,
      sandbox: permission.sandbox,
    });

    const danger = detectDangerousAction(message.text, {
      requireConfirmation: this.options.channelPolicy.dangerousActionsRequireConfirmation,
    });

    const runId = createRunId();

    if (danger.requiresConfirmation && permission.mode !== "ask") {
      await this.options.runLedger.createRun({
        id: runId,
        channel: message.channel,
        sourceMessageId: message.id,
        requester: message.sender,
        permission,
        executor: this.options.executor.name,
        sandbox: permission.sandbox,
        status: "waiting_confirmation",
        confirmationStatus: "required",
      });
      await this.options.runLedger.appendEvent(runId, {
        type: "confirmation_required",
        message: danger.reasons.join(", "),
        data: { reasons: danger.reasons },
      });

      const replyText = buildConfirmationReply(runId, danger.reasons);
      await this.options.runLedger.updateRun(runId, {
        status: "waiting_confirmation",
        confirmationStatus: "required",
        resultText: replyText,
        endedAt: new Date().toISOString(),
      });

      this.logger.info("run.created", { runId, status: "waiting_confirmation", channel: channelKey });
      await this.replyIfNeeded(event, replyText);
      return { ok: true, text: replyText, executor: this.options.executor.name, runId };
    }

    await this.options.runLedger.createRun({
      id: runId,
      channel: message.channel,
      sourceMessageId: message.id,
      requester: message.sender,
      permission,
      executor: this.options.executor.name,
      sandbox: permission.sandbox,
      status: "running",
    });
    this.logger.info("run.created", { runId, status: "running", channel: channelKey });

    const context = await this.contextBuilder.build({ event, channel: message.channel, permission });
    await this.options.runLedger.appendEvent(runId, {
      type: "context_built",
      data: {
        recentCount: context.recentMessages.length,
        relatedCount: context.relatedMessages?.length ?? 0,
      },
    });

    await this.options.runLedger.appendEvent(runId, {
      type: "permission_decided",
      data: permission,
    });

    this.logger.info("codex.started", { runId, executor: this.options.executor.name });
    await this.options.runLedger.appendEvent(runId, { type: "executor_started" });

    const result = await this.options.executor.run({ event, context, permission });
    const endedAt = new Date().toISOString();

    await this.options.runLedger.updateRun(runId, {
      status: result.ok ? "completed" : "failed",
      endedAt,
      resultText: result.text,
      rawSummaryJson: summarizeRaw(result.raw),
      errorCode: result.ok ? undefined : ((result.raw as Record<string, unknown> | undefined)?.errorCategory as string),
      errorMessage: result.ok ? undefined : result.text,
    });

    await this.options.runLedger.appendEvent(runId, {
      type: result.ok ? "executor_completed" : "failed",
      message: result.text,
    });

    if (result.ok) {
      this.logger.info("codex.completed", { runId, textLength: result.text.length });
    } else {
      this.logger.error("codex.failed", { runId, textLength: result.text.length });
    }

    await this.replyIfNeeded(event, result.text);
    this.logger.info("reply.sent", { runId, channel: channelKey });

    return { ...result, runId };
  }

  private async handleConfirmation(
    event: SourceEvent,
    command: { action: "confirm" | "cancel" | "show"; runId: string },
  ): Promise<TaskRunResult> {
    const run = await this.options.runLedger.getRun(command.runId);
    if (!run) {
      const text = `未找到 run：${command.runId}`;
      await this.replyIfNeeded(event, text);
      return { ok: false, text, executor: "groupmate", runId: command.runId };
    }

    if (command.action === "show") {
      const text = [
        `Run ${run.id}`,
        `status: ${run.status}`,
        `requester: ${run.requesterName ?? run.requesterId}`,
        `result: ${run.resultText ?? run.errorMessage ?? "(none)"}`,
      ].join("\n");
      await this.replyIfNeeded(event, text);
      return { ok: true, text, executor: run.executor, runId: run.id };
    }

    const requester = event.message.sender;
    const isOriginalRequester = requester.id === run.requesterId;
    const canConfirm = this.options.permissionEngine.canConfirm(requester);

    if (!isOriginalRequester && !canConfirm) {
      const text = "只有原请求人或管理员可以确认/取消该 run。";
      await this.replyIfNeeded(event, text);
      return { ok: false, text, executor: "groupmate", runId: run.id };
    }

    if (run.status !== "waiting_confirmation") {
      const text = `Run ${run.id} 当前状态为 ${run.status}，无法确认或取消。`;
      await this.replyIfNeeded(event, text);
      return { ok: false, text, executor: run.executor, runId: run.id };
    }

    if (command.action === "cancel") {
      await this.options.runLedger.updateRun(run.id, {
        status: "cancelled",
        confirmationStatus: "rejected",
        endedAt: new Date().toISOString(),
        resultText: "用户已取消执行。",
      });
      const text = `已取消 run ${run.id}。`;
      await this.replyIfNeeded(event, text);
      return { ok: true, text, executor: run.executor, runId: run.id };
    }

    const originalMessage = await this.options.messageStore.getMessageByPlatformId(
      event.message.channel,
      run.sourceMessageId,
    );
    if (!originalMessage) {
      const text = `未找到 run ${run.id} 对应的原始请求，无法继续执行。`;
      await this.replyIfNeeded(event, text);
      return { ok: false, text, executor: run.executor, runId: run.id };
    }

    const permission = this.options.permissionEngine.decide(requester);
    const confirmedEvent: SourceEvent = {
      ...event,
      message: originalMessage,
    };
    const context = await this.contextBuilder.build({
      event: confirmedEvent,
      channel: originalMessage.channel,
      permission,
    });

    await this.options.runLedger.updateRun(run.id, {
      status: "running",
      confirmationStatus: "confirmed",
    });
    await this.options.runLedger.appendEvent(run.id, { type: "executor_started", message: "confirmed" });

    const result = await this.options.executor.run({ event: confirmedEvent, context, permission });
    await this.options.runLedger.updateRun(run.id, {
      status: result.ok ? "completed" : "failed",
      endedAt: new Date().toISOString(),
      resultText: result.text,
      rawSummaryJson: summarizeRaw(result.raw),
      errorCode: result.ok ? undefined : ((result.raw as Record<string, unknown> | undefined)?.errorCategory as string),
      errorMessage: result.ok ? undefined : result.text,
    });
    await this.options.runLedger.appendEvent(run.id, {
      type: result.ok ? "executor_completed" : "failed",
      message: result.text,
    });

    await this.replyIfNeeded(event, result.text);
    return { ...result, runId: run.id };
  }

  private async replyIfNeeded(event: SourceEvent, text: string): Promise<void> {
    if (this.options.sourceAdapter) {
      try {
        await this.options.sourceAdapter.reply(event.message, text);
      } catch (error) {
        this.logger.error("reply.failed", {
          messageId: event.message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }
}
