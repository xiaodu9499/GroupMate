# Milestone 2 Progress：Production DingTalk + Codex

## 总体状态

- 状态：Todo
- 目标：生产级 DingTalk + Codex 企业群聊接入
- 规划负责人：Codex
- 实现负责人：Cursor
- 最终验收：Codex
- 创建日期：2026-07-05

## 任务看板

| ID | 任务 | 状态 | 实现提交/PR | 验证 |
|---|---|---|---|---|
| T1 | SQLite schema / migrations | Todo | - | - |
| T2 | MessageStore / RunLedger | Todo | - | - |
| T3 | ChannelWorkspace 与 SQLite 解耦 | Todo | - | - |
| T4 | ContextBuilder | Todo | - | - |
| T5 | DingTalk sync | Todo | - | - |
| T6 | dingtalk-custom 事件重建增强 | Todo | - | - |
| T7 | Permission policy | Todo | - | - |
| T8 | Dangerous action detection / waiting_confirmation | Todo | - | - |
| T9 | Codex executor error taxonomy | Todo | - | - |
| T10 | Structured logger | Todo | - | - |
| T11 | CLI 查询与诊断命令 | Todo | - | - |
| T12 | 文档与运行手册 | Todo | - | - |
| T13 | 真实 DingTalk 端到端验收 | Todo | - | - |

## 验收记录

| 检查项 | 状态 | 备注 |
|---|---|---|
| `npm run typecheck` | Todo | - |
| `npm run build` | Todo | - |
| `npm test` | Todo | - |
| `node dist/cli.js doctor` | Todo | - |
| `node dist/cli.js db status` | Todo | - |
| `node dist/cli.js simulate ...` | Todo | - |
| `node dist/cli.js dingtalk-sync ...` | Todo | - |
| `node dist/cli.js messages recent ...` | Todo | - |
| `node dist/cli.js messages search ...` | Todo | - |
| `node dist/cli.js runs list` | Todo | - |
| `node dist/cli.js codex-smoke "只回复 ok"` | Todo | - |
| `node dist/cli.js dingtalk-custom ...` | Todo | - |
| `dws dev connect` 真实群测试 | Todo | - |

## 风险

- SQLite native dependency 在 Windows 上安装失败。
- DWS CLI 在不同版本中的参数或输出结构不一致。
- `dws dev connect --channel custom` 只传文本，事件重建仍可能匹配不到当前消息。
- Codex CLI 超时或网络代理不稳定。
- 危险动作只靠规则识别会有漏判，需要保持默认保守。

## 决策记录

- 长期群消息存储使用 SQLite。
- Channel Workspace 继续负责 Markdown 文件，SQLite 负责结构化消息和 run ledger。
- Codex session 不绑定整个群，只绑定单次 Task Run 或确认后的 Task Run。
- 默认权限保持 ask/read-only。
- 高危动作第一阶段进入 waiting_confirmation，不直接执行。

## 变更记录

- 2026-07-05：创建 Milestone 2 进度文件。
