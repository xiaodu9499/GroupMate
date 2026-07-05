# Architecture

GroupMate treats an enterprise group chat as a long-lived channel workspace and treats every agent action as a bounded task run.

## Design Boundaries

```text
Channel workspace: long-lived, shared by the group
Task run: bounded, triggered by a request
Executor session: short-lived or resumable only within a task
Requester permission: evaluated every time
```

The channel owns context. The current requester owns authority.

## Runtime Flow

```text
Source Adapter
  -> SourceEvent
  -> Channel Workspace
  -> Context Builder
  -> Permission Decision
  -> Dispatcher
  -> Executor Adapter
  -> TaskRunResult
  -> Callback / Reply
```

## Source Adapter Contract

A source adapter normalizes a platform-specific event into a `SourceEvent`.

It should extract:

- source platform, such as `dingtalk`, `feishu`, or `wecom`;
- transport, such as `cli`, `stream`, `webhook`, or `callback`;
- workspace / organization id;
- channel id;
- message id;
- sender identity;
- message text;
- mentions;
- timestamp;
- raw event, when available.

The core runtime should not depend on DingTalk, Feishu, or WeCom-specific fields.

## Channel Workspace

Each channel maps to local durable state:

```text
data/channels/<source>/<channel_id>/
  CHANNEL.md
  MEMORY.md
  tools.toml
  state.json
  messages.ndjson
  skills/
  runs/
```

The workspace is responsible for:

- channel profile;
- curated memory;
- recent messages;
- historical message search;
- per-channel tool policy;
- run state and audit artifacts.

## Context Packet

Executors receive a bounded context packet:

```text
current request
current requester
permission mode
recent channel messages
relevant historical messages
CHANNEL.md
MEMORY.md
relevant skills
executor instructions
```

Full message history should stay in the message store and be retrieved selectively.

## Executor Adapter Contract

An executor adapter runs a task with a normalized `TaskRunRequest`.

Planned executors:

- Codex CLI
- Claude Code CLI
- Cursor CLI

Executors should expose:

- command invocation;
- sandbox / permission mapping;
- timeout handling;
- structured output parsing;
- optional task-level resume.

The long-lived channel session should not be tied to a permanent coding-agent session.

## Permission Model

Permissions are requester-scoped:

```text
ask: read-only answers, summaries, investigation plans
write: controlled local agent execution
admin: channel configuration and policy changes
```

High-risk operations should require explicit confirmation even for owners.

## Inspiration Boundary

GroupMate borrows the channel memory idea from Claude Tag-style projects and the local executor dispatch idea from OpenTag-style projects. It keeps those concerns separate so group context and execution authority do not become tangled.
