import type {
  ImportGroupCandidate,
  ImportRecommendationFeedId,
  ImportSearchHit,
  SourceStats,
  UnifiedSourceOwner,
  UnifiedSourceSkill,
  UnifiedSourceSnapshot,
  UnifiedSourceTrust,
} from "../domain/types.js";
import { fetchGitHubRepoDetails } from "./github-catalog.js";
import { parseGitHubRepo } from "./naming.js";

const SKILLS_DIRECTORY_BASE_URL = "https://skills.sh";
export const IMPORT_SEARCH_CACHE_TTL_MS = 5 * 60_000;
export const IMPORT_SOURCE_CACHE_TTL_MS = 5 * 60_000;
export const IMPORT_RECOMMENDATION_CACHE_TTL_MS = 5 * 60_000;
export const IMPORT_GITHUB_ENRICH_TTL_MS = 30 * 60_000;
export const IMPORT_DIRECTORY_CACHE_TTL_MS = IMPORT_SOURCE_CACHE_TTL_MS;

const IMPORT_REPO_ALIASES = new Map<string, string>([
  ["anthropic/skills", "anthropics/skills"],
]);

const FEED_PATHS: Record<Exclude<ImportRecommendationFeedId, "seed">, string> = {
  official: "/official",
  trending: "/trending",
  hot: "/hot",
  audits: "/audits",
};

export type SkillsDirectorySearchHit = ImportSearchHit;

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
  matchedSkills: Array<{
    skillId: string;
    title: string;
    installs?: number;
  }>;
};

export type SkillsDirectorySourceSkill = {
  skillId: string;
  title: string;
  installs?: number;
};

export type SkillsDirectorySourcePage = {
  title?: string;
  skillCount?: number;
  totalInstalls?: number;
  repoUrl?: string;
  repoLabel?: string;
  skills: SkillsDirectorySourceSkill[];
};

export type SkillsDirectoryOwnerPage = {
  slug: string;
  sourceUrl: string;
  githubUrl?: string;
  sourceCount?: number;
  skillCount?: number;
  totalInstalls?: number;
};

export type SkillsDirectorySkillDetail = {
  skillId: string;
  title: string;
  summary?: string;
  weeklyInstalls?: number;
  repoLabel?: string;
  repoUrl?: string;
  repoStars?: number;
  firstSeen?: string;
  audits?: UnifiedSourceSkill["audits"];
  installedOn?: UnifiedSourceSkill["installedOn"];
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
      title: skill.name,
      ...(typeof skill.installs === "number" ? { installs: skill.installs } : {}),
      source: skill.source,
      canonicalRepo,
    } satisfies SkillsDirectorySearchHit];
  });
}

export function groupSkillsDirectorySearchHits(
  hits: SkillsDirectorySearchHit[],
): SkillsDirectoryGroupedResult[] {
  const grouped = new Map<string, Map<string, SkillsDirectoryGroupedResult["matchedSkills"][number]>>();

  for (const hit of hits) {
    const skillsById = grouped.get(hit.canonicalRepo) ?? new Map();
    skillsById.set(hit.skillId, {
      skillId: hit.skillId,
      title: hit.title,
      ...(hit.installs !== undefined ? { installs: hit.installs } : {}),
    });
    grouped.set(hit.canonicalRepo, skillsById);
  }

  return [...grouped.entries()].map(([canonicalRepo, skillsById]) => {
    const matchedSkills = [...skillsById.values()]
      .sort((left, right) => {
        const installDiff = (right.installs ?? -1) - (left.installs ?? -1);
        return installDiff !== 0 ? installDiff : left.title.localeCompare(right.title);
      });

    return {
      canonicalRepo,
      matchedSkillNames: matchedSkills.map((skill) => skill.title),
      matchedSkills,
    };
  });
}

