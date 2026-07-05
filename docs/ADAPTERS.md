# Adapter Design

GroupMate has two plugin surfaces:

- source adapters, which receive or reconstruct chat events;
- executor adapters, which run local coding agents or tools.

## Source Adapters

Source adapters convert platform-specific messages into normalized `SourceEvent` objects.

Planned source adapters:

```text
dingtalk-cli
feishu-cli
wecom-cli
dingtalk-stream
feishu-webhook
wecom-callback
```

### CLI-first Strategy

The first version prioritizes CLI adapters because they are easier to run locally:

- reuse existing platform login;
- avoid public callback URLs during development;
- easier stdout / stderr debugging;
- consistent with local coding-agent executors.

CLI adapters may have incomplete event metadata. In that case, the adapter should reconstruct missing fields by querying message history.

### Normalized Event Shape

```ts
type SourceEvent = {
  message: {
    id: string;
    channel: {
      source: string;
      transport: string;
      workspaceId: string;
      channelId: string;
    };
    sender: {
      id: string;
      name?: string;
      staffId?: string;
      raw?: unknown;
    };
    text: string;
    mentions: string[];
    timestamp: string;
    raw?: unknown;
  };
  trigger: "mention" | "command" | "ambient";
};
```

## Executor Adapters

Executor adapters convert a normalized `TaskRunRequest` into a local agent invocation.

Planned executor adapters:

```text
codex-cli
claude-code-cli
cursor-cli
```

### Executor Rules

- Executors must respect the sandbox selected by the permission decision.
- Executors should parse structured output where possible.
- Executors should enforce timeouts.
- Executors should avoid exposing raw logs to chat unless explicitly requested.
- Executor resume should be scoped to a task run, not an entire channel.

## DingTalk CLI Notes

The first DingTalk implementation is expected to use `dws`.

Potential commands:

```text
dws dev connect
dws chat message list
```

Known design issue: some CLI flows may pass only message text to the child process. The adapter should be prepared to reconstruct sender, channel, and message id from recent group history.
