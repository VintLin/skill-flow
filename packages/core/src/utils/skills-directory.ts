import type { ImportGroupCandidate, SourceStats } from "../domain/types.js";
import { fetchGitHubRepoDetails } from "./github-catalog.js";
import { parseGitHubRepo } from "./naming.js";

const SKILLS_DIRECTORY_BASE_URL = "https://skills.sh";
export const IMPORT_DIRECTORY_CACHE_TTL_MS = 8 * 60 * 60_000;
const IMPORT_REPO_ALIASES = new Map<string, string>([
  ["anthropic/skills", "anthropics/skills"],
]);

export type SkillsDirectorySearchHit = {
  id: string;
  skillId: string;
  name: string;
  installs?: number;
  source: string;
  canonicalRepo: string;
};

type SkillsDirectorySearchResponse = {
  skills?: Array<{
    id?: string;
    skillId?: string;
    name?: string;
    installs?: number;
    source?: string;
  }>;
};

export type SkillsDirectoryGroupedResult = {
  canonicalRepo: string;
  matchedSkillNames: string[];
};

export type SkillsDirectoryGroupDetails = {
  canonicalRepo: string;
  aliases: string[];
  title: string;
  sourceUrl: string;
  repoUrl: string;
  repoLabel: string;
  totalInstalls?: number;
  starCount?: number;
  skillCount?: number;
};

export type SkillsDirectoryPreviewSkill = {
  id: string;
  title: string;
  summary: string;
};

export function normalizeImportCanonicalRepo(input: string): string | undefined {
  const repo = parseGitHubRepo(input);
  if (!repo) {
    return undefined;
  }

  return applyImportRepoAlias(`${repo.owner}/${repo.repo}`.toLowerCase());
}

export function buildImportRepoAliases(canonicalRepo: string): string[] {
  const repo = normalizeImportCanonicalRepo(canonicalRepo);
  if (!repo) {
    return [];
  }

  const aliases = new Set<string>([
    repo,
    `https://github.com/${repo}`,
    `https://github.com/${repo}.git`,
    `git@github.com:${repo}.git`,
  ]);

  for (const [alias, target] of IMPORT_REPO_ALIASES.entries()) {
    if (target === repo) {
      aliases.add(alias);
      aliases.add(`https://github.com/${alias}`);
      aliases.add(`https://github.com/${alias}.git`);
      aliases.add(`git@github.com:${alias}.git`);
    }
  }

  return [...aliases];
}

