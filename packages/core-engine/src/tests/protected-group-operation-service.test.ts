import { describe, expect, it, vi } from "vitest";
import { ok, fail } from "@skill-flow/integration/utils/result";
import { ProtectedGroupOperationService } from "../index.js";
import type { OperationRecoveryService } from "../services/operation-recovery-service.js";

function transaction() {
  return {
    checkoutBackupPath: "/tmp/checkout-backup",
    prepareTargetMutations: vi.fn(async () => undefined),
    prepareManagedSymlinkMutation: vi.fn(async () => undefined),
    checkpoint: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
  };
}

describe("ProtectedGroupOperationService", () => {
  it("owns promotion, apply, checkpoint, and commit order", async () => {
    const tx = transaction();
    const recovery = {
      begin: vi.fn(async () => tx),
      recover: vi.fn(async () => ok({ recovered: true }, [])),
    };
    const events: string[] = [];
    const result = await new ProtectedGroupOperationService(recovery as unknown as OperationRecoveryService).execute(
      { kind: "update", sourceId: "group", sourceKind: "git" },
      {
        promote: async () => {
          events.push("promote");
          return ok("promoted");
        },
        apply: async () => {
          events.push("apply");
          return ok("done");
        },
      },
    );

    expect(result).toMatchObject({ ok: true, data: "done" });
    expect(events).toEqual(["promote", "apply"]);
    expect(tx.checkpoint).toHaveBeenCalledOnce();
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(recovery.recover).not.toHaveBeenCalled();
  });

  it("recovers before returning a failed promotion", async () => {
    const tx = transaction();
    const recovery = {
      begin: vi.fn(async () => tx),
      recover: vi.fn(async () => ok({ recovered: true }, [{ code: "RECOVERED", message: "restored" }])),
    };
    const result = await new ProtectedGroupOperationService(recovery as unknown as OperationRecoveryService).execute(
      { kind: "import", sourceId: "group", sourceKind: "git", preparationId: "prep" },
      {
        promote: async () => fail({ code: "PROMOTE_FAILED", message: "no checkout" }),
        apply: async () => ok("unreachable"),
      },
    );

    expect(result).toMatchObject({ ok: false, errors: [{ code: "PROMOTE_FAILED" }] });
    expect(result.warnings).toEqual([{ code: "RECOVERED", message: "restored" }]);
    expect(recovery.recover).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("surfaces Recovery Required when recovery cannot finish", async () => {
    const tx = transaction();
    tx.checkpoint.mockRejectedValueOnce(new Error("target conflict"));
    const recovery = {
      begin: vi.fn(async () => tx),
      recover: vi.fn(async () => fail({ code: "CONFLICT", message: "external target changed" })),
    };
    const result = await new ProtectedGroupOperationService(recovery as unknown as OperationRecoveryService).execute(
      { kind: "update", sourceId: "group", sourceKind: "git" },
      {
        promote: async () => ok(undefined),
        apply: async () => ok("done"),
      },
    );
    expect(result).toMatchObject({ ok: false, errors: [{ code: "CONFLICT" }] });
  });

  it("recovers after apply failure and preserves both failure and recovery warnings", async () => {
    const tx = transaction();
    const recovery = {
      begin: vi.fn(async () => tx),
      recover: vi.fn(async () => ok({ recovered: true }, [{ code: "RECOVERED", message: "restored" }])),
    };
    const result = await new ProtectedGroupOperationService(recovery as unknown as OperationRecoveryService).execute(
      { kind: "update", sourceId: "group", sourceKind: "git" },
      {
        promote: async () => ok("promoted"),
        apply: async () => fail({ code: "APPLY_FAILED", message: "projection conflict" }, [{ code: "APPLY_WARNING", message: "partial" }]),
      },
    );

    expect(result).toMatchObject({ ok: false, errors: [{ code: "APPLY_FAILED" }] });
    expect(result.warnings).toEqual([
      { code: "APPLY_WARNING", message: "partial" },
      { code: "RECOVERED", message: "restored" },
    ]);
    expect(recovery.recover).toHaveBeenCalledOnce();
    expect(tx.checkpoint).not.toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("returns Recovery Required when recovery itself throws", async () => {
    const tx = transaction();
    const recovery = {
      begin: vi.fn(async () => tx),
      recover: vi.fn(async () => { throw new Error("journal unavailable"); }),
    };
    const result = await new ProtectedGroupOperationService(recovery as unknown as OperationRecoveryService).execute(
      { kind: "import", sourceId: "group", sourceKind: "git" },
      {
        promote: async () => fail({ code: "PROMOTE_FAILED", message: "no checkout" }),
        apply: async () => ok("unreachable"),
      },
    );

    expect(result).toMatchObject({ ok: false, errors: [{ code: "RECOVERY_REQUIRED" }] });
    expect(result.warnings).toEqual([]);
    expect(recovery.recover).toHaveBeenCalledOnce();
  });
});
