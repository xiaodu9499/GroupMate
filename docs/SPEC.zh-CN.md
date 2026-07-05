# GroupMate 项目规划 Spec

## 1. 项目定位

GroupMate 是一个 local-first 的企业群聊 Agent Runtime。

它把钉钉、飞书、企业微信等企业 IM 群聊，连接到本地 Coding Agent 执行器，例如 Codex CLI、Claude Code CLI、Cursor CLI。项目目标不是做一个普通聊天机器人，而是把群聊变成一个具备长期上下文、权限边界和可审计执行能力的 Channel Workspace。

核心定位：

```text
企业群聊上下文管理层
+
本地 Agent 执行调度层
+
权限、安全、审计治理层
```

## 2. 设计原则

### 2.1 人是群聊主角

GroupMate 不应该替代人类讨论。默认情况下，群里仍然是人和人协作，Agent 只在被 @、收到明确命令、或命中配置化触发器时介入。

### 2.2 群聊是长期上下文，执行是短生命周期任务

```text
Channel Workspace：长期存在，属于群聊
Task Run：短生命周期，属于一次请求
Executor Session：短生命周期，必要时按 Task Run 恢复
```

不建议把一个群永久绑定到一个 Codex / Claude Code 会话。长期记忆应该由 GroupMate 的 Channel Workspace 维护，执行器只处理边界清晰的任务。

### 2.3 权限属于当前请求人

群聊可以共享记忆，但执行权限必须每次按当前请求人重新计算。

```text
群记忆：openConversationId / chatId / roomId
执行权限：当前 @ Agent 的用户
```

不能因为某个群里有 owner，就让群里所有成员都继承写权限。

### 2.4 Adapter 和 Executor 均可插拔

消息来源和执行器都必须抽象：

```text
Source Adapter:
  DingTalk CLI
  Feishu CLI
  WeCom CLI
  DingTalk Stream / Webhook
  Feishu Bot Event / Webhook
  WeCom Callback

Executor Adapter:
  Codex CLI
  Claude Code CLI
  Cursor CLI
```

核心 Runtime 不依赖具体平台，也不依赖具体执行器。

### 2.5 默认安全、显式放权

默认模式应是 ask / read-only。写操作、高危操作、外部副作用都需要明确权限和必要时二次确认。

## 3. 目标用户和场景

### 3.1 目标用户

- 企业内部研发团队
- 运维 / SRE 团队
- 项目管理和运营团队
- 希望把 Codex / Claude Code / Cursor 接入企业群聊的技术团队
- 希望 local-first、可审计、可控执行的团队

### 3.2 典型场景

#### 研发协作

群里讨论 bug、需求、日志和上下文，最后 @ Agent：

```text
@groupmate 帮我根据上面的讨论定位一下问题，必要时看下代码
```

Agent 读取群上下文、项目记忆和本地仓库，以只读或写权限执行任务。

#### 运维排障

群里多人讨论告警、日志和影响范围，@ Agent 后：

- 总结当前故障事实；
- 找出缺失信息；
- 查询项目文档或本地日志；
- 给出排查路径；
- 在授权后执行只读诊断命令。

#### 项目运营

群里讨论计划、延期、风险和负责人，Agent 被 @ 后：

- 整理决策；
- 提取行动项；
- 标记负责人和截止时间；
- 生成提醒或待办建议。

#### 受控修改

owner 或 writer @ Agent：

```text
@groupmate 按刚才方案修改配置，但不要发布
```

Agent 判断权限，调用 Codex / Claude Code / Cursor 执行，本地生成 diff，回传摘要和确认请求。

## 4. 总体架构

```text
┌────────────────────────────┐
│ Enterprise Chat Platforms  │
│ DingTalk / Feishu / WeCom  │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ Source Adapter Layer       │
│ CLI / Stream / Webhook     │
└──────────────┬─────────────┘
               │ SourceEvent
               ▼
┌────────────────────────────┐
│ Channel Workspace Layer    │
│ messages / memory / skills │
└──────────────┬─────────────┘
               │ ContextPacket
               ▼
┌────────────────────────────┐
│ Dispatcher Layer           │
│ trigger / auth / admission │
└──────────────┬─────────────┘
               │ TaskRunRequest
               ▼
┌────────────────────────────┐
│ Executor Adapter Layer     │
│ Codex / Claude / Cursor    │
└──────────────┬─────────────┘
               │ TaskRunResult
               ▼
┌────────────────────────────┐
│ Callback Layer             │
│ reply / card / receipt     │
└────────────────────────────┘
```

## 5. 核心模块规划

### 5.1 Source Adapter Layer

职责：

- 接收或轮询企业 IM 消息；
- 解析消息文本、发送人、群 ID、消息 ID、时间戳；
- 判断触发类型：mention / command / ambient；
- 统一转换为 `SourceEvent`；
- 提供回复能力。

