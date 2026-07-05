# Roadmap

This roadmap reflects the initial direction. It is intentionally practical: first make one complete path work, then generalize.

## Phase 1: DingTalk CLI + Codex CLI

Goal: prove the local-first loop.

- DingTalk CLI source adapter based on `dws`.
- Mention-based trigger.
- Message normalization into `SourceEvent`.
- Channel workspace creation.
- Recent message context.
- `CHANNEL.md` and `MEMORY.md`.
- Requester permission decision.
- Codex CLI executor.
- Text reply to DingTalk.
- Local task run logs.

## Phase 2: Message Store and Memory

Goal: make channel context durable and useful.

- SQLite or NDJSON-backed message store.
- Recent message window.
- Full-text search over channel history.
- Memory curation workflow.
- Relevant history retrieval.
- Skill loading by task type.

## Phase 3: Governance

Goal: make execution safe enough for team use.

- Per-channel `tools.toml`.
- Owner / writer / member policy.
- Dangerous action detection.
- Explicit confirmation flow.
- Action receipts.
- Audit logs.
- Task-level executor resume.

## Phase 4: More Sources

Goal: make message source adapters truly pluggable.

- Feishu / Lark CLI adapter.
- WeCom CLI adapter.
- DingTalk official Stream / Webhook adapter.
- Feishu Bot Event / Webhook adapter.
- WeCom Callback adapter.

## Phase 5: More Executors

Goal: make coding-agent executors interchangeable.

- Claude Code CLI executor.
- Cursor CLI executor.
- Executor capability discovery.
- Per-channel executor policy.
- Shared output/event normalization.

## Phase 6: Ambient Teammate

Goal: let the agent help without becoming noisy.

- Optional channel heartbeat.
- Unanswered question detection.
- Action item tracking.
- Deadline reminders.
- Risk and blocker summaries.
- Silent mode by default when there is nothing useful to say.