export async function fetchSkillsDirectorySourceSnapshot(
  locator: string,
  options?: {
    enrichSkillIds?: string[];
    trust?: UnifiedSourceTrust;
  },
): Promise<UnifiedSourceSnapshot> {
  const canonicalRepo = normalizeImportCanonicalRepo(locator);
  if (!canonicalRepo) {
    throw createProviderError("SKILLS_SOURCE_NOT_SUPPORTED", `Unsupported locator '${locator}'.`);
  }

  const sourceUrl = `${SKILLS_DIRECTORY_BASE_URL}/${canonicalRepo}`;
  const ownerSlug = canonicalRepo.split("/")[0] ?? "";
  const ownerUrl = `${SKILLS_DIRECTORY_BASE_URL}/${ownerSlug}`;
  const [sourceHtml, ownerHtml, repoDetails] = await Promise.all([
    fetchSkillsDirectoryHtml(sourceUrl, "source"),
    fetchSkillsDirectoryHtml(ownerUrl, "owner"),
    fetchGitHubRepoDetails(canonicalRepo).catch(() => ({} as SourceStats)),
  ]);

  const sourcePage = parseSkillsSourcePage(sourceHtml);
  if (sourcePage.totalInstalls === undefined || sourcePage.skills.length === 0) {
    throw createProviderError(
      "SKILLS_SOURCE_PARSE_FAILED",
      "skills.sh source page payload was missing skill entries.",
    );
  }

  const owner = parseSkillsOwnerPage(ownerHtml, ownerSlug);
  const skillIdsToEnrich = resolveSkillIdsToEnrich(sourcePage.skills, options?.enrichSkillIds);
  const enrichedSkillDetails = await Promise.all(
    skillIdsToEnrich.map(async (skillId) => {
      try {
        const html = await fetchSkillsDirectoryHtml(`${sourceUrl}/${encodeURIComponent(skillId)}`, "skill");
        return parseSkillsSkillPage(html, canonicalRepo, skillId);
      } catch {
        return undefined;
      }
    }),
  );

  const enrichedSkillMap = new Map(
    enrichedSkillDetails
      .flatMap((detail) => detail ? [[detail.skillId, detail] as const] : []),
  );

  const skills: UnifiedSourceSkill[] = sourcePage.skills.map((skill) => {
    const detail = enrichedSkillMap.get(skill.skillId);
    return {
      skillId: skill.skillId,
      title: skill.title,
      ...(skill.installs !== undefined ? { installs: skill.installs } : {}),
      ...(detail?.weeklyInstalls !== undefined ? { weeklyInstalls: detail.weeklyInstalls } : {}),
      ...(detail?.firstSeen ? { firstSeen: detail.firstSeen } : {}),
      ...(detail?.summary ? { summary: detail.summary } : {}),
      ...(detail?.installedOn?.length ? { installedOn: detail.installedOn } : {}),
      ...(detail?.audits ? { audits: detail.audits } : {}),
    };
  });

  const repoUrl = sourcePage.repoUrl ?? repoDetails.repoUrl ?? `https://github.com/${canonicalRepo}`;
  const repoLabel = sourcePage.repoLabel ?? repoDetails.repoLabel ?? canonicalRepo;

  return {
    canonicalRepo,
    aliases: buildImportRepoAliases(canonicalRepo),
    title: sourcePage.title ?? canonicalRepo.split("/")[1] ?? canonicalRepo,
    provider: "skills",
    sourceUrl,
    repoUrl,
    repoLabel,
    ...(sourcePage.totalInstalls !== undefined ? { totalInstalls: sourcePage.totalInstalls } : {}),
    ...(sourcePage.skillCount !== undefined ? { skillCount: sourcePage.skillCount } : {}),
    ...(repoDetails.starCount !== undefined ? { repoStars: repoDetails.starCount } : {}),
    ...(repoDetails.forkCount !== undefined ? { forkCount: repoDetails.forkCount } : {}),
    ...(repoDetails.description ? { description: repoDetails.description } : {}),
    ...(repoDetails.topics?.length ? { topics: repoDetails.topics } : {}),
    ...(repoDetails.language ? { language: repoDetails.language } : {}),
    ...(repoDetails.defaultBranch ? { defaultBranch: repoDetails.defaultBranch } : {}),
    ...(repoDetails.pushedAt ? { pushedAt: repoDetails.pushedAt } : {}),
    owner,
    skills,
    ...(options?.trust && hasTrustSignals(options.trust) ? { trust: options.trust } : {}),
  };
}

export async function fetchSkillsDirectoryFeedGroups(
  feedId: Exclude<ImportRecommendationFeedId, "seed">,
): Promise<string[]> {
  const response = await fetch(`${SKILLS_DIRECTORY_BASE_URL}${FEED_PATHS[feedId]}`);
  if (!response.ok) {
    throw createProviderError(
      response.status === 429 ? "SKILLS_FEED_RATE_LIMITED" : "SKILLS_FEED_REQUEST_FAILED",
      `skills.sh feed request failed with ${response.status}.`,
    );
  }

  const html = await response.text();
  switch (feedId) {
    case "official":
      return extractOfficialFeedRepos(html);
    case "trending":
    case "hot":
    case "audits":
      return extractFeedSourceRepos(html);
  }
}