export async function searchSkillsDirectory(
  query: string,
  limit = 20,
): Promise<SkillsDirectorySearchHit[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const response = await fetch(
    `${SKILLS_DIRECTORY_BASE_URL}/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
  );
  if (!response.ok) {
    throw createProviderError(
      response.status === 429 ? "SKILLS_SEARCH_RATE_LIMITED" : "SKILLS_SEARCH_REQUEST_FAILED",
      `skills.sh search request failed with ${response.status}.`,
    );
  }

  let payload: SkillsDirectorySearchResponse;
  try {
    payload = await response.json() as SkillsDirectorySearchResponse;
  } catch {
    throw createProviderError(
      "SKILLS_SEARCH_RESPONSE_INVALID",
      "skills.sh search response payload was invalid.",
    );
  }

  return (payload.skills ?? []).flatMap((skill) => {
    if (
      typeof skill.id !== "string" ||
      typeof skill.skillId !== "string" ||
      typeof skill.name !== "string" ||
      typeof skill.source !== "string"
    ) {
      return [];
    }

    const canonicalRepo = normalizeImportCanonicalRepo(skill.source);
    if (!canonicalRepo) {
      return [];
    }

    return [{
      id: skill.id,
      skillId: skill.skillId,
      name: skill.name,
      ...(typeof skill.installs === "number" ? { installs: skill.installs } : {}),
      source: skill.source,
      canonicalRepo,
    } satisfies SkillsDirectorySearchHit];
  });
}

export function groupSkillsDirectorySearchHits(
  hits: SkillsDirectorySearchHit[],
): SkillsDirectoryGroupedResult[] {
  const grouped = new Map<string, Set<string>>();

  for (const hit of hits) {
    const skillNames = grouped.get(hit.canonicalRepo) ?? new Set<string>();
    skillNames.add(hit.name);
    grouped.set(hit.canonicalRepo, skillNames);
  }

  return [...grouped.entries()].map(([canonicalRepo, skillNames]) => ({
    canonicalRepo,
    matchedSkillNames: [...skillNames],
  }));
}

export async function fetchSkillsDirectoryGroupDetails(
  locator: string,
): Promise<SkillsDirectoryGroupDetails> {
  const canonicalRepo = normalizeImportCanonicalRepo(locator);
  if (!canonicalRepo) {
    throw createProviderError("SKILLS_SOURCE_NOT_SUPPORTED", `Unsupported locator '${locator}'.`);
  }

  const sourceUrl = `${SKILLS_DIRECTORY_BASE_URL}/${canonicalRepo}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    if (response.status === 404) {
      throw createProviderError(
        "SKILLS_SOURCE_NOT_FOUND",
        `skills.sh source page request failed with ${response.status}.`,
      );
    }
    throw createProviderError(
      response.status === 429 ? "SKILLS_SOURCE_RATE_LIMITED" : "SKILLS_SOURCE_REQUEST_FAILED",
      `skills.sh source page request failed with ${response.status}.`,
    );
  }

  const html = await response.text();
  const parsed = parseSkillsSourcePage(html);
  if (parsed.totalInstalls === undefined) {
    throw createProviderError(
      "SKILLS_SOURCE_PARSE_FAILED",
      "skills.sh source page payload was missing total installs.",
    );
  }

  const repoDetails: SourceStats = await fetchGitHubRepoDetails(canonicalRepo).catch(() => ({}));
  const repoUrl = parsed.repoUrl ?? `https://github.com/${canonicalRepo}`;
  const repoLabel = parsed.repoLabel ?? canonicalRepo;

  return {
    canonicalRepo,
    aliases: buildImportRepoAliases(canonicalRepo),
    title: parsed.title ?? canonicalRepo.split("/")[1] ?? canonicalRepo,
    sourceUrl,
    repoUrl,
    repoLabel,
    ...(parsed.totalInstalls !== undefined ? { totalInstalls: parsed.totalInstalls } : {}),
    ...(repoDetails.starCount !== undefined ? { starCount: repoDetails.starCount } : {}),
    ...(parsed.skillCount !== undefined ? { skillCount: parsed.skillCount } : {}),
  };
}

