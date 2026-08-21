import fs from "node:fs/promises";
import path from "node:path";
import { isPathInside } from "@skill-flow/integration/utils/fs";

export type ManagedCheckoutOwnership = {
  sourceRoot: string;
  kindRoot: string;
  checkoutPath: string;
};

export type ManagedCheckoutOwnershipResult =
  | { ok: true; data: ManagedCheckoutOwnership }
  | {
      ok: false;
      reason: "path-mismatch" | "outside-source-root" | "symlink" | "unresolvable";
    };

export async function resolveManagedCheckoutOwnership(input: {
  stateRoot: string;
  sourceKind: string;
  sourceId: string;
  localPath?: string;
}): Promise<ManagedCheckoutOwnershipResult> {
  const sourceRoot = path.resolve(input.stateRoot, "source");
  const kindRoot = path.resolve(sourceRoot, input.sourceKind);
  const checkoutPath = path.resolve(kindRoot, input.sourceId);

  if (
    !isPathInside(sourceRoot, kindRoot)
    || !isPathInside(kindRoot, checkoutPath)
  ) {
    return { ok: false, reason: "outside-source-root" };
  }
  if (input.localPath && path.resolve(input.localPath) !== checkoutPath) {
    return { ok: false, reason: "path-mismatch" };
  }

  const existingPaths = new Set<string>();
  for (const managedPath of [sourceRoot, kindRoot, checkoutPath]) {
    try {
      const stats = await fs.lstat(managedPath);
      if (stats.isSymbolicLink()) {
        return { ok: false, reason: "symlink" };
      }
      existingPaths.add(managedPath);
    } catch (error) {
      if (!isMissingPathError(error)) {
        return { ok: false, reason: "unresolvable" };
      }
    }
  }

  try {
    const realSourceRoot = existingPaths.has(sourceRoot)
      ? await fs.realpath(sourceRoot)
      : path.join(
          await fs.realpath(path.dirname(sourceRoot)),
          path.basename(sourceRoot),
        );
    const realKindRoot = existingPaths.has(kindRoot)
      ? await fs.realpath(kindRoot)
      : path.join(realSourceRoot, path.basename(kindRoot));
    if (!isPathInside(realSourceRoot, realKindRoot)) {
      return { ok: false, reason: "outside-source-root" };
    }

    const realCheckoutPath = existingPaths.has(checkoutPath)
      ? await fs.realpath(checkoutPath)
      : path.join(realKindRoot, path.basename(checkoutPath));
    if (!isPathInside(realSourceRoot, realCheckoutPath)) {
      return { ok: false, reason: "outside-source-root" };
    }
    return {
      ok: true,
      data: { sourceRoot, kindRoot, checkoutPath },
    };
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}
