import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createPermissionEngine } from "../../src/core/permissions.js";

describe("PermissionEngine", () => {
  const engine = createPermissionEngine({
    ...DEFAULT_CONFIG,
    permissions: {
      owners: ["owner-id", "Owner Name"],
      writers: ["writer-id", "Writer Name"],
      defaultMode: "ask",
    },
  });

  it("grants admin to owners", () => {
    const decision = engine.decide({ id: "owner-id", name: "Someone" });
    expect(decision.mode).toBe("admin");
    expect(decision.sandbox).toBe("workspace-write");
  });

  it("grants write to writers", () => {
    const decision = engine.decide({ id: "writer-id", name: "Writer" });
    expect(decision.mode).toBe("write");
    expect(decision.sandbox).toBe("workspace-write");
  });

  it("matches by actor name", () => {
    const decision = engine.decide({ id: "unknown-id", name: "Owner Name" });
    expect(decision.mode).toBe("admin");
  });

  it("defaults unknown actors to ask/read-only", () => {
    const decision = engine.decide({ id: "unknown", name: "Guest" });
    expect(decision.mode).toBe("ask");
    expect(decision.sandbox).toBe("read-only");
  });

  it("defaults regular members to ask/read-only", () => {
    const decision = engine.decide({ id: "member-1", name: "Member" });
    expect(decision.mode).toBe("ask");
    expect(decision.sandbox).toBe("read-only");
  });
});