export async function fetchSkillsDirectoryPreviewSkills(
  locator: string,
): Promise<{
  canonicalRepo: string;
  locator: string;
  skills: SkillsDirectoryPreviewSkill[];
}> {
  const canonicalRepo = normalizeImportCanonicalRepo(locator);
  if (!canonicalRepo) {
    throw createProviderError("SKILLS_SOURCE_NOT_SUPPORTED", `Unsupported locator '${locator}'.`);
  }

  const sourceUrl = `${SKILLS_DIRECTORY_BASE_URL}/${canonicalRepo}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    if (response.status === 404) {
      throw createProviderError(
        "SKILLS_SOURCE_NOT_FOUND",
        `skills.sh source page request failed with ${response.status}.`,
      );
    }
    throw createProviderError(
      response.status === 429 ? "SKILLS_SOURCE_RATE_LIMITED" : "SKILLS_SOURCE_REQUEST_FAILED",
      `skills.sh source page request failed with ${response.status}.`,
    );
  }

  const html = await response.text();
  const skills = parseSkillsSourceSkillList(html, canonicalRepo);
  if (skills.length === 0) {
    throw createProviderError(
      "SKILLS_SOURCE_PARSE_FAILED",
      "skills.sh source page payload was missing skill entries.",
    );
  }

  return {
    canonicalRepo,
    locator: canonicalRepo,
    skills,
  };
}

export function buildImportGroupCandidate(
  args: {
    canonicalRepo: string;
    locator?: string;
    installed: boolean;
    matchedSkillNames?: string[];
    details?: Partial<SkillsDirectoryGroupDetails>;
  },
): ImportGroupCandidate {
  const canonicalRepo = normalizeImportCanonicalRepo(args.canonicalRepo) ?? args.canonicalRepo;
  const locator = args.locator ?? canonicalRepo;
  const details = args.details ?? {};
  const title = details.title ?? canonicalRepo.split("/")[1] ?? canonicalRepo;

  return {
    id: canonicalRepo,
    provider: "skills",
    locator,
    canonicalRepo,
    aliases: details.aliases ?? buildImportRepoAliases(canonicalRepo),
    title,
    installed: args.installed,
    ...(details.sourceUrl ? { sourceUrl: details.sourceUrl } : {}),
    ...(details.repoUrl ? { repoUrl: details.repoUrl } : {}),
    ...(details.totalInstalls !== undefined ? { totalInstalls: details.totalInstalls } : {}),
    ...(details.starCount !== undefined ? { starCount: details.starCount } : {}),
    ...(details.skillCount !== undefined ? { skillCount: details.skillCount } : {}),
    ...(args.matchedSkillNames?.length ? { matchedSkillNames: args.matchedSkillNames } : {}),
    enrichState: { status: "ready" },
    previewState: { status: "idle" },
  };
}

export function parseSkillsSourcePage(html: string): {
  title?: string;
  skillCount?: number;
  totalInstalls?: number;
  repoUrl?: string;
  repoLabel?: string;
} {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<!-- -->\/<!-- -->([^<]+)<\/h1>/i);
  const skillCountMatch = html.match(/>(\d+)<!-- -->\s*<!-- -->skills</i);
  const totalInstallsMatch = html.match(/>([\d.]+[KMB]?)<!-- --> total installs</i);
  const repoUrlMatch = html.match(/href="(https:\/\/github\.com\/[^"]+)"/i);

  const repoUrl = repoUrlMatch?.[1];
  const repo = repoUrl ? parseGitHubRepo(repoUrl) : null;
  const title = titleMatch?.[2]?.trim();

  return {
    ...(title ? { title } : {}),
    ...(skillCountMatch?.[1] ? { skillCount: Number.parseInt(skillCountMatch[1], 10) } : {}),
    ...(totalInstallsMatch?.[1] ? { totalInstalls: parseCompactNumber(totalInstallsMatch[1]) } : {}),
    ...(repoUrl ? { repoUrl } : {}),
    ...(repo ? { repoLabel: `${repo.owner}/${repo.repo}`.toLowerCase() } : {}),
  };
}

export function parseSkillsSourceSkillList(
  html: string,
  canonicalRepo: string,
): SkillsDirectoryPreviewSkill[] {
  const escapedRepo = canonicalRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`href="/${escapedRepo}/([^"/?#]+)"`, "gi");
  const seen = new Set<string>();
  const skills: SkillsDirectoryPreviewSkill[] = [];

  for (const match of html.matchAll(regex)) {
    const slug = match[1]?.trim();
    if (!slug || slug === "opengraph-image" || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    skills.push({
      id: slug,
      title: slug,
      summary: "",
    });
  }

  return skills;
}

function applyImportRepoAlias(repo: string): string {
  return IMPORT_REPO_ALIASES.get(repo) ?? repo;
}

function parseCompactNumber(value: string): number {
  const trimmed = value.trim().toUpperCase();
  const suffix = trimmed.slice(-1);
  const base = Number.parseFloat(["K", "M", "B"].includes(suffix) ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(base)) {
    return 0;
  }

  switch (suffix) {
    case "K":
      return Math.round(base * 1_000);
    case "M":
      return Math.round(base * 1_000_000);
    case "B":
      return Math.round(base * 1_000_000_000);
    default:
      return Math.round(base);
  }
}

function createProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