export function buildImportGroupCandidate(
  args: {
    canonicalRepo: string;
    locator?: string;
    installed: boolean;
    matchedSkills?: Array<{
      skillId: string;
      title: string;
      installs?: number;
    }>;
    snapshot?: UnifiedSourceSnapshot;
  },
): ImportGroupCandidate {
  const canonicalRepo = normalizeImportCanonicalRepo(args.canonicalRepo) ?? args.canonicalRepo;
  const locator = args.locator ?? canonicalRepo;
  const snapshot = args.snapshot;
  const title = snapshot?.title ?? canonicalRepo.split("/")[1] ?? canonicalRepo;
  const matchedSkills = args.matchedSkills?.length ? args.matchedSkills : undefined;

  return {
    id: canonicalRepo,
    provider: "skills",
    locator,
    canonicalRepo,
    aliases: snapshot?.aliases ?? buildImportRepoAliases(canonicalRepo),
    title,
    installed: args.installed,
    ...(snapshot?.description ? { summary: snapshot.description } : {}),
    ...(snapshot?.sourceUrl ? { sourceUrl: snapshot.sourceUrl } : {}),
    ...(snapshot?.repoUrl ? { repoUrl: snapshot.repoUrl } : {}),
    ...(snapshot?.repoStars !== undefined ? { starCount: snapshot.repoStars } : {}),
    ...(snapshot?.totalInstalls !== undefined ? { totalInstalls: snapshot.totalInstalls } : {}),
    ...(snapshot?.skillCount !== undefined ? { skillCount: snapshot.skillCount } : {}),
    ...(matchedSkills?.length ? { matchedSkillNames: matchedSkills.map((skill) => skill.title) } : {}),
    ...(matchedSkills?.length ? { matchedSkills } : {}),
    ...(snapshot ? { snapshot } : {}),
    enrichState: { status: "ready" },
    previewState: { status: "idle" },
  };
}

export function parseSkillsSourcePage(html: string): SkillsDirectorySourcePage {
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
    skills: parseSkillsSourceSkillList(html, repo?.owner && repo?.repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : undefined),
  };
}

export function parseSkillsOwnerPage(
  html: string,
  ownerSlug: string,
): UnifiedSourceOwner {
  const sourceCountMatch = html.match(/>(\d+)<!-- -->\s*<!-- -->sources</i);
  const skillCountMatch = html.match(/>(\d+)<!-- --> skills</i);
  const totalInstallsMatch = html.match(/>([\d.]+[KMB]?)<!-- -->\s*<!-- -->total installs</i);
  const githubUrlMatch = html.match(/href="(https:\/\/github\.com\/[^"]+)"[^>]*class="flex items-center gap-1 whitespace-nowrap"/i);

  return {
    slug: ownerSlug,
    sourceUrl: `${SKILLS_DIRECTORY_BASE_URL}/${ownerSlug}`,
    ...(githubUrlMatch?.[1] ? { githubUrl: githubUrlMatch[1] } : {}),
    ...(sourceCountMatch?.[1] ? { sourceCount: Number.parseInt(sourceCountMatch[1], 10) } : {}),
    ...(skillCountMatch?.[1] ? { skillCount: Number.parseInt(skillCountMatch[1], 10) } : {}),
    ...(totalInstallsMatch?.[1] ? { totalInstalls: parseCompactNumber(totalInstallsMatch[1]) } : {}),
  };
}

export function parseSkillsSkillPage(
  html: string,
  canonicalRepo: string,
  skillId: string,
): SkillsDirectorySkillDetail {
  const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? skillId;
  const summary = html.match(/<div class="\[&amp;_.prose\][^"]*"><div class="prose[^"]*"><p>(.*?)<\/p>/is)?.[1];
  const weeklyInstalls = html.match(/Weekly Installs<\/span><\/div><div class="text-3xl[^"]*">([^<]+)</i)?.[1];
  const repoLinkMatch = html.match(/title="([^"]+\/[^"]+)"[^>]*>([^<]+\/[^<]+)<\/a>/i);
  const starMatch = html.match(/GitHub Stars<\/span><\/div><div[^>]*><div[^>]*><svg[^>]*><[^>]+><span>([^<]+)<\/span>/i);
  const firstSeen = html.match(/First Seen<\/span><\/div><div class="text-sm font-mono text-foreground">([^<]+)<\/div>/i)?.[1];

  const installedOn = [...html.matchAll(
    /<div class="flex items-center justify-between text-sm py-2"><span class="text-foreground">([^<]+)<\/span><span class="text-muted-foreground font-mono">([^<]+)<\/span><\/div>/gi,
  )].map((match) => ({
    agent: match[1]!.trim(),
    installs: parseCompactNumber(match[2]!),
  }));

  const auditRows = [...html.matchAll(
    /<span class="text-sm font-medium text-foreground truncate">([^<]+)<\/span><span class="text-xs font-mono uppercase[^"]*">([^<]+)<\/span>/gi,
  )];
  const audits = auditRows.reduce<NonNullable<UnifiedSourceSkill["audits"]>>((result, match) => {
    const label = match[1]!.trim();
    const value = match[2]!.trim();
    if (label === "Gen Agent Trust Hub") {
      result.gen = value;
    } else if (label === "Socket") {
      result.socket = value;
    } else if (label === "Snyk") {
      result.snyk = value;
      result.riskLevel = value;
    }
    return result;
  }, {});

  return {
    skillId,
    title,
    ...(summary ? { summary: decodeHtml(stripTags(summary)).trim() } : {}),
    ...(weeklyInstalls ? { weeklyInstalls: parseCompactNumber(weeklyInstalls) } : {}),
    ...(repoLinkMatch?.[1] ? { repoLabel: repoLinkMatch[1] } : { repoLabel: canonicalRepo }),
    ...(repoLinkMatch?.[2] ? { repoUrl: `https://github.com/${repoLinkMatch[2]}` } : {}),
    ...(starMatch?.[1] ? { repoStars: parseCompactNumber(starMatch[1]) } : {}),
    ...(firstSeen ? { firstSeen: firstSeen.trim() } : {}),
    ...(Object.keys(audits).length > 0 ? { audits } : {}),
    ...(installedOn.length > 0 ? { installedOn } : {}),
  };
}

