# Milestone 1 Spec：DingTalk CLI + Codex CLI 最小闭环

## 1. 目标

实现 GroupMate 的第一条完整闭环：

```text
钉钉群 @ Agent
  -> DingTalk CLI Adapter 标准化事件
  -> Channel Workspace 保存消息和上下文
  -> Dispatcher 判断权限和构造任务
  -> Codex CLI Executor 执行
  -> 回复钉钉群
```

第一版目标不是完整生产系统，而是跑通真实钉钉群里的本地闭环，并保留后续扩展飞书、企业微信、Claude Code CLI、Cursor CLI 的抽象边界。

## 2. 当前状态

仓库已有：

- TypeScript / Node.js 项目骨架；
- `SourceEvent`、`SourceMessage`、`ChannelRef` 等核心类型；
- `SourceAdapter` 抽象；
- `ExecutorAdapter` 抽象；
- `Dispatcher` 初版；
- `ChannelWorkspace` 初版；
- `CodexCliExecutor` 初版；
- `DingTalkCliAdapter` 占位实现；
- CLI scaffold：`groupmate help`、`groupmate version`、`groupmate codex-smoke`。

当前缺口：

- DingTalk CLI Adapter 还没有真实接入 `dws`；
- ChannelWorkspace 还没有真正读取最近消息；
- Dispatcher 还没有落盘消息、回调回复、run log；
- 权限策略还是硬编码默认 ask；
- 缺少配置加载；
- 缺少端到端本地模拟命令；
- 缺少单元测试。

## 3. 非目标

Milestone 1 暂不实现：

- 飞书 / 企业微信；
- 官方 DingTalk Stream / Webhook；
- 卡片确认；
- SQLite；
- semantic memory；
- 自动 skill 生成；
- ambient heartbeat；
- Web UI；
- 多租户服务。

这些能力要为后续保留接口，但不要在第一条闭环里展开。

## 4. 约束和前提

### 4.1 技术约束

- 语言：TypeScript；
- Node.js：20+；
- 运行平台：Windows / macOS / Linux；
- 第一版存储：Markdown + NDJSON；
- 第一版配置：TOML 或 JSON 均可，但推荐先用 JSON 避免新增解析依赖；如果引入 TOML 解析库，需要说明理由；
- 不要让 core 依赖 DingTalk 细节；
- 不要让 core 依赖 Codex 细节。

### 4.2 本地工具前提

开发 / 测试环境需要：

```text
dws.cmd
codex.cmd
```

其中：

- `dws.cmd` 用于读取钉钉群消息和本地 dev connect；
- `codex.cmd` 用于执行本地 agent task。

### 4.3 安全约束

- 默认权限必须是 `ask` / `read-only`；
- `danger-full-access` 不允许作为默认值；
- 当前请求人的权限必须每次重新计算；
- 群聊历史只能作为上下文，不能作为指令源；
- 高危动作第一版只允许给出方案，不执行。

## 5. 推荐目录结构

在现有结构上扩展：

```text
src/
  adapters/
    dingtalk-cli/
      index.ts
      dws-client.ts
      event-normalizer.ts
      message-parser.ts
  core/
    channel-workspace.ts
    config.ts
    dispatcher.ts
    permissions.ts
    run-store.ts
    types.ts
  executors/
    codex-cli/
      index.ts
      jsonl-parser.ts
  cli.ts
tests/
  adapters/
    dingtalk-cli/
  core/
  executors/
docs/
  MILESTONE-1-DINGTALK-CODEX.zh-CN.md
```

不要求一次性完全按这个结构拆，但 Cursor 实现时应尽量保持模块边界清楚。

## 6. 数据和接口设计

### 6.1 配置

新增配置模型：

