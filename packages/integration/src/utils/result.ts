import type { Failure, Result, Warning } from "@skill-flow/domain/types";

export function ok<T>(data: T, warnings: Warning[] = []): Result<T> {
  return { ok: true, data, warnings, errors: [] };
}

export function fail<T>(
  errors: Failure | Failure[],
  warnings: Warning[] = [],
  data?: T,
): Result<T> {
  const base = {
    ok: false,
    warnings,
    errors: Array.isArray(errors) ? errors : [errors],
  } as const;

  return data === undefined ? base : { ...base, data };
}

export function mergeWarnings(...warningSets: Warning[][]): Warning[] {
  return warningSets.flat();
}
