import fs from "node:fs/promises";
import path from "node:path";
import type { DuplicateLeafRecord, InvalidLeafRecord, LeafRecord } from "@skill-flow/domain/types";
import { hashDirectory, pathExists, slugify } from "@skill-flow/integration/utils/fs";

type InventoryScan = {
  leafs: LeafRecord[];
  invalidLeafs: InvalidLeafRecord[];
  duplicateLeafs: DuplicateLeafRecord[];
  skillFileCount: number;
};

type ParsedSkillFile =
  | {
      valid: true;
      name: string;
      title: string;
      description: string;
      metadataWarnings: string[];
    }
  | { valid: false; reason: string };

export class InventoryService {
  private static readonly IGNORED_DIRECTORIES = new Set([
    ".git",
    "node_modules",
  ]);
  private static readonly PRIORITY_SKILL_DIRECTORIES = [
    "skills",
    "skills/.curated",
    "skills/.experimental",
    "skills/.system",
    ".agents/skills",
    ".claude/skills",
    ".cline/skills",
    ".codebuddy/skills",
    ".codex/skills",
    ".commandcode/skills",
    ".continue/skills",
    ".github/skills",
    ".goose/skills",
    ".iflow/skills",
    ".junie/skills",
    ".kilocode/skills",
    ".kiro/skills",
    ".mux/skills",
    ".neovate/skills",
    ".opencode/skills",
    ".openhands/skills",
    ".pi/skills",
    ".qoder/skills",
    ".roo/skills",
    ".trae/skills",
    ".windsurf/skills",
    ".zencoder/skills",
  ] as const;

  async scanSource(
    sourceId: string,
    checkoutPath: string,
    rootLinkName = sourceId,
  ): Promise<InventoryScan> {
    const skillFiles = await this.findSkillFiles(checkoutPath);
    const candidates: Array<LeafRecord & { dedupeKey: string }> = [];
    const invalidLeafs: InvalidLeafRecord[] = [];
    const duplicateLeafs: DuplicateLeafRecord[] = [];

    for (const skillFilePath of skillFiles) {
      const leafRoot = path.dirname(skillFilePath);
      const relativePath = path.relative(checkoutPath, leafRoot) || ".";
      const raw = await fs.readFile(skillFilePath, "utf8");
      const linkName =
        relativePath === "."
          ? rootLinkName
          : (path.basename(leafRoot) || rootLinkName);
      const parsed = this.parseSkillFile(raw, linkName);

      if (!parsed.valid) {
        invalidLeafs.push({
          path: relativePath,
          reason: parsed.reason,
        });
        continue;
      }

      const safeName = slugify(parsed.name) || linkName || sourceId;

      candidates.push({
        id: `${sourceId}:${relativePath}`,
        sourceId,
        name: safeName,
        linkName,
        title: parsed.title,
        description: parsed.description,
        relativePath,
        absolutePath: leafRoot,
        skillFilePath,
        contentHash: await hashDirectory(leafRoot),
        metadataWarnings: parsed.metadataWarnings,
        valid: true,
        dedupeKey: parsed.name,
      });
    }

    const leafs = this.dedupeCandidates(candidates, duplicateLeafs);
    leafs.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    duplicateLeafs.sort((left, right) => left.path.localeCompare(right.path));
    invalidLeafs.sort((left, right) => left.path.localeCompare(right.path));

    return {
      leafs,
      invalidLeafs,
      duplicateLeafs,
      skillFileCount: skillFiles.length,
    };
  }

  private async findSkillFiles(rootPath: string): Promise<string[]> {
    const discovered: string[] = [];
    const seen = new Set<string>();

    const rootSkillPath = path.join(rootPath, "SKILL.md");
    if (await pathExists(rootSkillPath)) {
      discovered.push(rootSkillPath);
      seen.add(rootSkillPath);
      return discovered;
    }

    for (const relativePath of InventoryService.PRIORITY_SKILL_DIRECTORIES) {
      await this.collectDirectChildSkillFiles(path.join(rootPath, relativePath), discovered, seen);
    }

    if (discovered.length > 0) {
      return discovered;
    }

    await this.walkSkillTree(rootPath, discovered, seen, 0);

    return discovered;
  }

  private async collectDirectChildSkillFiles(
    currentPath: string,
    discovered: string[],
    seen: Set<string>,
  ): Promise<void> {
    if (!(await pathExists(currentPath))) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const directories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !InventoryService.IGNORED_DIRECTORIES.has(entry.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of directories) {
      const skillFilePath = path.join(currentPath, entry.name, "SKILL.md");
      if (!(await pathExists(skillFilePath)) || seen.has(skillFilePath)) {
        continue;
      }
      seen.add(skillFilePath);
      discovered.push(skillFilePath);
    }
  }

