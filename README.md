# GroupMate

GroupMate is a local-first channel agent runtime for enterprise work chats.

It connects chat platform CLIs and bot APIs to local coding-agent executors such as Codex CLI, Claude Code CLI, and Cursor CLI. It keeps each group chat as a channel-scoped workspace, understands ongoing human discussion, and runs an agent only when the channel explicitly needs help.

> Turn DingTalk, Feishu, and WeCom groups into context-aware agent workspaces without turning the group into a bot chatroom.

## What It Is

GroupMate is not a traditional chatbot.

It is a bridge between enterprise group chats and local agent executors. Humans continue to discuss work in DingTalk, Feishu, or WeCom. GroupMate records the channel context, maintains durable memory, and when someone mentions the agent, it creates a bounded task run with the right context and permissions.

The agent can:

- answer questions based on recent group discussion;
- summarize decisions, risks, and action items;
- search channel history and project knowledge;
- inspect local repositories or documents;
- run Codex CLI, Claude Code CLI, or Cursor CLI for controlled work;
- ask for confirmation before dangerous actions.

## Why GroupMate

Most chatbots treat every message as an isolated prompt. Real work does not happen that way.

In a project group, people discuss incidents, requirements, logs, owners, deadlines, and constraints before anyone explicitly asks the bot to act. GroupMate is designed for that environment:

- humans remain the center of the conversation;
- the agent quietly keeps channel context;
- the agent intervenes only when mentioned or when a configured trigger fires;
- each task run receives a bounded context packet, not the entire chat history;
- execution permission is decided by the current requester, not by the channel itself.

## Core Idea

```text
Enterprise chat channel
  -> Channel workspace
  -> Message store
  -> Channel memory
  -> Trigger and permission engine
  -> Pluggable executor
  -> Reply back to the source channel
```

GroupMate separates two things that are often mixed together:

```text
Long-lived context belongs to the channel.
Execution permission belongs to the current requester.
```

That means a DingTalk group, Feishu group, or WeCom group can have a shared agent memory, while every execution request still goes through per-user permission checks.

## Integration Strategy

GroupMate prioritizes CLI-based adapters first, then official bot API adapters.

CLI adapters make the project easier to run locally because they can reuse existing platform login, organization selection, and debugging flows. Official Stream, Webhook, or Callback adapters can be added later for production deployments.

```text
Phase 1: enterprise IM CLI adapters
Phase 2: official bot Stream / Webhook / Callback adapters
```

## Planned Adapters

Message source adapters:

- DingTalk via dws CLI
- Feishu / Lark via CLI
- WeCom / Enterprise WeChat via CLI
- DingTalk Stream / Webhook
- Feishu Bot Event / Webhook
- WeCom Callback

The first supported source adapter will be DingTalk via CLI.

Executor adapters:

- Codex CLI
- Claude Code CLI
- Cursor CLI

The first supported executor adapter will be Codex CLI.

## Architecture

```text
+--------------------+
|  DingTalk / Feishu |
|  WeCom / others    |
+---------+----------+
          |
          v
+--------------------+
|  Source Adapter    |
|  normalize events  |
+---------+----------+
          |
          v
+--------------------+
|  Channel Workspace |
|  messages, memory  |
|  skills, settings  |
+---------+----------+
          |
          v
+--------------------+
|  Dispatcher        |
|  trigger, auth,    |
|  task admission    |
+---------+----------+
          |
          v
+--------------------+
|  Executor Adapter  |
|  Codex / Claude /  |
|  Cursor            |
+---------+----------+
          |
          v
+--------------------+
|  Callback Adapter  |
|  reply, card,      |
|  receipt           |
+--------------------+
```

## Channel Workspace

Each chat channel is mapped to a local workspace:

```text
data/channels/<source>/<channel_id>/
  CHANNEL.md
  MEMORY.md
  tools.toml
  state.json
  skills/
  runs/
```

`CHANNEL.md` describes the channel:

- project background;
- team responsibilities;
- response style;
- operational rules;
- linked repositories and services.

`MEMORY.md` stores curated long-term memory:

- project facts;
- decisions;
- owners;
- recurring incidents;
- team preferences;
- known constraints.

The full message history is stored separately and retrieved when needed. The agent does not blindly send all historical messages into the model context.

## Context Strategy

For each triggered task, GroupMate builds a bounded context packet:

```text
Current request
Current requester identity
Permission mode
Recent channel messages
Relevant historical messages
CHANNEL.md
MEMORY.md
Relevant skills
Executor instructions
```

This keeps the agent useful in busy groups without making the model context noisy or unsafe.

## Permissions

GroupMate uses requester-scoped permissions.

Example policy:

```toml
[permissions]
owners = ["user_open_id_1"]
writers = ["user_open_id_2"]
default_mode = "ask"

[execution]
ask_sandbox = "read-only"
write_sandbox = "workspace-write"
dangerous_actions_require_confirmation = true
```

Suggested behavior:

- normal members can ask questions, summarize, and request read-only analysis;
- writers can run approved local agent tasks;
- owners can configure the channel workspace;
- dangerous actions require explicit confirmation.

## Task Runs

Executors are short-lived by default.

```text
Channel workspace: long-lived
Task run: short-lived
Executor session: short-lived or resumable per task
```

This avoids tying a whole group chat to a single permanent coding-agent session. A task can resume its executor session when confirmation or follow-up is needed, but the channel itself remains the durable source of context.

## Example

In a DingTalk project group:

```text
Alice: The deployment failed again after the config change.
Bob: I saw a timeout in the payment worker logs.
Charlie: It might be related to yesterday's retry policy update.
Alice: @agent please check the likely cause and suggest next steps.
```

GroupMate can:

1. read the recent group discussion;
2. identify the current requester;
3. load project memory and relevant history;
4. run Codex CLI in read-only mode;
5. reply with findings and proposed actions;
6. request confirmation before making changes.

## Goals

- Treat every group chat as a shared channel workspace.
- Keep humans as the center of the conversation.
- Let the agent intervene only when useful.
- Prefer local-first CLI integrations for the first version.
- Support official enterprise chat bot APIs over time.
- Support multiple local coding-agent executors.
- Keep permissions explicit and auditable.
- Make runs reproducible and reviewable.

## Non-goals

- Replacing human discussion in group chats.
- Sending every message to an LLM.
- Giving all channel members write access.
- Binding one permanent coding-agent session to a whole group.
- Hiding local execution behind an opaque cloud service.

## Roadmap

### Phase 1: DingTalk + Codex CLI

- DingTalk source adapter
- DingTalk group message ingestion
- Mention-based trigger
- Channel workspace creation
- Recent message context
- `CHANNEL.md` and `MEMORY.md`
- Requester permission detection
- Codex CLI executor
- Text reply back to DingTalk
- Local run logs

### Phase 2: Memory and Governance

- SQLite message store
- Full-text channel search
- Memory curation
- Action receipts
- Confirmation flow
- Dangerous action detection
- Per-channel tool policy

### Phase 3: More Platforms and Executors

- Feishu / Lark adapter
- WeCom adapter
- Claude Code CLI executor
- Cursor CLI executor
- Executor resume per task

### Phase 4: Ambient Teammate

- Optional channel heartbeat
- Unanswered question detection
- Action item tracking
- Deadline reminders
- Risk and blocker summaries

## Inspiration

GroupMate is inspired by:

- Claude Tag-style channel-scoped agents;
- OpenTag-style local executor dispatch;
- enterprise work chats where most useful context already lives.

## License

MIT
