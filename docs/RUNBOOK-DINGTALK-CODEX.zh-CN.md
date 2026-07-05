# GroupMate DingTalk + Codex 生产运行手册

## 1. 环境准备

- Node.js >= 20
- 已安装并登录 `dws`（钉钉 CLI）
- 已安装并登录 `codex` CLI
- 获取钉钉群 `openConversationId`（下文称 groupId）

```powershell
npm install
npm run build
```

## 2. 环境变量

```powershell
$env:GROUPMATE_DATA_DIR = "D:\code\GroupMate\data"
$env:GROUPMATE_DB_PATH = "D:\code\GroupMate\data\groupmate.db"   # 可选
$env:GROUPMATE_DINGTALK_GROUP_ID = "cid..."
$env:GROUPMATE_DINGTALK_BOT_NAME = "你的机器人名称"
$env:GROUPMATE_DWS_COMMAND = "dws.cmd"
$env:GROUPMATE_CODEX_COMMAND = "codex.cmd"
$env:GROUPMATE_OWNER_IDS = "DSn..."
$env:GROUPMATE_WRITER_IDS = "DSn..."
```

可选调试：

```powershell
$env:GROUPMATE_DEBUG = "1"
$env:GROUPMATE_DEBUG_ARTIFACTS = "1"
$env:GROUPMATE_MOCK_EXECUTOR = "1"
```

## 3. 初始化与诊断

```powershell
node dist/cli.js db migrate
node dist/cli.js db status
node dist/cli.js doctor
```

`doctor` 会检查 Node、dws、codex、数据目录、群 ID、SQLite 与 FTS 状态。

## 4. 同步群消息

```powershell
node dist/cli.js dingtalk-sync --group "cid..." --limit 200
node dist/cli.js dingtalk-sync --group "cid..." --since "2026-07-05 10:00:00"
```

输出示例：

```text
fetched=200 inserted=180 duplicated=20 skippedBot=5
```

## 5. 本地模拟

```powershell
$env:GROUPMATE_MOCK_EXECUTOR = "1"
node dist/cli.js simulate --channel cid-test --sender user-1 --sender-name Alice --text "帮我总结当前问题"
node dist/cli.js runs list --channel cid-test
node dist/cli.js messages recent --channel cid-test --limit 5
```

## 6. Codex smoke

```powershell
node dist/cli.js codex-smoke "只回复 ok"
```

## 7. 真实钉钉群接入

```powershell
dws dev connect `
  --unified-app-id "<app-id>" `
  --channel custom `
  --agent-cmd "node D:\code\GroupMate\dist\cli.js dingtalk-custom" `
  --debug
```

在群里 @ Agent 发消息。`dingtalk-custom` 的 **stdout 只会输出最终群回复**。

## 8. 权限与高危动作

- 默认权限：`ask` + `read-only`
- 可在 `data/channels/dingtalk/<channel>/policy.json` 配置 owner/writer
- 检测到删除/发布/生产/权限等高危词时，run 进入 `waiting_confirmation`，不会直接执行 Codex 写操作
- 确认方式：`@bot 确认执行 run-xxx` / `@bot 取消 run-xxx`

## 9. 查询 run 与消息

```powershell
node dist/cli.js runs list --channel "cid..."
node dist/cli.js runs show run-...
node dist/cli.js messages recent --channel "cid..." --limit 20
node dist/cli.js messages search --channel "cid..." --query "部署"
```

## 10. 日志

结构化日志默认写入：

```text
data/logs/groupmate.log.ndjson
```

默认不记录完整消息正文，只记录 messageId、channel、sender、textLength、hash。

## 11. 常见故障

| 现象 | 排查 |
|---|---|
| doctor 报 dws/codex 不存在 | 检查 PATH 或设置 `GROUPMATE_*_COMMAND` |
| dingtalk-sync 失败 | 先手动跑 `dws chat message list ...`；检查登录与 groupId |
| 群里无回复 | 看 stderr / 日志；用 `GROUPMATE_MOCK_EXECUTOR=1` 隔离 Codex |
| Codex 超时 | 增大 `GROUPMATE_CODEX_TIMEOUT_MS`；检查代理 |
| 事件 sender 为 unknown | 先 `dingtalk-sync`；检查 botName 与消息匹配 |
| FTS 不可用 | `doctor` 会提示；系统自动降级 LIKE 搜索 |

## 12. 数据清理

```powershell
Remove-Item -Recurse -Force data\groupmate.db
Remove-Item -Recurse -Force data\logs
Remove-Item -Recurse -Force data\channels
node dist/cli.js db migrate
```

## 13. 安全约束

- 群历史仅作上下文，不作指令
- raw stdout/stderr 默认不发群、不写入 run ledger 全文
- 开启 `GROUPMATE_DEBUG_ARTIFACTS=1` 时，原始输出保存到 `data/runs/<runId>/artifacts/`
