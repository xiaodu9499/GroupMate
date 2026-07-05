# Repository Guidelines

## Project Structure & Module Organization

GroupMate is a TypeScript, local-first channel agent runtime. Source code lives in `src/`: `core/` contains dispatching, permissions, config, workspace, and runtime contracts; `adapters/` contains message-source integrations such as `dingtalk-cli`; `executors/` contains backend integrations such as `codex-cli`; `cli.ts` is the command entry point and `index.ts` exports package APIs. Tests mirror these areas under `tests/core/`, `tests/adapters/`, `tests/executors/`, and `tests/runtime/`. Documentation is in `docs/`, sample config files are in `examples/`, and build output goes to `dist/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies; Node `>=20` is required.
- `npm run dev`: run the CLI from TypeScript via `tsx src/cli.ts`.
- `npm run build`: compile TypeScript into `dist/`.
- `npm run start`: run the built CLI at `dist/cli.js`.
- `npm run typecheck`: check types without emitting files.
- `npm test`: run the Vitest suite once.

For a quick local check, run `npm run typecheck && npm test && npm run build`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF line endings, 2-space indentation, final newline, and trimmed trailing whitespace except in Markdown. Keep code in ES modules. Use descriptive kebab-case file names for modules such as `channel-workspace.ts` and `jsonl-parser.ts`; tests should end in `.test.ts`. Keep adapter-specific behavior inside `src/adapters/*` and executor-specific behavior inside `src/executors/*`; shared runtime logic belongs in `src/core/`.

## Testing Guidelines

Vitest is the test framework. Add focused tests near the relevant domain folder, matching existing names such as `dispatcher.test.ts` or `message-parser.test.ts`. Cover permission checks, adapter parsing/normalization, executor parsing, and config behavior when changing those areas. Run `npm test` before submitting; run `npm run typecheck` when changing exported types or contracts.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Add DingTalk Codex milestone spec` and `Document project inspirations`. Keep commits focused and prefer docs-only commits for documentation changes. Pull requests should include a clear problem statement, a summary of the change, test results, and linked issues when applicable. Include CLI output or screenshots only when behavior is user-visible.

## Security & Configuration Tips

Do not commit `.env`, secrets, tokens, chat exports, or private workspace data. Use `examples/groupmate.config.example.json` or `.toml` as templates. Preserve requester-scoped permissions: dangerous actions should require explicit confirmation and full chat history should not be sent to executors by default.
