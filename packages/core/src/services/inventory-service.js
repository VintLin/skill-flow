import fs from "node:fs/promises";
import path from "node:path";
import { hashDirectory, pathExists, slugify } from "../utils/fs.js";
export class InventoryService {
    static IGNORED_DIRECTORIES = new Set([
        ".git",
        "node_modules",
    ]);
    async scanSource(sourceId, checkoutPath, rootLinkName = sourceId) {
        const skillFiles = await this.findSkillFiles(checkoutPath);
        const candidates = [];
        const invalidLeafs = [];
        const duplicateLeafs = [];
        for (const skillFilePath of skillFiles) {
            const leafRoot = path.dirname(skillFilePath);
            const relativePath = path.relative(checkoutPath, leafRoot) || ".";
            const raw = await fs.readFile(skillFilePath, "utf8");
            const linkName = relativePath === "."
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
                dedupeKey: `${parsed.name}\n${parsed.description}`,
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
    async findSkillFiles(rootPath) {
        const discovered = [];
        const seen = new Set();
        const rootSkillPath = path.join(rootPath, "SKILL.md");
        if (await pathExists(rootSkillPath)) {
            discovered.push(rootSkillPath);
            seen.add(rootSkillPath);
        }
        await this.walkSkillTree(path.join(rootPath, "skills"), discovered, seen, false);
        await this.walkSkillTree(path.join(rootPath, "skills", ".curated"), discovered, seen, true);
        await this.walkSkillTree(path.join(rootPath, "skills", ".experimental"), discovered, seen, true);
        await this.walkSkillTree(path.join(rootPath, "skills", ".system"), discovered, seen, true);
        await this.walkSkillTree(rootPath, discovered, seen, true);
        return discovered;
    }
    async walkSkillTree(currentPath, discovered, seen, includeHiddenDirectories) {
        if (!(await pathExists(currentPath))) {
            return;
        }
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        const files = entries
            .filter((entry) => entry.isFile())
            .sort((left, right) => left.name.localeCompare(right.name));
        const visibleDirectories = entries
            .filter((entry) => entry.isDirectory() &&
            !InventoryService.IGNORED_DIRECTORIES.has(entry.name) &&
            !entry.name.startsWith("."))
            .sort((left, right) => left.name.localeCompare(right.name));
        const hiddenDirectories = includeHiddenDirectories
            ? entries
                .filter((entry) => entry.isDirectory() &&
                !InventoryService.IGNORED_DIRECTORIES.has(entry.name) &&
                entry.name.startsWith("."))
                .sort((left, right) => left.name.localeCompare(right.name))
            : [];
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
            await this.walkSkillTree(path.join(currentPath, entry.name), discovered, seen, includeHiddenDirectories);
        }
    }
    parseSkillFile(raw, parentDirName) {
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
        const metadataWarnings = [];
        if (rawName.length < 1 ||
            rawName.length > 64 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawName)) {
            metadataWarnings.push("name should be 1-64 chars, lowercase letters/numbers/hyphens only, with no leading/trailing hyphen or consecutive '--'");
        }
        if (rawName !== parentDirName) {
            metadataWarnings.push(`name should match parent directory name '${parentDirName}'`);
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
    dedupeCandidates(candidates, duplicateLeafs) {
        const keptByKey = new Map();
        for (const candidate of candidates) {
            if (keptByKey.has(candidate.dedupeKey)) {
                const kept = keptByKey.get(candidate.dedupeKey);
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
    parseFrontmatter(lines) {
        if (lines[0]?.trim() !== "---") {
            return undefined;
        }
        const data = {};
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
                const blockLines = [];
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
//# sourceMappingURL=inventory-service.js.map