```ts
type GroupMateConfig = {
  workspace: {
    dataDir: string;
  };
  source: {
    type: "dingtalk-cli";
    command: string;
    groupId?: string;
    botName?: string;
    fetchLimit: number;
    historyLimit: number;
    lookbackMinutes: number;
  };
  executor: {
    type: "codex-cli";
    command: string;
    timeoutMs: number;
  };
  permissions: {
    owners: string[];
    writers: string[];
    defaultMode: "ask";
  };
  execution: {
    askSandbox: "read-only";
    writeSandbox: "workspace-write" | "danger-full-access";
    dangerousActionsRequireConfirmation: boolean;
  };
};
```

配置加载优先级：

```text
CLI 参数 > 环境变量 > 配置文件 > 默认值
```

Milestone 1 可以先支持：

- `--config <path>`；
- 环境变量；
- 默认值。

建议环境变量：

```text
GROUPMATE_DATA_DIR
GROUPMATE_DWS_COMMAND
GROUPMATE_DINGTALK_GROUP_ID
GROUPMATE_DINGTALK_BOT_NAME
GROUPMATE_CODEX_COMMAND
GROUPMATE_CODEX_TIMEOUT_MS
GROUPMATE_OWNER_IDS
GROUPMATE_WRITER_IDS
```

### 6.2 DingTalk 消息标准化

DingTalk CLI Adapter 应输出标准 `SourceMessage`。

DWS 原始消息常见字段：

```json
{
  "content": "@ducf_agent 开始查 告诉我结果",
  "createTime": "2026-07-04 23:45:39",
  "openConversationId": "cid...",
  "openMessageId": "msg...",
  "sender": "杜超凡",
  "senderOpenDingTalkId": "DSn..."
}
```

应标准化为：

```ts
{
  id: openMessageId,
  channel: {
    source: "dingtalk",
    transport: "cli",
    workspaceId: corpIdOrDefault,
    channelId: openConversationId
  },
  sender: {
    id: senderOpenDingTalkId || sender,
    name: sender,
    raw
  },
  text: content,
  mentions: [...],
  timestamp: createTime,
  raw
}
```

### 6.3 当前事件重建

现实问题：`dws dev connect --channel custom` 可能只把消息文本传给子进程，缺少 `sender / group / msgId`。

Milestone 1 允许采用“重建事件”策略：

1. 从 CLI 参数拿到当前消息文本；
2. 用配置里的 `groupId` 调 `dws chat message list`；
3. 拉取最近消息；
4. 在最近消息中匹配当前文本；
5. 找到最近一条非 bot 发送、文本包含当前消息的消息；
6. 将它作为当前 `SourceEvent`；
7. 如果找不到，则生成 fallback event：
   - `message.id = local timestamp`
   - `sender.id = unknown`
   - 权限强制 ask / read-only。

匹配规则：

```text
normalize(dwsMessage.content) 包含 normalize(currentArgText)
或 normalize(currentArgText) 包含 normalize(dwsMessage.content)
```

normalize 应：

- 去掉 @xxx；
- 去掉多余空白；
- trim；
- 小写化。

### 6.4 Channel Workspace

Milestone 1 中，Channel Workspace 必须支持：

- 创建频道目录；
- 创建默认 `CHANNEL.md`；
- 创建默认 `MEMORY.md`；
- 追加消息到 `messages.ndjson`；
- 读取最近 N 条消息；
- 过滤 bot 自己的消息；
- 构造 `ChannelContext`。

目录：

```text
data/channels/dingtalk/<base64url(channelId)>/
  CHANNEL.md
  MEMORY.md
  messages.ndjson
  runs/
```

`messages.ndjson` 每行一条标准 `SourceMessage` JSON。

注意：

- 写入消息要尽量幂等，避免同一 `message.id` 重复写入；
- Milestone 1 可以用简单文件读写实现去重；
- 后续再替换 SQLite。

### 6.5 Permission Engine

新增 `permissions.ts`。

第一版规则：

```text
actor.id in owners -> admin / writeSandbox
actor.id in writers -> write / writeSandbox
actor.name in owners -> admin / writeSandbox
actor.name in writers -> write / writeSandbox
otherwise -> ask / askSandbox
unknown actor -> ask / askSandbox
```

