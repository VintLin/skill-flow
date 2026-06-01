import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/store";
import * as gitUtils from "@skill-flow/integration/utils/git";
import { InventoryService } from "../services/inventory-service.js";
import { SourceService } from "../services/source-service.js";
import {
  createZipArchive,
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

function createSourceService() {
  return new SourceService(new StateStore(), new InventoryService());
}

describe.sequential("source service", () => {
  const sandbox = useSkillFlowSandbox();

  test("keeps ssh git locators unchanged during normalization", async () => {
    const service = createSourceService();

    await expect(
      (
        service as unknown as { normalizeLocator(locator: string): Promise<string> }
      ).normalizeLocator("git@github.com:JimLiu/baoyu-skills.git"),
    ).resolves.toBe("git@github.com:JimLiu/baoyu-skills.git");
  });

  test("addSource stores originalDisplayName from resolved display name", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("alpha", "Alpha skill."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(added.data.manifest.originalDisplayName).toBe(added.data.manifest.displayName);
    expect(added.data.lock.displayName).toBe(added.data.manifest.displayName);
    expect(added.data.lock.originalDisplayName).toBe(added.data.manifest.displayName);
  });

  test("updateSources preserves imported originalDisplayName", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("alpha", "Alpha skill."),
    });
    const sourceService = createSourceService();
    const stateStore = new StateStore();
    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const { manifest, lockFile } = await stateStore.readState();
    manifest.sources[0]!.displayName = "Custom Alpha";
    manifest.sources[0]!.originalDisplayName = "Imported Alpha";
    lockFile.sources[0]!.displayName = "Custom Alpha";
    lockFile.sources[0]!.originalDisplayName = "Imported Alpha";
    await stateStore.writeState(manifest, lockFile);
    await writeRepoFiles(repoPath, {
      "SKILL.md": skillDoc("alpha", "Alpha skill, updated."),
    });

    const updated = await sourceService.updateSources();

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.changed).toBe(true);
    expect(updated.data.updated[0]?.diffs.map((diff) => diff.kind)).toContain("changed");
    const after = await stateStore.readState();
    expect(after.manifest.sources[0]).toMatchObject({
      displayName: "Custom Alpha",
      originalDisplayName: "Imported Alpha",
    });
    expect(after.lockFile.sources[0]).toMatchObject({
      displayName: "Custom Alpha",
      originalDisplayName: "Imported Alpha",
    });
  });

  test("local source updates re-copy from origin and report changed diffs", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const checkoutPath = path.join(sandbox.stateRoot, "source", "local", sourceId);
    await writeRepoFiles(repoPath, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow, updated upstream."),
    });
    await writeRepoFiles(checkoutPath, {
      "browse/SKILL.md": skillDoc("browse", "Stale checkout content."),
    });

    const updated = await sourceService.updateSources([sourceId]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const item = updated.data.updated[0];
    expect(item?.changed).toBe(true);
    expect(item?.diffs.map((diff) => diff.kind)).toEqual(["changed"]);
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toContain(
      "Browser flow, updated upstream.",
    );
  });

  test("local sources with the same folder name fall back to parent-prefixed naming", async () => {
    const leftParent = path.join(sandbox.sandboxRoot, "left");
    const rightParent = path.join(sandbox.sandboxRoot, "right");
    const leftRepo = path.join(leftParent, "skills");
    const rightRepo = path.join(rightParent, "skills");

    await writeRepoFiles(leftRepo, {
      "browse/SKILL.md": skillDoc("browse", "Left browse."),
    });
    await writeRepoFiles(rightRepo, {
      "review/SKILL.md": skillDoc("review", "Right review."),
    });

    const sourceService = createSourceService();
    const first = await sourceService.addSource(leftRepo);
    const second = await sourceService.addSource(rightRepo);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.data.manifest.displayName).toBe("skills");
    expect(first.data.manifest.id).toBe("skills");
    expect(second.data.manifest.displayName).toBe("right_skills");
    expect(second.data.manifest.id).toBe("right-skills");
  });

  test("local sources expand home-relative paths", async () => {
    const previousHome = process.env.HOME;
    const homeRoot = path.join(sandbox.sandboxRoot, "home-source-service");
    await fs.mkdir(homeRoot, { recursive: true });
    const repoPath = await createRepo(homeRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    process.env.HOME = homeRoot;

    try {
      const sourceService = createSourceService();
      const added = await sourceService.addSource(`~/${path.relative(homeRoot, repoPath)}`);

      expect(added.ok).toBe(true);
      if (!added.ok) {
        return;
      }

      expect(added.data.manifest.kind).toBe("local");
      expect(added.data.manifest.locator).toBe(repoPath);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  test("local source update fails without mutating checkout when origin path is missing", async () => {
    const repoPath = path.join(sandbox.sandboxRoot, "local-skills");
    await writeRepoFiles(repoPath, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const checkoutPath = path.join(sandbox.stateRoot, "source", "local", added.data.manifest.id);
    const before = await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8");
    await fs.rm(repoPath, { recursive: true, force: true });

    const updated = await sourceService.updateSources([added.data.manifest.id]);

    expect(updated.ok).toBe(false);
    if (updated.ok) {
      return;
    }
    expect(updated.errors[0]?.code).toBe("LOCAL_UPDATE_FAILED");
    expect(updated.errors[0]?.message).toContain("Local source origin is missing");
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toBe(before);
  });

  test("source updates classify changed, removed, and added leafs in order", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "one/SKILL.md": skillDoc("one", "One."),
      "two/SKILL.md": skillDoc("two", "Two."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await writeRepoFiles(repoPath, {
      "one/SKILL.md": skillDoc("one", "One, updated."),
      "three/SKILL.md": skillDoc("three", "Three."),
    });
    await fs.rm(path.join(repoPath, "two"), { recursive: true, force: true });

    const updated = await sourceService.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const item = updated.data.updated[0];
    expect(item?.diffs.map((diff) => diff.kind)).toEqual(["changed", "removed", "added"]);
    expect(item?.changed).toBe(true);
    expect(item?.addedLeafIds).toEqual([`${added.data.manifest.id}:three`]);
    expect(item?.removedLeafIds).toEqual([`${added.data.manifest.id}:two`]);
    expect(item?.invalidatedLeafIds).toEqual([]);
  });

  test("source updates classify exact-path renames as moved", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rename(path.join(repoPath, "browse"), path.join(repoPath, "browse-renamed"));

    const updated = await sourceService.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const item = updated.data.updated[0];
    expect(item?.diffs.map((diff) => diff.kind)).toEqual(["moved"]);
    expect(item?.addedLeafIds).toEqual([]);
    expect(item?.removedLeafIds).toEqual([]);
  });

  test("source updates treat requestedPath moves out of scope as remove plus add", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath, { path: "skills/browse" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rename(
      path.join(repoPath, "skills", "browse"),
      path.join(repoPath, "skills", "outside"),
    );

    const updated = await sourceService.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const item = updated.data.updated[0];
    expect(item?.diffs.map((diff) => diff.kind)).toEqual(["removed", "added"]);
  });

  test("source updates classify invalidated leafs separately from removals", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await writeRepoFiles(repoPath, {
      "browse/SKILL.md": "Broken now",
    });

    const updated = await sourceService.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const item = updated.data.updated[0];
    expect(item?.diffs.map((diff) => diff.kind)).toEqual(["invalidated"]);
    expect(item?.invalidatedLeafIds).toEqual([`${added.data.manifest.id}:browse`]);
    expect(item?.removedLeafIds).toEqual([]);
  });

  test("addSource keeps only the supported host bucket when a mirrored source layout also exists", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      ".agents/skills/adapt/SKILL.md": skillDoc("adapt", "Agent skill."),
      "source/skills/adapt/SKILL.md": skillDoc("adapt", "Source mirror."),
    });
    const sourceService = createSourceService();

    const added = await sourceService.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    expect(added.data.leafCount).toBe(1);
    expect(
      added.warnings.some((warning) => warning.message.includes("Duplicate skill content")),
    ).toBe(false);
  });

  test("github sources fall back to zip download when git is unavailable", async () => {
    const sourceService = createSourceService();
    const repoRoot = path.join(sandbox.sandboxRoot, "github-zip");
    const archivePath = path.join(sandbox.sandboxRoot, "github-zip.zip");
    await writeRepoFiles(repoRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from zip."),
    });
    await createZipArchive(repoRoot, archivePath);

    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
    vi.spyOn(gitUtils, "git").mockRejectedValue(new Error("git missing"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(await fs.readFile(archivePath), {
          status: 200,
          headers: { "content-type": "application/zip" },
        })) as typeof fetch,
    );

    const added = await sourceService.addSource("https://github.com/example/skills.git");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const checkoutPath = added.data.lock.checkoutPath;
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toContain(
      "Browser flow from zip.",
    );
  });

  test("github sources fall back to zip download when git clone fails", async () => {
    const sourceService = createSourceService();
    const repoRoot = path.join(sandbox.sandboxRoot, "github-clone-fallback");
    const archivePath = path.join(sandbox.sandboxRoot, "github-clone-fallback.zip");
    await writeRepoFiles(repoRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from clone fallback zip."),
    });
    await createZipArchive(repoRoot, archivePath);

    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockRejectedValue(new Error("RPC failed; curl 18"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(await fs.readFile(archivePath), {
          status: 200,
          headers: { "content-type": "application/zip" },
        })) as typeof fetch,
    );

    const added = await sourceService.addSource("https://github.com/example/skills.git");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const checkoutPath = added.data.lock.checkoutPath;
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toContain(
      "Browser flow from clone fallback zip.",
    );
  });

  test("gitlab sources fall back to zip download when git is unavailable", async () => {
    const sourceService = createSourceService();
    const repoRoot = path.join(sandbox.sandboxRoot, "gitlab-zip");
    const archivePath = path.join(sandbox.sandboxRoot, "gitlab-zip.zip");
    await writeRepoFiles(repoRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from gitlab zip."),
    });
    await createZipArchive(repoRoot, archivePath);

    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
    vi.spyOn(gitUtils, "git").mockRejectedValue(new Error("git missing"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        expect(String(input)).toContain(
          "https://gitlab.com/api/v4/projects/example%2Fskills/repository/archive.zip?sha=main",
        );
        return new Response(await fs.readFile(archivePath), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }) as typeof fetch,
    );

    const added = await sourceService.addSource("https://gitlab.com/example/skills.git");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const checkoutPath = added.data.lock.checkoutPath;
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toContain(
      "Browser flow from gitlab zip.",
    );
  });

  test("gitlab ssh sources fall back to https clone when ssh clone fails", async () => {
    const sourceService = createSourceService();
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from https fallback."),
    });

    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    const gitSpy = vi.spyOn(gitUtils, "git").mockImplementation(async (args, options) => {
      if (args[0] === "clone" && args[3] === "git@gitlab.com:example/skills.git") {
        throw new Error("ssh auth failed");
      }

      if (args[0] === "clone" && args[3] === "https://gitlab.com/example/skills.git") {
        await fs.cp(repoPath, args[4]!, { recursive: true });
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD" && options?.cwd) {
        return "test-commit-sha";
      }

      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    const added = await sourceService.addSource("git@gitlab.com:example/skills.git");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    expect(gitSpy).toHaveBeenNthCalledWith(
      1,
      ["clone", "--depth", "1", "git@gitlab.com:example/skills.git", expect.any(String)],
    );
    expect(gitSpy).toHaveBeenNthCalledWith(
      2,
      ["clone", "--depth", "1", "https://gitlab.com/example/skills.git", expect.any(String)],
    );

    const checkoutPath = added.data.lock.checkoutPath;
    expect(await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8")).toContain(
      "Browser flow from https fallback.",
    );
  });

  test("unsupported git hosts still fail when git is unavailable", async () => {
    const sourceService = createSourceService();
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
    vi.spyOn(gitUtils, "git").mockRejectedValue(new Error("git missing"));

    const added = await sourceService.addSource("https://example.com/example/skills.git");

    expect(added.ok).toBe(false);
    if (added.ok) {
      return;
    }
    expect(added.errors[0]?.code).toBe("GIT_CLONE_FAILED");
  });
});
