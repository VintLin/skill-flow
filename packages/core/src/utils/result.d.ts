import type { Failure, Result, Warning } from "../domain/types.js";
export declare function ok<T>(data: T, warnings?: Warning[]): Result<T>;
export declare function fail<T>(errors: Failure | Failure[], warnings?: Warning[], data?: T): Result<T>;
export declare function mergeWarnings(...warningSets: Warning[][]): Warning[];