第一阶段优先实现：

```text
dingtalk-cli
```

后续扩展：

```text
feishu-cli
wecom-cli
dingtalk-stream
feishu-webhook
wecom-callback
```

### 5.2 Channel Workspace Layer

职责：

- 为每个群维护长期工作空间；
- 保存群聊消息；
- 维护 `CHANNEL.md`；
- 维护 `MEMORY.md`；
- 管理 skills；
- 管理运行状态和 run artifacts；
- 提供最近消息和相关历史检索。

目录结构：

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

### 5.3 Context Builder

职责：

- 基于当前请求构造有边界的上下文包；
- 加载最近 N 条消息；
- 检索相关历史；
- 加载长期记忆；
- 加载相关 skill；
- 注入当前请求人和权限信息。

上下文包：

```text
current request
current requester
permission mode
recent channel messages
related historical messages
CHANNEL.md
MEMORY.md
relevant skills
executor instructions
```

### 5.4 Permission Engine

职责：

- 判断当前请求人身份；
- 根据群配置决定权限；
- 选择 sandbox；
- 判断是否需要二次确认；
- 拒绝不允许的任务。

权限模式：

```text
ask:
  只读答疑、总结、分析、计划

write:
  可执行受控本地修改

admin:
  可修改 Channel Workspace 配置和权限
```

高危动作：

- 删除文件；
- 重启服务；
- 修改生产配置；
- 权限变更；
- 广播通知；
- 发布上线；
- 审批提交；
- 大范围代码变更。

### 5.5 Dispatcher Layer

职责：

- 接收 `SourceEvent`；
- 写入消息库；
- 判断是否触发；
- 调用 Permission Engine；
- 调用 Context Builder；
- 创建 Task Run；
- 调用 Executor；
- 调用 Callback。

Dispatcher 是 Runtime 的中枢，但不应该包含平台细节和执行器细节。

### 5.6 Executor Adapter Layer

职责：

- 把 `TaskRunRequest` 转换为具体 CLI 调用；
- 管理超时；
- 解析输出；
- 保存执行日志；
- 返回标准 `TaskRunResult`；
- 支持 Task Run 级 resume。

第一阶段：

```text
codex-cli
```

后续：

```text
claude-code-cli
cursor-cli
```

### 5.7 Callback Layer

职责：

- 把结果回复回原群聊；
- 支持文本、Markdown、卡片；
- 支持 action receipt；
- 支持确认流程；
- 避免刷屏。

第一阶段只要求文本回复。

## 6. 数据模型草案

### 6.1 SourceEvent

```ts
type SourceEvent = {
  message: SourceMessage;
  trigger: "mention" | "command" | "ambient";
};
```

### 6.2 SourceMessage

```ts
type SourceMessage = {
  id: string;
  channel: ChannelRef;
  sender: ActorIdentity;
  text: string;
  mentions: string[];
  timestamp: string;
  raw?: unknown;
};
```

### 6.3 ChannelRef

```ts
type ChannelRef = {
  source: "dingtalk" | "feishu" | "wecom" | string;
  transport: "cli" | "stream" | "webhook" | "callback" | string;
  workspaceId: string;
  channelId: string;
};
```

### 6.4 PermissionDecision

```ts
type PermissionDecision = {
  mode: "ask" | "write" | "admin";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  reason: string;
};
```

### 6.5 TaskRun

```ts
type TaskRun = {
  id: string;
  channel: ChannelRef;
  requester: ActorIdentity;
  executor: string;
  permission: PermissionDecision;
  status: "pending" | "running" | "waiting_confirmation" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  sourceMessageId: string;
  result?: TaskRunResult;
};
```

## 7. 第一版 MVP 范围

### 7.1 必须实现

- TypeScript / Node.js 项目基础；
- DingTalk CLI Source Adapter；
- Codex CLI Executor；
- `SourceEvent` 标准化；
- Channel Workspace 创建；
- 最近群消息上下文；
- `CHANNEL.md` 和 `MEMORY.md` 读取；
- 基础权限判断；
- 只读和写入 sandbox 映射；
- 文本回复钉钉群；
- 本地 run log；
- README / 中文 README / 架构文档。

### 7.2 暂不实现

- 多租户云服务；
- Web UI；
- 所有企业 IM 的正式 Webhook；
- 完整卡片交互；
- 完整 semantic memory；
- 自动 skill 生成；
- 主动 ambient 发言。

## 8. 里程碑

### Milestone 0：项目骨架

状态：已完成初版。

- README / README.zh-CN；
- TypeScript scaffold；
- 核心类型；
- adapter / executor 抽象；
- Codex CLI executor 初版；
- 文档和开源治理文件。

