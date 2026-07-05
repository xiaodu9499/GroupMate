# GroupMate

GroupMate 是一个 local-first 的企业群聊 Agent Runtime。

它把钉钉、飞书、企业微信等企业 IM 的群聊，通过 CLI 或官方 Bot API，连接到本地执行器，例如 Codex CLI、Claude Code CLI、Cursor CLI。GroupMate 会把每个群聊维护成一个独立的 Channel Workspace，理解群里的持续讨论，并在被明确需要时触发 Agent 执行任务。

> 把钉钉、飞书、企业微信群变成具备上下文理解能力的 Agent 工作空间，而不是把群聊变成机器人聊天室。

## 它是什么

GroupMate 不是传统聊天机器人。

它是企业群聊和本地 Agent 执行器之间的桥梁。人仍然在人和人的群聊里讨论工作；GroupMate 负责记录群上下文、维护长期记忆，并在有人 @ Agent 时，基于当前群上下文、当前请求人权限和任务类型，创建一次受控的 Task Run。

Agent 可以：

- 基于最近群聊讨论回答问题；
- 总结决策、风险和行动项；
- 搜索群聊历史和项目知识；
- 检查本地仓库或文档；
- 调用 Codex CLI、Claude Code CLI、Cursor CLI 做受控执行；
- 在高风险动作前请求确认。

## 为什么做 GroupMate

大多数聊天机器人把每条消息当成一次孤立 prompt，但真实工作不是这样发生的。

在项目群里，人们会先讨论事故、需求、日志、负责人、截止时间和限制条件，最后才有人 @ 机器人说“你来看看”。GroupMate 面向的就是这种场景：

- 人仍然是群聊主角；
- Agent 安静地维护群上下文；
- Agent 只在被 @ 或命中配置触发器时介入；
- 每次任务只注入有边界的上下文包，而不是把全量群聊塞给模型；
- 执行权限由“当前请求人”决定，而不是由群聊本身决定。

## 核心思想

```text
企业群聊
  -> Channel Workspace
  -> 消息存储
  -> 群长期记忆
  -> 触发与权限引擎
  -> 可插拔执行器
  -> 回复原群聊
```

GroupMate 把两个经常被混在一起的概念分开：

```text
长期上下文属于群聊。
执行权限属于当前请求人。
```

也就是说，一个钉钉群、飞书群或企业微信群可以有共享的 Agent 记忆，但每次执行请求都要重新按当前请求人的身份做权限判断。

## 接入策略

GroupMate 第一阶段优先支持 CLI 型接入，后续再支持官方 Bot API。

CLI 适合 local-first 工作流，因为它可以复用已有平台登录、组织选择和本地调试流程。正式生产部署时，可以继续补充 Stream、Webhook 或 Callback 适配器。

```text
第一阶段：企业 IM CLI Adapter
第二阶段：官方 Bot Stream / Webhook / Callback Adapter
```

## 计划支持的 Adapter

消息来源 Adapter：

- 钉钉，通过 dws CLI
- 飞书 / Lark，通过 CLI
- 企业微信 / WeCom，通过 CLI
- 钉钉 Stream / Webhook
- 飞书 Bot Event / Webhook
- 企业微信 Callback

第一版优先支持：钉钉 CLI。

执行器 Adapter：

- Codex CLI
- Claude Code CLI
- Cursor CLI

第一版优先支持：Codex CLI。

## 架构

```text
+--------------------+
| DingTalk / Feishu  |
| WeCom / others     |
+---------+----------+
          |
          v
+--------------------+
| Source Adapter     |
| 事件标准化          |
+---------+----------+
          |
          v
+--------------------+
| Channel Workspace  |
| 消息、记忆、技能     |
+---------+----------+
          |
          v
+--------------------+
| Dispatcher         |
| 触发、权限、准入     |
+---------+----------+
          |
          v
+--------------------+
| Executor Adapter   |
| Codex / Claude /   |
| Cursor             |
+---------+----------+
          |
          v
+--------------------+
| Callback Adapter   |
| 回复、卡片、回执     |
+--------------------+
```

## Channel Workspace

每个群聊都会映射到一个本地工作空间：

```text
data/channels/<source>/<channel_id>/
  CHANNEL.md
  MEMORY.md
  tools.toml
  state.json
  skills/
  runs/
```

`CHANNEL.md` 描述这个群：

