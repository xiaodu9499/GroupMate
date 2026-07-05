# Milestone 2 Progress：Production DingTalk + Codex

## 总体状态

- 状态：Accepted for Milestone 2 local/CLI scope (pending live `dws dev connect` group test)
- 目标：生产级 DingTalk + Codex 企业群聊接入
- 规划负责人：Codex
- 实现负责人：Cursor
- 最终验收：Codex
- 创建日期：2026-07-05

## 任务看板

| ID | 任务 | 状态 | 实现提交/PR | 验证 |
|---|---|---|---|---|
| T1 | SQLite schema / migrations | Done | local | npm test storage |
| T2 | MessageStore / RunLedger | Done | local | npm test storage |
| T3 | ChannelWorkspace 与 SQLite 解耦 | Done | local | channel-workspace + dispatcher tests |
| T4 | ContextBuilder | Done | local | context-builder.test.ts |
| T5 | DingTalk sync | Done | local | sync-idempotency.test.ts |
| T6 | dingtalk-custom 事件重建增强 | Done | local | event-reconstruction.test.ts |
| T7 | Permission policy | Done | local | channel-policy.test.ts |
| T8 | Dangerous action detection / waiting_confirmation | Done | local | dangerous-action.test.ts |
| T9 | Codex executor error taxonomy | Done | local | executor-errors.test.ts |
| T10 | Structured logger | Done | local | logger.test.ts |
| T11 | CLI 查询与诊断命令 | Done | local | cli build + manual |
| T12 | 文档与运行手册 | Done | local | RUNBOOK-DINGTALK-CODEX.zh-CN.md |
| T13 | 真实 DingTalk 端到端验收 | Partial | local | 已验证 DWS 拉群消息；待真实 `dws dev connect` 群内触发 |

## 验收记录

| 检查项 | 状态 | 备注 |
|---|---|---|
| `npm run typecheck` | Done | 通过 |
| `npm run build` | Done | 通过 |
| `npm test` | Done | 18 files / 50 tests |
| `node dist/cli.js doctor` | Done | 本机命令与 SQLite 检查通过；未配置 group id 时预期返回 fail |
| `node dist/cli.js db status` | Done | schemaVersion=1, ftsAvailable=true |
| `node dist/cli.js simulate ...` | Done | mock executor 闭环通过 |
| `node dist/cli.js dingtalk-sync ...` | Done | 使用真实群 `cidEPmfMLnOXha6B587HmVxQA==` 拉取并入库 2 条消息 |
| `node dist/cli.js messages recent ...` | Done | 可查询真实同步消息 |
| `node dist/cli.js messages search ...` | Done | 可查询消息 |
| `node dist/cli.js runs list` | Done | 可列出 run |
| `node dist/cli.js runs show <runId>` | Done | 可查看 run 与事件 |
| `node dist/cli.js codex-smoke "只回复 ok"` | Done | 返回 `ok` |
| `node dist/cli.js dingtalk-custom ...` | Done | mock executor 单行输出，无重复回复 |
| `dws dev connect` 真实群测试 | Todo | manual |

## 风险

- Windows 上 `better-sqlite3` 编译失败，已退回 `sqlite3`。
- DWS CLI 在不同版本中的参数或输出结构不一致。
- `dws dev connect --channel custom` 只传文本，事件重建仍可能匹配不到当前消息。
- Codex CLI 超时或网络代理不稳定。
- 危险动作只靠规则识别会有漏判，需要保持默认保守。

## 决策记录

- 长期群消息存储使用 SQLite（依赖 `sqlite3`，接口稳定可换 backend）。
- Channel Workspace 继续负责 Markdown 文件，SQLite 负责结构化消息和 run ledger。
- Codex session 不绑定整个群，只绑定单次 Task Run 或确认后的 Task Run。
- 默认权限保持 ask/read-only。
- 高危动作第一阶段进入 waiting_confirmation，不直接执行。

## 变更记录

- 2026-07-05：创建 Milestone 2 进度文件。
- 2026-07-05：Cursor 完成 T1–T12 代码与测试实现。
- 2026-07-05：Codex 最终验收并修复确认执行链路，确认后执行原始危险请求而不是确认文本。
- 2026-07-05：Codex 修复 `dingtalk-custom` 重复 stdout 输出风险。
