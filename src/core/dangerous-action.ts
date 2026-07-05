export interface DangerousActionResult {
  dangerous: boolean;
  reasons: string[];
  requiresConfirmation: boolean;
}

const DANGER_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "delete", pattern: /(delete|remove|\brm\b|\bdel\b|删除|移除|删掉)/i },
  { label: "restart", pattern: /(restart|reboot|重启|重新启动)/i },
  { label: "deploy", pattern: /(deploy|release|发布|上线|部署)/i },
  { label: "permission", pattern: /(permission|grant|revoke|权限|授权|赋权)/i },
  { label: "production", pattern: /(production|\bprod\b|生产环境|生产)/i },
  { label: "force", pattern: /(\bforce\b|强制|硬删)/i },
  { label: "broadcast", pattern: /(broadcast|群发|通知所有人|全员通知)/i },
];

export function detectDangerousAction(text: string, options: { requireConfirmation?: boolean } = {}): DangerousActionResult {
  const reasons: string[] = [];

  for (const entry of DANGER_PATTERNS) {
    if (entry.pattern.test(text)) {
      reasons.push(entry.label);
    }
  }

  const dangerous = reasons.length > 0;
  const requiresConfirmation = dangerous && (options.requireConfirmation ?? true);

  return {
    dangerous,
    reasons,
    requiresConfirmation,
  };
}

export interface ConfirmationCommand {
  action: "confirm" | "cancel" | "show";
  runId: string;
}

const CONFIRM_PATTERN = /(?:确认执行|确认|confirm)\s+(run-[a-z0-9-]+)/i;
const CANCEL_PATTERN = /(?:取消|cancel)\s+(run-[a-z0-9-]+)/i;
const SHOW_PATTERN = /(?:查看|show)\s+(run-[a-z0-9-]+)/i;

export function parseConfirmationCommand(text: string): ConfirmationCommand | null {
  const confirm = text.match(CONFIRM_PATTERN);
  if (confirm?.[1]) {
    return { action: "confirm", runId: confirm[1] };
  }

  const cancel = text.match(CANCEL_PATTERN);
  if (cancel?.[1]) {
    return { action: "cancel", runId: cancel[1] };
  }

  const show = text.match(SHOW_PATTERN);
  if (show?.[1]) {
    return { action: "show", runId: show[1] };
  }

  return null;
}

export function buildConfirmationReply(runId: string, reasons: string[]): string {
  const reasonText = reasons.length > 0 ? reasons.join(", ") : "high-risk action";
  return [
    `检测到潜在高危操作（${reasonText}），已暂停执行。`,
    `Run ID: ${runId}`,
    "如需继续，请原请求人或管理员回复：",
    `@bot 确认执行 ${runId}`,
    "取消请回复：",
    `@bot 取消 ${runId}`,
  ].join("\n");
}