- 项目背景；
- 团队职责；
- 回复风格；
- 运维规则；
- 关联仓库和服务。

`MEMORY.md` 存储经过整理的长期记忆：

- 项目事实；
- 历史决策；
- 负责人；
- 常见事故；
- 团队偏好；
- 已知限制。

完整群聊历史会单独存储，并在需要时检索。Agent 不会把所有历史消息无脑塞进模型上下文。

## 上下文策略

每次触发任务时，GroupMate 会构造一个有边界的上下文包：

```text
当前请求
当前请求人身份
权限模式
最近群聊消息
相关历史消息
CHANNEL.md
MEMORY.md
相关 skills
执行器指令
```

这样即使群聊很活跃，Agent 也能保持有用、克制，并避免上下文噪音和权限污染。

## 权限模型

GroupMate 使用 requester-scoped permissions，也就是按“当前请求人”决定权限。

示例策略：

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

建议行为：

- 普通成员可以提问、总结、请求只读分析；
- writers 可以执行经过授权的本地 Agent 任务；
- owners 可以配置 Channel Workspace；
- 危险动作必须显式确认。

## Task Run

执行器默认是短生命周期的。

```text
Channel Workspace：长期存在，属于群聊
Task Run：短生命周期，属于一次任务
Executor Session：短生命周期，必要时按任务恢复
```

这避免了把整个群聊绑定到一个永久 Coding Agent 会话。一个任务在需要确认或后续补充时可以恢复执行器会话，但群聊本身才是长期上下文来源。

## 示例

在一个钉钉项目群里：

```text
Alice: 这次部署在配置变更后又失败了。
Bob: 我在 payment worker 日志里看到 timeout。
Charlie: 可能和昨天改的重试策略有关。
Alice: @agent 帮忙看下可能原因和下一步建议。
```

GroupMate 可以：

1. 读取最近群聊讨论；
2. 识别当前请求人；
3. 加载项目记忆和相关历史；
4. 以只读模式运行 Codex CLI；
5. 回复排查结论和建议动作；
6. 在需要修改前请求确认。

## 目标

- 把每个群聊视为一个共享 Channel Workspace。
- 让人始终是群聊中心。
- Agent 只在真正有用时介入。
- 第一版优先支持 local-first CLI 接入。
- 后续支持官方企业 IM Bot API。
- 支持多个本地 Coding Agent 执行器。
- 权限明确、可审计。
- Task Run 可复盘、可回放。

## 非目标

- 替代人类在群里的讨论。
- 把每条群消息都发给 LLM。
- 给群里所有人写权限。
- 把一个群永久绑定到一个 Coding Agent 会话。
- 用不透明云服务隐藏本地执行过程。

## 路线图

### Phase 1：钉钉 + Codex CLI

- 钉钉 Source Adapter
- 钉钉群消息接入
- @ 触发
- Channel Workspace 创建
- 最近消息上下文
- `CHANNEL.md` 和 `MEMORY.md`
- 请求人权限识别
- Codex CLI Executor
- 文本回复钉钉群
- 本地 run 日志

### Phase 2：记忆与治理

- SQLite 消息存储
- 群聊全文搜索
- 记忆整理
- Action receipt
- 确认流程
- 危险动作识别
- 群级工具策略

### Phase 3：更多平台和执行器

- 飞书 / Lark Adapter
- 企业微信 Adapter
- Claude Code CLI Executor
- Cursor CLI Executor
- 按 Task Run 恢复执行器会话

### Phase 4：Ambient Teammate

- 可选的群聊 heartbeat
- 未回复问题检测
- 行动项追踪
- 截止时间提醒
- 风险和阻塞摘要

## 灵感来源

GroupMate 受到以下设计启发：

- Claude Tag 风格的频道级 Agent，特别是 [open-claude-tag](https://github.com/Anil-matcha/open-claude-tag) 中的群 / 频道记忆模型；
- OpenTag 风格的本地执行器调度，特别是 [amplifthq/opentag](https://github.com/amplifthq/opentag) 中 adapter / dispatcher / runner 的分层设计；
- [CopilotKit/OpenTag](https://github.com/CopilotKit/OpenTag) 中多平台 bot 和确认流程的设计思路；
- 企业工作群里已经存在的大量真实上下文。

GroupMate 是独立项目。以上链接仅作为设计参考，不代表从属关系、官方背书或兼容性承诺。

## License

MIT
