export type ChatSource = "dingtalk" | "feishu" | "wecom" | string;

export type SourceTransport = "cli" | "stream" | "webhook" | "callback" | string;

export type PermissionMode = "ask" | "write" | "admin";

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface ActorIdentity {
  id: string;
  name?: string;
  staffId?: string;
  raw?: unknown;
}

export interface ChannelRef {
  source: ChatSource;
  transport: SourceTransport;
  workspaceId: string;
  channelId: string;
}

export interface SourceMessage {
  id: string;
  channel: ChannelRef;
  sender: ActorIdentity;
  text: string;
  mentions: string[];
  timestamp: string;
  raw?: unknown;
}

export interface SourceEvent {
  message: SourceMessage;
  trigger: "mention" | "command" | "ambient";
}

export interface ChannelContext {
  channel: ChannelRef;
  channelProfile?: string;
  memory?: string;
  recentMessages: SourceMessage[];
  relatedMessages?: SourceMessage[];
  contextNotice?: string;
}

export interface PermissionDecision {
  mode: PermissionMode;
  sandbox: SandboxMode;
  reason: string;
}

export interface TaskRunRequest {
  event: SourceEvent;
  context: ChannelContext;
  permission: PermissionDecision;
}

export interface TaskRunResult {
  ok: boolean;
  text: string;
  executor: string;
  runId?: string;
  raw?: unknown;
}