  private async walkSkillTree(
    currentPath: string,
    discovered: string[],
    seen: Set<string>,
    depth: number,
  ): Promise<void> {
    if (depth > 5 || !(await pathExists(currentPath))) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .sort((left, right) => left.name.localeCompare(right.name));
    const visibleDirectories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !InventoryService.IGNORED_DIRECTORIES.has(entry.name) &&
          !entry.name.startsWith("."),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    const hiddenDirectories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !InventoryService.IGNORED_DIRECTORIES.has(entry.name) &&
          entry.name.startsWith("."),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of files) {
      if (entry.name !== "SKILL.md") {
        continue;
      }

      const skillFilePath = path.join(currentPath, entry.name);
      if (seen.has(skillFilePath)) {
        continue;
      }
      seen.add(skillFilePath);
      discovered.push(skillFilePath);
    }

    for (const entry of [...visibleDirectories, ...hiddenDirectories]) {
      await this.walkSkillTree(path.join(currentPath, entry.name), discovered, seen, depth + 1);
    }
  }

  private parseSkillFile(raw: string, parentDirName: string): ParsedSkillFile {
    const lines = raw.split(/\r?\n/);
    const frontmatter = this.parseFrontmatter(lines);
    if (!frontmatter) {
      return { valid: false, reason: "SKILL.md must start with YAML frontmatter" };
    }

    if (!Object.hasOwn(frontmatter.data, "name")) {
      return {
        valid: false,
        reason: "SKILL.md frontmatter must include required field 'name'",
      };
    }

    if (!Object.hasOwn(frontmatter.data, "description")) {
      return {
        valid: false,
        reason: "SKILL.md frontmatter must include required field 'description'",
      };
    }

    const bodyLines = lines.slice(frontmatter.bodyStartLine);
    const firstHeading = bodyLines.find((line) => line.trim().startsWith("# "));
    const rawName = (frontmatter.data.name ?? "").trim();
    const rawDescription = frontmatter.data.description ?? "";
    const metadataWarnings: string[] = [];

    if (
      rawName.length < 1 ||
      rawName.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawName)
    ) {
      metadataWarnings.push(
        "name should be 1-64 chars, lowercase letters/numbers/hyphens only, with no leading/trailing hyphen or consecutive '--'",
      );
    }

    if (rawName !== parentDirName) {
      metadataWarnings.push(
        `name should match parent directory name '${parentDirName}'`,
      );
    }

    if (rawDescription.trim().length === 0) {
      metadataWarnings.push("description should be non-empty");
    }

    if (rawDescription.length > 1024) {
      metadataWarnings.push("description should be at most 1024 characters");
    }

    const title = firstHeading?.trim().slice(2).trim() || rawName || "Untitled skill";

    return {
      valid: true,
      name: rawName,
      title,
      description: rawDescription.trim(),
      metadataWarnings,
    };
  }

  private dedupeCandidates(
    candidates: Array<LeafRecord & { dedupeKey: string }>,
    duplicateLeafs: DuplicateLeafRecord[],
  ): LeafRecord[] {
    const keptByKey = new Map<string, LeafRecord>();
    for (const candidate of candidates) {
      if (keptByKey.has(candidate.dedupeKey)) {
        const kept = keptByKey.get(candidate.dedupeKey)!;
        duplicateLeafs.push({
          path: candidate.relativePath,
          keptPath: kept.relativePath,
        });
        continue;
      }
      const { dedupeKey: _dedupeKey, ...leaf } = candidate;
      keptByKey.set(candidate.dedupeKey, leaf);
    }

    return [...keptByKey.values()];
  }

  private parseFrontmatter(
    lines: string[],
  ): { data: Record<string, string>; bodyStartLine: number } | undefined {
    if (lines[0]?.trim() !== "---") {
      return undefined;
    }

    const data: Record<string, string> = {};
    let index = 1;

    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (line.trim() === "---") {
        return { data, bodyStartLine: index + 1 };
      }

      const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!pair) {
        index += 1;
        continue;
      }

      const key = pair[1];
      const rest = pair[2];
      if (!key || rest === undefined) {
        index += 1;
        continue;
      }

      if (rest === "|" || rest === ">") {
        const blockLines: string[] = [];
        index += 1;
        while (index < lines.length) {
          const blockLine = lines[index] ?? "";
          if (blockLine.length === 0) {
            blockLines.push("");
            index += 1;
            continue;
          }
          if (!blockLine.startsWith("  ")) {
            break;
          }
          blockLines.push(blockLine.slice(2));
          index += 1;
        }
        data[key] = blockLines.join("\n").trim();
        continue;
      }

      data[key] = rest.trim();
      index += 1;
    }

    return undefined;
  }
}