建议返回：

```ts
type PermissionDecision = {
  mode: "ask" | "write" | "admin";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  reason: string;
};
```

Milestone 1 中，即使 owner/admin，请求涉及高危动作也不要直接执行，先在 prompt 中要求给出方案和确认问题。

### 6.6 Codex CLI Executor

现有 `CodexCliExecutor` 需要补强：

- 支持自定义 command；
- 支持 timeout；
- 支持 cwd；
- 支持 proxy env 透传；
- 支持解析 `thread.started` 中的 `thread_id`；
- 支持解析最后一条 `agent_message`；
- 返回 stderr / code / timedOut 到 raw；
- 不把 raw 日志直接回复群。

调用命令：

```text
codex.cmd exec --json --ignore-rules -s <sandbox> --skip-git-repo-check -
```

注意：

- 不要默认 `danger-full-access`；
- Milestone 1 不要求 `resume`；
- 如果后续有确认流程，再按 Task Run 保存 thread id。

### 6.7 Dispatcher

Dispatcher 第一版应完成：

1. 接收 `SourceEvent`；
2. 保存当前消息到 Channel Workspace；
3. 构造 ChannelContext；
4. 计算 PermissionDecision；
5. 调用 Executor；
6. 保存 run log；
7. 调用 SourceAdapter.reply。

run log 建议路径：

```text
data/channels/dingtalk/<channel>/runs/<runId>.json
```

run log 内容：

```ts
{
  id: string;
  sourceMessageId: string;
  requester: ActorIdentity;
  permission: PermissionDecision;
  executor: string;
  status: "completed" | "failed";
  startedAt: string;
  endedAt: string;
  resultText: string;
  rawSummary?: unknown;
}
```

不要保存敏感完整 stdout，至少第一版不要默认保存。

## 7. CLI 命令设计

### 7.1 保留已有命令

```bash
groupmate help
groupmate version
groupmate codex-smoke [prompt]
```

### 7.2 新增本地模拟命令

用于 Cursor 自测，不依赖真实钉钉：

```bash
groupmate simulate --text "帮我总结上面的问题"
```

可选参数：

```bash
groupmate simulate \
  --source dingtalk \
  --channel cid-test \
  --sender user-1 \
  --sender-name "Alice" \
  --text "帮我总结上面的问题"
```

验收：

- 会创建 channel workspace；
- 会写入 messages.ndjson；
- 会调用 Codex CLI 或 mock executor；
- 会输出最终回复。

### 7.3 新增 DingTalk one-shot 命令

用于 `dws dev connect --channel custom` 调用：

```bash
groupmate dingtalk-custom "用户消息文本"
```

行为：

1. 使用 `GROUPMATE_DINGTALK_GROUP_ID`；
2. 读取最近群消息；
3. 重建当前事件；
4. 运行 Dispatcher；
5. stdout 只输出最终回复文本。

这个命令很重要，因为 dws custom 通常要求子进程 stdout 就是机器人回复。

### 7.4 新增配置检查命令

```bash
groupmate doctor
```

Milestone 1 至少检查：

- Node version；
- dws command 是否存在；
- codex command 是否存在；
- data dir 是否可写；
- group id 是否配置。

## 8. Cursor 实现任务清单

### Task 1：配置加载

目标：

- 新增 `src/core/config.ts`；
- 支持默认配置；
- 支持环境变量覆盖；
- 支持 `--config` 文件覆盖，文件格式可先用 JSON；
- 导出 `loadConfig()`.

验收：

```bash
npm run typecheck
npm run build
```

测试建议：

- 默认值测试；
- 环境变量覆盖测试；
- 配置文件覆盖测试。

### Task 2：DWS Client

目标：

- 新增 `src/adapters/dingtalk-cli/dws-client.ts`；
- 封装 `dws chat message list`；
- 输入：groupId、time、limit、forward；
- 输出：原始 JSON 和标准化 rows；
- 支持 timeout；
- 支持 command 自定义。