export function parseSkillsSourceSkillList(
  html: string,
  canonicalRepo?: string,
): SkillsDirectorySourceSkill[] {
  const escapedRepo = canonicalRepo?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "[^\"/]+/[^\"/]+";
  const regex = new RegExp(
    `<a[^>]+href="/${escapedRepo}/([^"/?#]+)"[^>]*>.*?<h3[^>]*>([^<]+)</h3>.*?<span[^>]*class="font-mono text-sm text-foreground"[^>]*>([^<]+)</span>`,
    "gis",
  );
  const seen = new Set<string>();
  const skills: SkillsDirectorySourceSkill[] = [];

  for (const match of html.matchAll(regex)) {
    const skillId = match[1]?.trim();
    const title = match[2]?.trim();
    const installsValue = match[3]?.trim();
    if (!skillId || !title || skillId === "opengraph-image" || seen.has(skillId)) {
      continue;
    }

    seen.add(skillId);
    skills.push({
      skillId,
      title,
      ...(installsValue ? { installs: parseCompactNumber(installsValue) } : {}),
    });
  }

  return skills;
}

function resolveSkillIdsToEnrich(
  skills: SkillsDirectorySourceSkill[],
  requestedSkillIds?: string[],
): string[] {
  const prioritized = [...skills]
    .sort((left, right) => {
      const diff = (right.installs ?? -1) - (left.installs ?? -1);
      return diff !== 0 ? diff : left.skillId.localeCompare(right.skillId);
    })
    .slice(0, 3)
    .map((skill) => skill.skillId);

  return [...new Set([...(requestedSkillIds ?? []), ...prioritized])];
}

export function extractOfficialFeedRepos(html: string): string[] {
  const repos = new Set<string>();
  for (const match of html.matchAll(/"repo":"([^"]+\/[^"]+)"/g)) {
    const canonicalRepo = normalizeImportCanonicalRepo(match[1]!);
    if (canonicalRepo) {
      repos.add(canonicalRepo);
    }
  }
  return [...repos];
}

export function extractFeedSourceRepos(html: string): string[] {
  const repos = new Set<string>();
  for (const match of html.matchAll(/"source":"([^"]+)"/g)) {
    const canonicalRepo = normalizeImportCanonicalRepo(decodeJsonString(match[1]!));
    if (canonicalRepo) {
      repos.add(canonicalRepo);
    }
  }
  return [...repos];
}

async function fetchSkillsDirectoryHtml(
  url: string,
  kind: "source" | "owner" | "skill",
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw createProviderError(
        kind === "source" ? "SKILLS_SOURCE_NOT_FOUND" : "SKILLS_PAGE_NOT_FOUND",
        `skills.sh ${kind} page request failed with ${response.status}.`,
      );
    }
    throw createProviderError(
      response.status === 429 ? "SKILLS_SOURCE_RATE_LIMITED" : "SKILLS_SOURCE_REQUEST_FAILED",
      `skills.sh ${kind} page request failed with ${response.status}.`,
    );
  }

  return response.text();
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

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x26;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

function decodeJsonString(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\u0026/g, "&").replace(/\\\\/g, "\\");
}

function hasTrustSignals(trust: UnifiedSourceTrust): boolean {
  return trust.official === true || trust.trending === true || trust.hot === true || trust.audited === true;
}

function createProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
