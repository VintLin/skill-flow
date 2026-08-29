import os from "node:os";
import path from "node:path";
import { pathExists } from "@skill-flow/integration/utils/fs";
import { parseGitHubRepo, parseHostedGitRepo } from "@skill-flow/integration/utils/naming";
import { normalizeImportCanonicalRepo } from "@skill-flow/integration/utils/skills-directory";

export type GitHubImportLocator = {
  canonicalRepo: string;
  originalLocator: string;
  locator: string;
  requestedPath?: string;
  skillSelector?: string;
};

export type SelectableImportLeaf = {
  id: string;
  relativePath: string;
  linkName: string;
  title: string;
  name?: string;
};

export class ImportSourcePolicy {
  parseGitHubLocator(locator: string): GitHubImportLocator | undefined {
    const trimmed = this.stripQuotes(locator.trim()).replace(/\/+$/, "");
    return this.parseSelectorLocator(trimmed)
      ?? this.parseTreeLocator(trimmed)
      ?? this.parseShorthandSubpath(trimmed)
      ?? this.parseCanonicalRepo(trimmed);
  }

  matchedSkillNames(locator: GitHubImportLocator): string[] {
    if (locator.skillSelector) {
      return [locator.skillSelector];
    }

    const basename = locator.requestedPath?.split("/").filter(Boolean).at(-1);
    return basename ? [basename] : [];
  }

  async resolveDirectLocator(locator: string): Promise<string | undefined> {
    const trimmed = this.stripQuotes(locator.trim());
    if (!trimmed || normalizeImportCanonicalRepo(trimmed)) {
      return undefined;
    }

    if (/^clawhub:[^@\s]+(?:@.+)?$/i.test(trimmed)) {
      return trimmed;
    }

    const hostedRepo = parseHostedGitRepo(trimmed);
    if (hostedRepo?.host.includes("gitlab")) {
      return trimmed;
    }

    const localLocator = trimmed.startsWith("~/")
      ? path.join(process.env.HOME ?? os.homedir(), trimmed.slice(2))
      : trimmed;
    const resolvedPath = path.resolve(localLocator.startsWith("file://")
      ? decodeURIComponent(new URL(trimmed).pathname)
      : localLocator);
    return await pathExists(resolvedPath) ? resolvedPath : undefined;
  }

  matchesSelector(value: string, candidates: readonly string[], canonicalRepo: string): boolean {
    const selectorVariants = this.selectorVariants(value, canonicalRepo);
    const candidateVariants = new Set(candidates.flatMap((candidate) =>
      this.selectorVariants(candidate, canonicalRepo)
    ));
    return selectorVariants.some((variant) => candidateVariants.has(variant));
  }

  findSelectorMatches<T extends SelectableImportLeaf>(
    leafs: readonly T[],
    selector: string,
    canonicalRepo?: string,
  ): T[] {
    return leafs.filter((leaf) => {
      const candidates = [leaf.linkName, leaf.title, leaf.name].filter(
        (value): value is string => Boolean(value),
      );
      if (candidates.includes(selector)) {
        return true;
      }
      return canonicalRepo
        ? this.matchesSelector(
            selector,
            [...candidates, path.posix.basename(leaf.relativePath)],
            canonicalRepo,
          )
        : false;
    });
  }

  pickPreferredLeaf<T extends SelectableImportLeaf>(matches: readonly T[]): T | undefined {
    if (matches.length === 0) {
      return undefined;
    }

    const ranked = matches.map((leaf) => ({ leaf, rank: this.selectorRank(leaf.relativePath) }));
    const bestRank = Math.min(...ranked.map((entry) => entry.rank));
    const bestMatches = ranked.filter((entry) => entry.rank === bestRank);
    return bestMatches.length === 1 ? bestMatches[0]?.leaf : undefined;
  }

  selectLeafIdsForRequestedPath(
    leafs: readonly SelectableImportLeaf[],
    requestedPath?: string,
  ): string[] {
    const normalizedPath = this.normalizeRequestedPath(requestedPath);
    if (!normalizedPath) {
      return leafs.map((leaf) => leaf.id);
    }
    return leafs
      .filter((leaf) =>
        leaf.relativePath === normalizedPath || leaf.relativePath.startsWith(`${normalizedPath}/`)
      )
      .map((leaf) => leaf.id);
  }