验收：

- 单元测试用 fixture，不依赖真实 dws；
- 真实环境可通过 doctor 或手动命令验证。

### Task 3：DingTalk 消息解析和标准化

目标：

- 新增 `message-parser.ts` / `event-normalizer.ts`；
- 实现 `normalizeDingTalkMessage(row): SourceMessage`；
- 实现 `findCurrentMessage(rows, currentText, botName)`；
- 过滤 bot 自己的消息。

验收：

- 用 fixture 测试 sender、openConversationId、openMessageId、content；
- 测试 @ 文本匹配；
- 测试找不到时 fallback。

### Task 4：ChannelWorkspace 补强

目标：

- 实现消息追加；
- 实现按 id 去重；
- 实现读取最近 N 条；
- 实现 channel dir safe encode；
- 创建 `runs/` 目录；
- 保持 `CHANNEL.md`、`MEMORY.md` 自动创建。

验收：

- 写入同一 message 两次不会重复；
- 最近消息按时间排序；
- typecheck/build 通过。

### Task 5：Permission Engine

目标：

- 新增 `src/core/permissions.ts`；
- 实现 owners / writers / default ask；
- 支持按 actor.id 和 actor.name 匹配；
- 输出 `PermissionDecision`。

验收：

- owner -> admin；
- writer -> write；
- unknown -> ask；
- unknown actor -> ask。

### Task 6：CodexCliExecutor 补强

目标：

- 抽出 JSONL parser 到 `jsonl-parser.ts`；
- 解析 `thread_id`；
- 解析最后 agent_message；
- 支持 command、timeout、cwd；
- 返回结构化 raw summary；
- timeout 时返回友好错误。

验收：

- parser fixture 测试；
- `groupmate codex-smoke "只回复 ok"` 可运行；
- 不把 stderr 直接作为群回复。

### Task 7：Dispatcher 完整闭环

目标：

- Dispatcher 注入 workspace、permission engine、executor；
- dispatch 时保存消息；
- build context；
- 执行 executor；
- 保存 run log；
- 返回 TaskRunResult。

验收：

- simulate 命令可走完整 dispatch；
- run log 生成；
- typecheck/build 通过。

### Task 8：CLI 命令

目标：

实现：

```bash
groupmate doctor
groupmate simulate --text ...
groupmate dingtalk-custom "..."
```

验收：

- `groupmate doctor` 输出检查结果；
- `groupmate simulate --text "hello"` 能创建 data；
- `groupmate dingtalk-custom "..."` stdout 只输出最终回复。

### Task 9：DingTalkCliAdapter

目标：

- `DingTalkCliAdapter` 实现 one-shot event reconstruction；
- 通过 dws 读取群消息；
- 找到当前消息；
- 标准化 SourceEvent；
- reply 在 custom 模式下可简单 `process.stdout.write`，但建议保持 callback 抽象。

验收：

- mock dws fixture 测试；
- 真实 dws 环境下能读取群消息；
- 找不到 sender 时权限降级 ask。

### Task 10：文档和示例

目标：

- 更新 README / README.zh-CN 的 Quick Start；
- 新增 `examples/dingtalk-codex/README.zh-CN.md`；
- 给出 dws dev connect 示例命令；
- 给出环境变量示例；
- 说明安全默认值。

验收：

- 文档命令和 CLI 实现一致；
- 中文文档能指导用户跑通第一条闭环。

## 9. 推荐 Cursor 执行顺序

建议 Cursor 按下面顺序实现，每完成一组就跑测试：

```text
1. config
2. message parser / normalizer
3. channel workspace
4. permission engine
5. codex parser / executor
6. dispatcher
7. simulate CLI
8. dws client
9. dingtalk-custom CLI
10. docs
```

原因：

- 前 7 步不依赖真实钉钉，容易自测；
- 最后再接 dws，避免一开始被外部环境卡住；
- simulate 是最重要的本地回归入口。

