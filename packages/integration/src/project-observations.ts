import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ProjectObservation = {
  tool: "claude-code" | "codex" | "gemini-cli" | "opencode";
  projectId: string;
  title: string;
  observedAt: string;
  projectPath?: string;
};

export type CodexSessionLike = {
  session_meta?: {
    payload?: {
      cwd?: string;
      git?: { repository_url?: string };
    };
  };
  observedAt?: string;
};

type SessionPayload = {
  cwd?: string;
  git?: { repository_url?: string };
};

function normalizeProjectPath(inputPath: string | undefined): string | null {
  if (!inputPath) {
    return null;
  }
  const normalized = path.normalize(inputPath).replace(/[\\/]+$/, "");
  return normalized || null;
}

function basenameMaybe(inputPath: string | undefined): string | null {
  const normalizedPath = normalizeProjectPath(inputPath);
  if (!normalizedPath) {
    return null;
  }
  const base = path.basename(normalizedPath);
  return base || null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function repositoryUrlToProjectId(repositoryUrl: string): string | null {
  // Accept common Git URL forms and extract the first 2 path segments.
  let rawPath: string | null = null;

  if (/^https?:\/\//i.test(repositoryUrl)) {
    try {
      const url = new URL(repositoryUrl);
      rawPath = url.pathname;
    } catch {
      rawPath = null;
    }
  } else {
    const scpLike = repositoryUrl.match(/^[^@]+@[^:]+:(.+)$/);
    if (scpLike) {
      rawPath = `/${scpLike[1]}`;
    }
  }

  if (!rawPath) {
    return null;
  }

  const cleaned = rawPath.replace(/\.git$/i, "").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function deriveProjectIdentity(args: {
  repositoryUrl: string | undefined;
  projectPath: string | undefined;
}): { projectId: string; title: string } | null {
  const projectPath = normalizeProjectPath(args.projectPath);
  const repositoryProjectId = args.repositoryUrl
    ? repositoryUrlToProjectId(args.repositoryUrl)
    : null;
  const projectId = repositoryProjectId ?? projectPath;

  if (!projectId) {
    return null;
  }

  return {
    projectId,
    title: basenameMaybe(projectPath ?? projectId) ?? projectId,
  };
}

export function collectProjectObservationsFromCodexSessions(
  codexSessions: CodexSessionLike[],
): ProjectObservation[] {
  return collectProjectObservationsFromSessionPayloads(
    codexSessions.map((session) => ({
      ...(session.session_meta?.payload
        ? { payload: session.session_meta.payload }
        : {}),
      ...(session.observedAt ? { observedAt: session.observedAt } : {}),
    })),
    "codex",
  );
}

function collectProjectObservationsFromSessionPayloads(
  sessions: Array<{ payload?: SessionPayload; observedAt?: string }>,
  tool: ProjectObservation["tool"],
): ProjectObservation[] {
  return sessions
    .map((session) => {
      const payload = session.payload;
      const observedAt =
        toIsoString(session.observedAt) ?? new Date(0).toISOString();
      const project = deriveProjectIdentity({
        repositoryUrl: payload?.git?.repository_url,
        projectPath: payload?.cwd,
      });

      if (!project) {
        return null;
      }

      return {
        tool,
        projectId: project.projectId,
        title: project.title,
        observedAt,
        ...(payload?.cwd ? { projectPath: payload.cwd } : {}),
      } satisfies ProjectObservation;
    })
    .filter((observation): observation is ProjectObservation => observation !== null);
}

async function readDirSafe(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function statMtimeIso(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

async function collectFilesMatching(
  rootDir: string,
  matcher: (filePath: string) => boolean,
  maxDepth = 4,
): Promise<string[]> {
  async function visit(currentDir: string, depth: number): Promise<string[]> {
    if (depth > maxDepth) {
      return [];
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const matches: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        matches.push(...(await visit(entryPath, depth + 1)));
        continue;
      }
      if (entry.isFile() && matcher(entryPath)) {
        matches.push(entryPath);
      }
    }

    return matches;
  }

  return visit(rootDir, 0);
}

async function readSessionPayloadFromJsonl(filePath: string): Promise<{
  payload?: SessionPayload;
  observedAt?: string;
} | null> {
  const content = await readFileSafe(filePath);
  if (!content) {
    return null;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        payload?: unknown;
        cwd?: string;
        git?: { repository_url?: string };
        timestamp?: string;
      };
      if (parsed.type === "session_meta" && parsed.payload && typeof parsed.payload === "object") {
        const observedAt = (await statMtimeIso(filePath)) ?? null;
        return {
          payload: parsed.payload as SessionPayload,
          ...(observedAt ? { observedAt } : {}),
        };
      }
      if (typeof parsed.cwd === "string" || typeof parsed.git?.repository_url === "string") {
        const observedAt = toIsoString(parsed.timestamp) ?? (await statMtimeIso(filePath)) ?? null;
        return {
          payload: {
            ...(typeof parsed.cwd === "string" ? { cwd: parsed.cwd } : {}),
            ...(typeof parsed.git?.repository_url === "string"
              ? { git: { repository_url: parsed.git.repository_url } }
              : {}),
          },
          ...(observedAt ? { observedAt } : {}),
        };
      }
    } catch {
      // Ignore malformed lines.
    }
  }

  return null;
}

async function collectCodexObservations(homeDir: string): Promise<ProjectObservation[]> {
  const sessionsDir = path.join(homeDir, ".codex", "archived_sessions");
  const entries = await readDirSafe(sessionsDir);
  const jsonlFiles = entries.filter((entry) => entry.endsWith(".jsonl"));

  const sessions: Array<{ payload?: SessionPayload; observedAt?: string }> = [];
  for (const fileName of jsonlFiles) {
    const filePath = path.join(sessionsDir, fileName);
    const session = await readSessionPayloadFromJsonl(filePath);
    if (!session?.payload) {
      continue;
    }
    sessions.push(session);
  }

  return collectProjectObservationsFromSessionPayloads(sessions, "codex");
}

type ClaudeLogLine = {
  timestamp?: string;
  cwd?: string;
  git?: { repository_url?: string };
};

async function collectClaudeObservations(homeDir: string): Promise<ProjectObservation[]> {
  const projectsRoot = path.join(homeDir, ".claude", "projects");
  const projectDirs = await readDirSafe(projectsRoot);

  const observations: ProjectObservation[] = [];
  for (const projectDir of projectDirs) {
    const sessionsDir = path.join(projectsRoot, projectDir);
    const sessionFiles = (await readDirSafe(sessionsDir)).filter((f) => f.endsWith(".jsonl"));

    for (const fileName of sessionFiles) {
      const filePath = path.join(sessionsDir, fileName);
      const content = await readFileSafe(filePath);
      if (!content) continue;

      let lastTimestamp: string | null = null;
      let lastCwd: string | null = null;
      let lastRepoUrl: string | null = null;
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as ClaudeLogLine;
          const ts = toIsoString(parsed.timestamp);
          if (ts) lastTimestamp = ts;
          if (typeof parsed.cwd === "string") lastCwd = parsed.cwd;
          const repoUrl = parsed.git?.repository_url;
          if (typeof repoUrl === "string") lastRepoUrl = repoUrl;
        } catch {
          // Ignore malformed lines.
        }
      }

      const observedAt =
        lastTimestamp ?? (await statMtimeIso(filePath)) ?? new Date(0).toISOString();
      const project = deriveProjectIdentity({
        repositoryUrl: lastRepoUrl ?? undefined,
        projectPath: lastCwd ?? undefined,
      });
      if (!project) continue;

      observations.push({
        tool: "claude-code",
        projectId: project.projectId,
        title: project.title,
        observedAt,
        ...(lastCwd ? { projectPath: lastCwd } : {}),
      });
    }
  }

  return observations;
}

