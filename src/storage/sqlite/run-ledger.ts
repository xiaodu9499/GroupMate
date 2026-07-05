import type { ChannelRef } from "../../core/types.js";
import { buildChannelKey } from "../channel-key.js";
import type {
  CreateRunInput,
  ListRunsOptions,
  RunEventInput,
  RunEventRecord,
  RunLedger,
  RunRecord,
  UpdateRunInput,
} from "../types.js";
import type { SqliteDatabase } from "./database.js";

interface RunRow {
  id: string;
  channel_key: string;
  source_message_id: string;
  requester_id: string;
  requester_name: string | null;
  permission_mode: string;
  sandbox: string;
  executor: string;
  status: string;
  confirmation_status: string;
  started_at: string;
  ended_at: string | null;
  result_text: string | null;
  error_code: string | null;
  error_message: string | null;
  raw_summary_json: string | null;
  created_at: string;
  updated_at: string;
}

interface RunEventRow {
  id: string;
  run_id: string;
  type: string;
  message: string | null;
  data_json: string | null;
  created_at: string;
}

export class SqliteRunLedger implements RunLedger {
  constructor(private readonly db: SqliteDatabase) {}

  async createRun(input: CreateRunInput): Promise<RunRecord> {
    const now = new Date().toISOString();
    const id = input.id ?? createRunId();
    const channelKey = buildChannelKey(input.channel);

    await this.db.run(
      `INSERT INTO runs (
        id, channel_key, source_message_id, requester_id, requester_name,
        permission_mode, sandbox, executor, status, confirmation_status,
        started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        channelKey,
        input.sourceMessageId,
        input.requester.id,
        input.requester.name ?? null,
        input.permission.mode,
        input.sandbox,
        input.executor,
        input.status ?? "pending",
        input.confirmationStatus ?? "not_required",
        now,
        now,
        now,
      ],
    );

    return {
      id,
      channelKey,
      sourceMessageId: input.sourceMessageId,
      requesterId: input.requester.id,
      requesterName: input.requester.name,
      permissionMode: input.permission.mode,
      sandbox: input.sandbox,
      executor: input.executor,
      status: input.status ?? "pending",
      confirmationStatus: input.confirmationStatus ?? "not_required",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateRun(id: string, patch: UpdateRunInput): Promise<void> {
    const existing = await this.getRun(id);
    if (!existing) {
      throw new Error(`Run not found: ${id}`);
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE runs SET
        status = ?,
        confirmation_status = ?,
        ended_at = ?,
        result_text = ?,
        error_code = ?,
        error_message = ?,
        raw_summary_json = ?,
        executor = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        patch.status ?? existing.status,
        patch.confirmationStatus ?? existing.confirmationStatus,
        patch.endedAt ?? existing.endedAt ?? null,
        patch.resultText ?? existing.resultText ?? null,
        patch.errorCode ?? existing.errorCode ?? null,
        patch.errorMessage ?? existing.errorMessage ?? null,
        patch.rawSummaryJson ?? existing.rawSummaryJson ?? null,
        patch.executor ?? existing.executor,
        now,
        id,
      ],
    );
  }

  async appendEvent(runId: string, event: RunEventInput): Promise<void> {
    const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO run_events (id, run_id, type, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, runId, event.type, event.message ?? null, event.data ? JSON.stringify(event.data) : null, now],
    );
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const row = await this.db.get<RunRow>("SELECT * FROM runs WHERE id = ?", [id]);
    return row ? rowToRunRecord(row) : null;
  }

  async getRunBySourceMessageId(channel: ChannelRef, sourceMessageId: string): Promise<RunRecord | null> {
    const channelKey = buildChannelKey(channel);
    const row = await this.db.get<RunRow>(
      "SELECT * FROM runs WHERE channel_key = ? AND source_message_id = ? ORDER BY started_at DESC LIMIT 1",
      [channelKey, sourceMessageId],
    );
    return row ? rowToRunRecord(row) : null;
  }

  async listRuns(channel: ChannelRef, options: ListRunsOptions = {}): Promise<RunRecord[]> {
    const channelKey = buildChannelKey(channel);
    const limit = options.limit ?? 20;
    let sql = "SELECT * FROM runs WHERE channel_key = ?";
    const params: unknown[] = [channelKey];

    if (options.status) {
      sql += " AND status = ?";
      params.push(options.status);
    }

    sql += " ORDER BY started_at DESC LIMIT ?";
    params.push(limit);

    const rows = await this.db.all<RunRow>(sql, params);
    return rows.map(rowToRunRecord);
  }

  async listEvents(runId: string): Promise<RunEventRecord[]> {
    const rows = await this.db.all<RunEventRow>(
      "SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at ASC",
      [runId],
    );
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      message: row.message ?? undefined,
      dataJson: row.data_json ?? undefined,
      createdAt: row.created_at,
    }));
  }
}

export function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowToRunRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    channelKey: row.channel_key,
    sourceMessageId: row.source_message_id,
    requesterId: row.requester_id,
    requesterName: row.requester_name ?? undefined,
    permissionMode: row.permission_mode,
    sandbox: row.sandbox,
    executor: row.executor,
    status: row.status as RunRecord["status"],
    confirmationStatus: row.confirmation_status as RunRecord["confirmationStatus"],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    resultText: row.result_text ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    rawSummaryJson: row.raw_summary_json ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
