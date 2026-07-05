export type DwsErrorCategory = "timeout" | "spawn_failed" | "non_zero_exit" | "parse_failed" | "unknown";

export class DwsError extends Error {
  readonly category: DwsErrorCategory;
  readonly code: number | null;
  readonly stderrLength: number;

  constructor(options: {
    category: DwsErrorCategory;
    message: string;
    code?: number | null;
    stderrLength?: number;
  }) {
    super(options.message);
    this.name = "DwsError";
    this.category = options.category;
    this.code = options.code ?? null;
    this.stderrLength = options.stderrLength ?? 0;
  }
}