async function collectGeminiObservations(homeDir: string): Promise<ProjectObservation[]> {
  const historyRoot = path.join(homeDir, ".gemini", "history");
  const entries = await readDirSafe(historyRoot);

  const observations: ProjectObservation[] = [];
  for (const entry of entries) {
    const projectRootFile = path.join(historyRoot, entry, ".project_root");
    const content = await readFileSafe(projectRootFile);
    if (!content) continue;

    const projectRoot = normalizeProjectPath(content.trim());
    if (!projectRoot) continue;

    observations.push({
      tool: "gemini-cli",
      projectId: projectRoot,
      title: basenameMaybe(projectRoot) ?? projectRoot,
      observedAt: (await statMtimeIso(projectRootFile)) ?? new Date(0).toISOString(),
      projectPath: projectRoot,
    });
  }

  return observations;
}

async function collectOpencodeObservations(_homeDir: string): Promise<ProjectObservation[]> {
  const candidateRoots = [
    path.join(_homeDir, ".config", "opencode"),
    path.join(_homeDir, ".opencode"),
  ];
  const observations: ProjectObservation[] = [];
  const seen = new Set<string>();

  for (const rootDir of candidateRoots) {
    const projectRootFiles = await collectFilesMatching(
      rootDir,
      (filePath) => path.basename(filePath) === ".project_root",
    );

    for (const filePath of projectRootFiles) {
      if (seen.has(filePath)) {
        continue;
      }
      seen.add(filePath);

      const content = await readFileSafe(filePath);
      const projectRoot = normalizeProjectPath(content?.trim());
      if (!projectRoot) {
        continue;
      }

      observations.push({
        tool: "opencode",
        projectId: projectRoot,
        title: basenameMaybe(projectRoot) ?? projectRoot,
        observedAt: (await statMtimeIso(filePath)) ?? new Date(0).toISOString(),
        projectPath: projectRoot,
      });
    }

    const jsonlFiles = await collectFilesMatching(
      rootDir,
      (filePath) => filePath.endsWith(".jsonl"),
    );
    const sessions = (
      await Promise.all(jsonlFiles.map((filePath) => readSessionPayloadFromJsonl(filePath)))
    ).filter((session): session is { payload?: SessionPayload; observedAt?: string } => session !== null);

    observations.push(...collectProjectObservationsFromSessionPayloads(sessions, "opencode"));
  }

  return observations;
}

export async function collectProjectObservations(
  homeDir = os.homedir(),
): Promise<ProjectObservation[]> {
  return [
    ...(await collectClaudeObservations(homeDir)),
    ...(await collectCodexObservations(homeDir)),
    ...(await collectGeminiObservations(homeDir)),
    ...(await collectOpencodeObservations(homeDir)),
  ];
}
