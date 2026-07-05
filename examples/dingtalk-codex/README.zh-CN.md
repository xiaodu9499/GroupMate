# 钉钉 + Codex CLI 最小闭环示例

本示例展示如何用 GroupMate 在本地钉钉群里跑通第一条 Agent 闭环。

## 前置条件

- Node.js 20+
- 已安装并可执行 `dws.cmd`
- 已安装并可执行 `codex.cmd`
- 已加入目标钉钉群，并知道 `openConversationId`

## 环境变量

PowerShell 示例：

```powershell
$env:GROUPMATE_DATA_DIR="data"
$env:GROUPMATE_DWS_COMMAND="dws.cmd"
$env:GROUPMATE_DINGTALK_GROUP_ID="cid..."
$env:GROUPMATE_DINGTALK_BOT_NAME="ducf_agent"
$env:GROUPMATE_CODEX_COMMAND="codex.cmd"
$env:GROUPMATE_CODEX_TIMEOUT_MS="120000"
$env:GROUPMATE_OWNER_IDS=""
$env:GROUPMATE_WRITER_IDS=""
```

默认权限策略：

- 未识别身份：`ask` + `read-only`
- 普通成员：`ask` + `read-only`
- writers：`write` + `workspace-write`
- owners：`admin` + `workspace-write`

`danger-full-access` 不会作为默认值。

## 本地自测（不依赖真实钉钉）

```bash
npm run build
node dist/cli.js db migrate
node dist/cli.js doctor
node dist/cli.js simulate --channel cid-test --sender user-1 --sender-name Alice --text "帮我总结一下当前问题"
node dist/cli.js runs list --channel cid-test
node dist/cli.js messages recent --channel cid-test
```

如需跳过真实 Codex，可在测试环境设置：

```powershell
$env:GROUPMATE_MOCK_EXECUTOR="1"
node dist/cli.js simulate --text "hello"
```

## Codex smoke

```bash
node dist/cli.js codex-smoke "只回复 ok"
```

## DingTalk 同步与 one-shot

先同步群消息到 SQLite，再处理 custom 事件：

```bash
node dist/cli.js dingtalk-sync --group "cid..." --limit 200
node dist/cli.js dingtalk-custom "开始查 告诉我结果"
node dist/cli.js dingtalk-custom --force "开始查 告诉我结果"
```

stdout 只会输出最终回复文本。

## dws dev connect 示例

```powershell
$env:GROUPMATE_DINGTALK_GROUP_ID="cid..."
$env:GROUPMATE_DINGTALK_BOT_NAME="ducf_agent"

dws.cmd dev connect `
  --unified-app-id "<app-id>" `
  --channel custom `
  --agent-cmd "node D:\code\GroupMate\dist\cli.js dingtalk-custom" `
  --debug
```

期望链路：

```text
钉钉群 @ Agent -> GroupMate 回复群消息
```

## 配置文件

也可以复制 `examples/groupmate.config.example.json` 并通过 `--config` 传入：

```bash
node dist/cli.js simulate --config examples/groupmate.config.example.json --text "hello"
```

## 数据目录

```text
data/groupmate.db
data/logs/groupmate.log.ndjson
data/channels/dingtalk/<base64url(channelId)>/
  CHANNEL.md
  MEMORY.md
  policy.json
  runs/
```

群聊历史只会作为上下文注入，不会当作系统指令。完整运行手册见 [docs/RUNBOOK-DINGTALK-CODEX.zh-CN.md](../../docs/RUNBOOK-DINGTALK-CODEX.zh-CN.md)。