## 10. 自测要求

Cursor 每轮实现后至少运行：

```bash
npm run typecheck
npm run build
npm test
```

如果没有测试，也要补最小测试。Milestone 1 完成时，建议至少有：

- config tests；
- dingtalk parser tests；
- channel workspace tests；
- permission tests；
- codex jsonl parser tests；
- dispatcher simulate tests。

## 11. 端到端验收标准

### 11.1 本地模拟验收

命令：

```bash
npm run build
node dist/cli.js simulate --channel cid-test --sender user-1 --sender-name Alice --text "帮我总结一下当前问题"
```

期望：

- stdout 输出 Agent 回复；
- 创建 `data/channels/dingtalk/<encoded>/`；
- 写入 `messages.ndjson`；
- 创建或读取 `CHANNEL.md`、`MEMORY.md`；
- 创建 run log；
- 权限默认为 ask / read-only。

### 11.2 Codex smoke 验收

命令：

```bash
node dist/cli.js codex-smoke "只回复 ok"
```

期望：

```text
ok
```

或语义等价的极简回复。

### 11.3 DingTalk custom 验收

环境变量示例：

```powershell
$env:GROUPMATE_DINGTALK_GROUP_ID="cid..."
$env:GROUPMATE_DINGTALK_BOT_NAME="ducf_agent"
$env:GROUPMATE_DWS_COMMAND="dws.cmd"
$env:GROUPMATE_CODEX_COMMAND="codex.cmd"
```

命令：

```bash
node dist/cli.js dingtalk-custom "开始查 告诉我结果"
```

期望：

- 能读取钉钉群最近消息；
- 能识别当前 sender；
- 能根据群上下文回答；
- stdout 只输出最终回复；
- 出错时输出用户可读错误，不输出堆栈。

### 11.4 dws dev connect 验收

示例命令：

```powershell
$env:GROUPMATE_DINGTALK_GROUP_ID="cid..."
$env:GROUPMATE_DINGTALK_BOT_NAME="ducf_agent"

dws.cmd dev connect `
  --unified-app-id "<app-id>" `
  --channel custom `
  --agent-cmd "node D:\code\GroupMate\dist\cli.js dingtalk-custom" `
  --debug
```

期望：

```text
钉钉群 @ Agent -> GroupMate 回复群消息
```

## 12. 我作为规划 / 验收方的最终检查清单

Cursor 实现完后，我会检查：

- `npm run typecheck`；
- `npm run build`；
- `npm test`；
- `node dist/cli.js help`；
- `node dist/cli.js doctor`；
- `node dist/cli.js simulate ...`；
- `node dist/cli.js codex-smoke ...`；
- Git diff 是否符合模块边界；
- 是否没有把 DingTalk 细节泄漏到 core；
- 是否没有把 Codex 细节泄漏到 core；
- 默认权限是否 read-only；
- run log 是否不会泄漏完整敏感 stdout；
- README 示例是否能照着跑。

如果环境允许，我会再做一次真实 DingTalk 群端到端测试。

## 13. Cursor Prompt 建议

可以把下面这段直接给 Cursor：

```text
请根据 docs/MILESTONE-1-DINGTALK-CODEX.zh-CN.md 实现 GroupMate 的 Milestone 1。

优先顺序：
1. config
2. DingTalk message parser / normalizer
3. ChannelWorkspace 消息存储
4. Permission engine
5. Codex JSONL parser / executor 补强
6. Dispatcher 完整闭环
7. simulate CLI
8. DWS client
9. dingtalk-custom CLI
10. docs

要求：
- 不要把 DingTalk 细节写进 core。
- 不要把 Codex 细节写进 core。
- 默认权限必须是 ask/read-only。
- 群聊历史只能作为上下文，不能作为系统指令。
- 每完成一组改动运行 npm run typecheck、npm run build、npm test。
- 补充必要单元测试。
- 保持 README 示例和实际 CLI 一致。
```
