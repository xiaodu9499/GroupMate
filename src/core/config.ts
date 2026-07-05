import { readFile } from "node:fs/promises";
import path from "node:path";

export type GroupMateConfig = {
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

export interface LoadConfigOptions {
  configPath?: string;
  overrides?: DeepPartial<GroupMateConfig>;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const DEFAULT_CONFIG: GroupMateConfig = {
  workspace: {
    dataDir: "data",
  },
  source: {
    type: "dingtalk-cli",
    command: "dws.cmd",
    fetchLimit: 200,
    historyLimit: 80,
    lookbackMinutes: 1440,
  },
  executor: {
    type: "codex-cli",
    command: "codex.cmd",
    timeoutMs: 120_000,
  },
  permissions: {
    owners: [],
    writers: [],
    defaultMode: "ask",
  },
  execution: {
    askSandbox: "read-only",
    writeSandbox: "workspace-write",
    dangerousActionsRequireConfirmation: true,
  },
};

export function loadConfig(options: LoadConfigOptions = {}): GroupMateConfig {
  let config = structuredClone(DEFAULT_CONFIG);
  applyEnvOverrides(config);
  if (options.configPath) {
    // Config file is loaded synchronously in async context via readFile in loadConfigAsync;
    // for sync loadConfig we require caller to use loadConfigFromFile separately.
    throw new Error("Use loadConfigAsync when configPath is provided.");
  }
  if (options.overrides) {
    config = mergeConfig(config, options.overrides);
  }
  return config;
}

export async function loadConfigAsync(options: LoadConfigOptions = {}): Promise<GroupMateConfig> {
  let config = structuredClone(DEFAULT_CONFIG);
  applyEnvOverrides(config);

  if (options.configPath) {
    const fileConfig = await readConfigFile(options.configPath);
    config = mergeConfig(config, fileConfig);
  }

  if (options.overrides) {
    config = mergeConfig(config, options.overrides);
  }

  return config;
}

async function readConfigFile(configPath: string): Promise<DeepPartial<GroupMateConfig>> {
  const absolute = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const raw = await readFile(absolute, "utf8");
  const parsed = JSON.parse(raw) as DeepPartial<GroupMateConfig>;
  return parsed;
}

function applyEnvOverrides(config: GroupMateConfig): void {
  const dataDir = process.env.GROUPMATE_DATA_DIR;
  if (dataDir) {
    config.workspace.dataDir = dataDir;
  }

  const dwsCommand = process.env.GROUPMATE_DWS_COMMAND;
  if (dwsCommand) {
    config.source.command = dwsCommand;
  }

  const groupId = process.env.GROUPMATE_DINGTALK_GROUP_ID;
  if (groupId) {
    config.source.groupId = groupId;
  }

  const botName = process.env.GROUPMATE_DINGTALK_BOT_NAME;
  if (botName) {
    config.source.botName = botName;
  }

  applyPositiveIntEnv(config, "GROUPMATE_DINGTALK_FETCH_LIMIT", (value) => {
    config.source.fetchLimit = value;
  });
  applyPositiveIntEnv(config, "GROUPMATE_DINGTALK_HISTORY_LIMIT", (value) => {
    config.source.historyLimit = value;
  });
  applyPositiveIntEnv(config, "GROUPMATE_DINGTALK_LOOKBACK_MINUTES", (value) => {
    config.source.lookbackMinutes = value;
  });

  const codexCommand = process.env.GROUPMATE_CODEX_COMMAND;
  if (codexCommand) {
    config.executor.command = codexCommand;
  }

  applyPositiveIntEnv(config, "GROUPMATE_CODEX_TIMEOUT_MS", (value) => {
    config.executor.timeoutMs = value;
  });

  const owners = parseIdList(process.env.GROUPMATE_OWNER_IDS);
  if (owners.length > 0) {
    config.permissions.owners = owners;
  }

  const writers = parseIdList(process.env.GROUPMATE_WRITER_IDS);
  if (writers.length > 0) {
    config.permissions.writers = writers;
  }
}

function applyPositiveIntEnv(_config: GroupMateConfig, name: string, apply: (value: number) => void): void {
  const value = process.env[name];
  if (!value) {
    return;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    apply(parsed);
  }
}

function parseIdList(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeConfig(base: GroupMateConfig, patch: DeepPartial<GroupMateConfig>): GroupMateConfig {
  return {
    workspace: { ...base.workspace, ...patch.workspace },
    source: { ...base.source, ...patch.source },
    executor: { ...base.executor, ...patch.executor },
    permissions: {
      owners: (patch.permissions?.owners ?? base.permissions.owners).filter((value): value is string => Boolean(value)),
      writers: (patch.permissions?.writers ?? base.permissions.writers).filter((value): value is string => Boolean(value)),
      defaultMode: patch.permissions?.defaultMode ?? base.permissions.defaultMode,
    },
    execution: { ...base.execution, ...patch.execution },
  };
}

export { DEFAULT_CONFIG };
