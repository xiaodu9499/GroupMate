# Contributing to GroupMate

Thanks for considering a contribution. GroupMate is still early, so clarity matters more than volume. Small, focused changes are preferred.

## Project Direction

GroupMate is built around three boundaries:

- message sources are pluggable;
- executor backends are pluggable;
- channel memory is long-lived, while task execution is bounded and permissioned.

Before adding a feature, check whether it belongs to:

- a source adapter, such as DingTalk CLI, Feishu CLI, or WeCom CLI;
- an executor adapter, such as Codex CLI, Claude Code CLI, or Cursor CLI;
- the core runtime, such as dispatching, permissions, memory, or audit logs.

## Development Setup

```bash
npm install
npm run typecheck
npm run build
```

Run the local CLI scaffold:

```bash
node dist/cli.js help
```

## Contribution Guidelines

- Keep adapter-specific logic out of core runtime modules.
- Keep executor-specific logic behind the executor adapter interface.
- Do not send full chat history to an executor by default.
- Preserve requester-scoped permissions: the current requester decides what can run.
- Dangerous actions should require explicit confirmation.
- Prefer small PRs with a clear problem statement.

## Commit Style

Use short imperative commit messages, for example:

```text
Add DingTalk CLI event normalizer
Document executor contract
```

## License

By contributing, you agree that your contribution will be licensed under the MIT License.