### Milestone 1：DingTalk CLI 最小闭环

目标：

```text
钉钉群 @ Agent -> GroupMate -> Codex CLI -> 回复钉钉群
```

任务：

- 实现 `dingtalk-cli` 事件接入；
- 解析 dws 消息；
- 获取 group id / sender / message id；
- 读取最近群消息；
- 写入 Channel Workspace；
- 调用 Codex CLI；
- 回写回复。

### Milestone 2：权限和确认

目标：

```text
普通成员 ask-only
owner / writer 可执行受控写任务
危险动作需要确认
```

任务：

- `tools.toml` 权限配置；
- requester identity 匹配；
- 高危动作识别；
- action receipt；
- 确认后 resume Task Run。

### Milestone 3：消息库和记忆

目标：

```text
群消息长期保存，可检索，可整理成 MEMORY.md
```

任务：

- SQLite 或 NDJSON message store；
- 最近 N 条窗口；
- 全文搜索；
- 记忆整理流程；
- MEMORY.md 更新策略。

### Milestone 4：多平台和多执行器

目标：

```text
Source Adapter 和 Executor Adapter 真正可插拔
```

任务：

- Feishu CLI；
- WeCom CLI；
- Claude Code CLI；
- Cursor CLI；
- executor capability 描述。

### Milestone 5：Ambient Teammate

目标：

```text
Agent 可以克制地发现未处理问题、行动项和风险
```

任务：

- heartbeat；
- 未回复问题检测；
- 行动项跟踪；
- 风险摘要；
- 默认 silent 策略。

## 9. 安全设计

### 9.1 Prompt Injection 防护

群聊历史是不可信输入。Agent 不应盲目执行群历史里的指令。

策略：

- 当前请求和历史消息分区；
- 明确标注历史消息仅作上下文；
- 高危动作需要当前请求明确确认；
- 权限由当前请求人决定。

### 9.2 Secret 防泄漏

策略：

- 默认不把本地敏感文件发回群；
- raw logs 不直接回复；
- run artifacts 本地保存；
- 输出前做敏感信息过滤。

### 9.3 执行隔离

策略：

- 默认 read-only；
- writer 才能 workspace-write；
- danger-full-access 需要显式配置；
- executor session 不跨 requester 继承高权限。

## 10. 配置规划

示例：

```toml
[workspace]
data_dir = "data"

[source]
type = "dingtalk-cli"
command = "dws.cmd"

[executor]
type = "codex-cli"
command = "codex.cmd"
default_sandbox = "read-only"

[permissions]
owners = ["sender_open_id_1"]
writers = ["sender_open_id_2"]
default_mode = "ask"

[execution]
ask_sandbox = "read-only"
write_sandbox = "workspace-write"
dangerous_actions_require_confirmation = true
```

## 11. 技术选型

### 11.1 语言

TypeScript / Node.js 20+

原因：

- 跨平台；
- 适合调用 CLI；
- 适合企业 IM adapter；
- 开源贡献门槛较低；
- 类型系统足够支撑插件边界。

### 11.2 存储

初期：

```text
NDJSON + Markdown
```

中期：

```text
SQLite + FTS
```

长期：

```text
SQLite + FTS + optional vector recall
```

### 11.3 配置格式

TOML。

理由：

- 适合权限和工具配置；
- 比 JSON 更适合人工编辑；
- 比 YAML 更少歧义。

## 12. 开源策略

许可证：

```text
MIT
```

策略：

- 允许商业使用；
- 允许二次开发；
- 要求保留版权和许可证；
- NOTICE 中标注原项目来源；
- README 中明确灵感来源和独立项目边界。

## 13. 风险和开放问题

### 13.1 企业 IM CLI 能力差异

不同平台 CLI 可能无法提供完整事件字段，需要 adapter 支持事件重建。

### 13.2 钉钉 dws custom channel 元数据不足

如果 dws 只传消息文本，GroupMate 需要通过 message list 反查 sender / group / msgId。

### 13.3 执行器输出格式不统一

Codex CLI、Claude Code CLI、Cursor CLI 的输出格式不同，需要标准化 `TaskRunResult`。

### 13.4 权限和上下文污染

同一个群里有多人，不能让高权限请求污染后续普通成员请求。

### 13.5 主动发言噪音

Ambient 功能必须默认克制，宁可少说，不要打扰群聊。

## 14. 下一步建议

最优先的实现路径：

1. 完成 DingTalk CLI adapter 的事件标准化；
2. 完成本地 message store；
3. 实现最近群消息上下文；
4. 实现 Codex CLI 调用和结果解析；
5. 实现基础权限策略；
6. 做一次真实钉钉群端到端测试；
7. 再抽象 Feishu / WeCom 和 Claude Code / Cursor。

第一条完整闭环比同时铺开多个平台更重要。
