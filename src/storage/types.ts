import type { ActorIdentity, ChannelRef, PermissionDecision, SandboxMode, SourceMessage } from "../core/types.js";

export interface ChannelMetadata {
  displayName?: string;
  botName?: string;
}

export interface ChannelRecord {
  id: string;
  source: string;
  transport: string;
  workspaceId: string;
  channelId: string;
  displayName?: string;
  botName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertResult {
  inserted: boolean;
  messageId: string;
}

export interface BatchUpsertResult {
  fetched: number;
  inserted: number;
  duplicated: number;
  skippedBot: number;
}

export interface RecentMessageOptions {
  limit?: number;
  excludeBot?: boolean;
  botName?: string;
}

export interface SearchOptions {
  limit?: number;
  excludeBot?: boolean;
  botName?: string;
}

export interface ChannelState {
  channelKey: string;
  lastSyncTime?: string;
  lastMessageId?: string;
  lastCursor?: string;
  updatedAt: string;
}

export type RunStatus =
  | "pending"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type ConfirmationStatus = "not_required" | "required" | "confirmed" | "rejected" | "expired";

export interface RunRecord {
  id: string;
  channelKey: string;
  sourceMessageId: string;
  requesterId: string;
  requesterName?: string;
  permissionMode: string;
  sandbox: string;
  executor: string;
  status: RunStatus;
  confirmationStatus: ConfirmationStatus;
  startedAt: string;
  endedAt?: string;
  resultText?: string;
  errorCode?: string;
  errorMessage?: string;
  rawSummaryJson?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunEventRecord {
  id: string;
  runId: string;
  type: string;
  message?: string;
  dataJson?: string;
  createdAt: string;
}

export interface CreateRunInput {
  id?: string;
  channel: ChannelRef;
  sourceMessageId: string;
  requester: ActorIdentity;
  permission: PermissionDecision;
  executor: string;
  sandbox: SandboxMode;
  status?: RunStatus;
  confirmationStatus?: ConfirmationStatus;
}

export interface UpdateRunInput {
  status?: RunStatus;
  confirmationStatus?: ConfirmationStatus;
  endedAt?: string;
  resultText?: string;
  errorCode?: string;
  errorMessage?: string;
  rawSummaryJson?: string;
  executor?: string;
}

export interface RunEventInput {
  type: string;
  message?: string;
  data?: unknown;
}

export interface ListRunsOptions {
  limit?: number;
  status?: RunStatus;
}

export interface MessageStore {
  upsertChannel(channel: ChannelRef, metadata?: ChannelMetadata): Promise<ChannelRecord>;
  upsertMessage(message: SourceMessage, options?: { isBot?: boolean }): Promise<UpsertResult>;
  upsertMessages(messages: SourceMessage[], options?: { botName?: string }): Promise<BatchUpsertResult>;
  getRecentMessages(channel: ChannelRef, options?: RecentMessageOptions): Promise<SourceMessage[]>;
  searchMessages(channel: ChannelRef, query: string, options?: SearchOptions): Promise<SourceMessage[]>;
  getMessageByPlatformId(channel: ChannelRef, messageId: string): Promise<SourceMessage | null>;
  getChannelState(channel: ChannelRef): Promise<ChannelState | null>;
  updateChannelState(channel: ChannelRef, patch: Partial<Omit<ChannelState, "channelKey">>): Promise<void>;
}

export interface RunLedger {
  createRun(input: CreateRunInput): Promise<RunRecord>;
  updateRun(id: string, patch: UpdateRunInput): Promise<void>;
  appendEvent(runId: string, event: RunEventInput): Promise<void>;
  getRun(id: string): Promise<RunRecord | null>;
  getRunBySourceMessageId(channel: ChannelRef, sourceMessageId: string): Promise<RunRecord | null>;
  listRuns(channel: ChannelRef, options?: ListRunsOptions): Promise<RunRecord[]>;
  listEvents(runId: string): Promise<RunEventRecord[]>;
}

export interface DatabaseStatus {
  path: string;
  schemaVersion: number;
  ftsAvailable: boolean;
  channelCount: number;
  messageCount: number;
  runCount: number;
}
