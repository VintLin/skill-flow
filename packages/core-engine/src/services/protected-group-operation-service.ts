import type { Failure, Result, SourceKind, Warning } from "@skill-flow/domain/types";
import { fail, ok } from "@skill-flow/integration/utils/result";
import {
  OperationRecoveryService,
  type OperationRecoveryTransaction,
} from "./operation-recovery-service.js";

export type ProtectedGroupOperationInput = {
  kind: "import" | "update";
  sourceId: string;
  sourceKind: SourceKind;
  checkoutPath?: string;
  preparationId?: string;
};

export type ProtectedGroupOperationSteps<T, P = void> = {
  /** Promote disposable preparation into the managed checkout. */
  promote: (transaction: OperationRecoveryTransaction) => Promise<Result<P>>;
  /** Apply authority and target projections inside the same transaction. */
  apply: (promoted: P, transaction: OperationRecoveryTransaction) => Promise<Result<T>>;
};

/**
 * Owns the protected commit sequence for one managed group.
 *
 * Callers supply domain adapters for promotion and projection work. They do
 * not decide when checkpoint, commit, or recovery happens, which keeps the
 * recovery invariant local to this module.
 */
export class ProtectedGroupOperationService {
  constructor(private readonly recovery: OperationRecoveryService) {}

  async execute<T, P = void>(
    input: ProtectedGroupOperationInput,
    steps: ProtectedGroupOperationSteps<T, P>,
  ): Promise<Result<T>> {
    let transaction: OperationRecoveryTransaction | undefined;
    try {
      transaction = await this.recovery.begin(input);
      const promoted = await steps.promote(transaction);
      if (!promoted.ok) {
        return this.recoverOrReturn({ ok: false, errors: promoted.errors, warnings: promoted.warnings });
      }

      const applied = await steps.apply(promoted.data, transaction);
      if (!applied.ok) return this.recoverOrReturn(applied);

      await transaction.checkpoint();
      await transaction.commit();
      return applied;
    } catch (error) {
      const failure: Failure = {
        code: "PROTECTED_OPERATION_FAILED",
        message: String(error),
      };
      if (!transaction) return fail(failure);
      return this.recoverOrReturn(fail(failure));
    }
  }

  private async recoverOrReturn<T>(
    fallback: Result<T>,
  ): Promise<Result<T>> {
    try {
      const recovered = await this.recovery.recover();
      if (recovered.ok) {
        return fallback.ok
          ? fallback
          : fail(fallback.errors, [...fallback.warnings, ...recovered.warnings]);
      }
      return fail(recovered.errors, [...fallback.warnings, ...recovered.warnings]);
    } catch (error) {
      const warnings: Warning[] = [...fallback.warnings];
      return fail(
        {
          code: "RECOVERY_REQUIRED",
          message: `Protected operation recovery failed: ${String(error)}`,
        },
        warnings,
      );
    }
  }
}