  normalizeRequestedPath(requestedPath?: string): string | undefined {
    if (!requestedPath) {
      return undefined;
    }
    const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 && normalized !== "." ? normalized : undefined;
  }

  private parseSelectorLocator(locator: string): GitHubImportLocator | undefined {
    const match = locator.match(/^([^/\s:@]+)\/([^/@\s]+)@(.+)$/);
    const skillSelector = match?.[3]?.trim().replace(/^\/+|\/+$/g, "");
    if (!skillSelector || skillSelector.includes("@")) {
      return undefined;
    }
    return this.githubLocator(match?.[1], match?.[2], locator, { skillSelector });
  }

  private parseTreeLocator(locator: string): GitHubImportLocator | undefined {
    try {
      const url = new URL(locator);
      if (url.hostname !== "github.com") {
        return undefined;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2 || parts[2] && parts[2] !== "tree") {
        return undefined;
      }
      const requestedPath = parts.length >= 5 ? parts.slice(4).join("/") : undefined;
      return this.githubLocator(parts[0], parts[1], locator, {
        ...(requestedPath ? { requestedPath } : {}),
      });
    } catch {
      return undefined;
    }
  }

  private parseShorthandSubpath(locator: string): GitHubImportLocator | undefined {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(locator) || locator.startsWith("git@")) {
      return undefined;
    }
    const parts = locator.split("/");
    if (parts.length < 3) {
      return undefined;
    }
    const requestedPath = parts.slice(2).join("/");
    return this.githubLocator(parts[0], parts[1], locator, { requestedPath });
  }

  private parseCanonicalRepo(locator: string): GitHubImportLocator | undefined {
    const canonicalRepo = normalizeImportCanonicalRepo(locator);
    return canonicalRepo
      ? { canonicalRepo, originalLocator: canonicalRepo, locator: canonicalRepo }
      : undefined;
  }

  private githubLocator(
    owner: string | undefined,
    rawRepo: string | undefined,
    originalLocator: string,
    options: { requestedPath?: string; skillSelector?: string },
  ): GitHubImportLocator | undefined {
    if (!owner || !rawRepo) {
      return undefined;
    }
    const repo = rawRepo.replace(/\.git$/i, "");
    const canonicalRepo = normalizeImportCanonicalRepo(`${owner}/${repo}`);
    return canonicalRepo
      ? {
          canonicalRepo,
          originalLocator,
          locator: `https://github.com/${canonicalRepo}.git`,
          ...(options.requestedPath ? { requestedPath: options.requestedPath } : {}),
          ...(options.skillSelector ? { skillSelector: options.skillSelector } : {}),
        }
      : undefined;
  }

  private selectorVariants(value: string, canonicalRepo: string): string[] {
    const normalized = this.normalizeSelector(value);
    if (!normalized) {
      return [];
    }
    const variants = new Set<string>([normalized]);
    const pathSegments = value.trim().replace(/\\/g, "/").split("/").map((part) => part.trim()).filter(Boolean);
    for (let index = 1; index < pathSegments.length; index += 1) {
      const suffix = this.normalizeSelector(pathSegments.slice(index).join("/"));
      if (suffix) {
        variants.add(suffix);
      }
    }

    const repo = parseGitHubRepo(canonicalRepo);
    if (!repo) {
      return [...variants];
    }
    const prefixes = [repo.owner, repo.owner.split(/[^a-z0-9]+/i)[0] ?? "", repo.repo]
      .map((entry) => this.normalizeSelector(entry))
      .filter(Boolean);
    for (const prefix of prefixes) {
      if (normalized.startsWith(`${prefix}-`)) {
        variants.add(normalized.slice(prefix.length + 1));
      }
    }
    return [...variants];
  }

  private normalizeSelector(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  }

  private selectorRank(relativePath: string): number {
    if (relativePath === ".") return 0;
    if (/^skills\/[^/]+$/.test(relativePath)) return 1;
    if (/^skills\/\.(curated|experimental|system)\/[^/]+$/.test(relativePath)) return 2;
    return 3;
  }

  private stripQuotes(locator: string): string {
    if (locator.length < 2) return locator;
    const first = locator[0];
    const last = locator[locator.length - 1];
    return first === "'" && last === "'" || first === '"' && last === '"'
      ? locator.slice(1, -1).trim()
      : locator;
  }
}
