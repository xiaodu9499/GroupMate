#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

function parseArgs(argv) {
  const args = {
    limit: 20,
    dws: process.platform === "win32" ? "dws.cmd" : "dws",
    format: "json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--group") args.group = argv[++index];
    else if (arg === "--limit") args.limit = Number.parseInt(argv[++index] ?? "", 10);
    else if (arg === "--dws") args.dws = argv[++index];
    else if (arg === "--mock-file") args.mockFile = argv[++index];
    else if (arg === "--mock") args.mock = true;
    else if (arg === "--time") args.time = argv[++index];
    else if (arg === "--since-today") args.sinceToday = true;
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node recent-messages.mjs --group <openConversationId> [--limit 20] [--time \"YYYY-MM-DD HH:mm:ss\"|--since-today] [--profile <profile>] [--mock]",
    "  node recent-messages.mjs --group cid-demo --mock-file references/sample-dws-list.json",
  ].join("\n");
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result?.list)) return payload.result.list;
  if (Array.isArray(payload?.result?.messages)) return payload.result.messages;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages;
  return [];
}

function firstString(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function contentToText(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return contentToText(parsed) ?? value;
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  return (
    firstString(value, ["text", "content", "plainText", "markdown", "title"]) ??
    firstString(value?.text, ["content", "text"]) ??
    firstString(value?.markdown, ["text", "content"]) ??
    firstString(value?.msgParam ? safeJson(value.msgParam) : undefined, ["content", "text", "title"])
  );
}

function safeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeMessage(row, index) {
  const text =
    contentToText(row?.content) ??
    contentToText(row?.msgContent) ??
    contentToText(row?.messageContent) ??
    contentToText(row?.text) ??
    "";
  const senderName = firstString(row, ["sender", "senderName", "fromName", "nick", "name", "senderNick"]);
  const senderId = firstString(row, [
    "senderOpenDingTalkId",
    "senderId",
    "openDingTalkId",
    "fromOpenDingTalkId",
    "fromUserId",
    "userId",
  ]);
  const timestamp =
    firstString(row, ["createTime", "sendTime", "timestamp", "time", "createdAt"]) ?? new Date(0).toISOString();
  const id = firstString(row, ["openMessageId", "messageId", "msgId", "id"]) ?? `message-${index + 1}`;
  const lowerSender = `${senderName ?? ""} ${senderId ?? ""}`.toLowerCase();
  const isBot =
    row?.isBot === true ||
    row?.robot === true ||
    lowerSender.includes("bot") ||
    lowerSender.includes("robot") ||
    lowerSender.includes("agent") ||
    lowerSender.includes("groupmate");

  return {
    id,
    senderId,
    senderName,
    text,
    timestamp,
    isBot,
    raw: row,
  };
}

function readPayload(args) {
  if (args.mockFile) {
    return JSON.parse(readFileSync(args.mockFile, "utf8"));
  }
  const cmdArgs = [
    "chat",
    "message",
    "list",
    "--group",
    args.group,
    "--limit",
    String(args.limit),
  ];
  if (args.profile) {
    cmdArgs.push("--profile", args.profile);
  }
  const time = args.sinceToday ? todayStartString() : args.time ?? localDateTimeString(new Date());
  if (time) {
    cmdArgs.push("--time", time);
  }
  if (!args.sinceToday) {
    cmdArgs.push("--forward=false");
  }
  if (args.mock) {
    cmdArgs.push("--mock");
  }
  cmdArgs.push("--format", "json");

  const dws = resolveDwsInvocation(args.dws);
  const result = spawnSync(dws.file, [...dws.prefixArgs, ...cmdArgs], {
    encoding: "utf8",
    shell: dws.shell,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`dws exited with code ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  const stdout = result.stdout.trim();
  if (!stdout) return {};
  return JSON.parse(stdout);
}

function resolveDwsInvocation(dwsCommand) {
  if (process.platform !== "win32") {
    return { file: dwsCommand, prefixArgs: [], shell: false };
  }

  const commandPath = findWindowsCommand(dwsCommand);
  const extension = extname(commandPath).toLowerCase();
  if (extension === ".cmd" || extension === ".bat") {
    const binDir = dirname(commandPath);
    const dwsJs = join(binDir, "node_modules", "dingtalk-workspace-cli", "bin", "dws.js");
    const nodeExe = existsSync(join(binDir, "node.exe")) ? join(binDir, "node.exe") : process.execPath;
    if (existsSync(dwsJs)) {
      return { file: nodeExe, prefixArgs: [dwsJs], shell: false };
    }
  }

  return { file: commandPath, prefixArgs: [], shell: true };
}

function findWindowsCommand(command) {
  if (command.includes("\\") || command.includes("/")) {
    return command;
  }
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  const firstMatch = result.stdout?.split(/\r?\n/).find((line) => line.trim());
  return firstMatch?.trim() ?? command;
}

function todayStartString() {
  return `${datePartInDwsTimezone(new Date())} 00:00:00`;
}

function localDateTimeString(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${datePartInDwsTimezone(date)} ${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}:${String(shifted.getUTCSeconds()).padStart(2, "0")}`;
}

function datePartInDwsTimezone(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.group) {
    throw new Error(`Missing --group <openConversationId>\n${usage()}`);
  }
  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new Error("--limit must be an integer between 1 and 500");
  }
  const payload = readPayload(args);
  const rows = extractArray(payload);
  const messages = rows.map(normalizeMessage).filter((message) => message.text.trim());
  console.log(
    JSON.stringify(
      {
        group: args.group,
        limit: args.limit,
        count: messages.length,
        messages,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
