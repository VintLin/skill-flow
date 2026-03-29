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

  test("non-github git sources still fail when git is unavailable", async () => {
    const sourceService = createSourceService();
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
    vi.spyOn(gitUtils, "git").mockRejectedValue(new Error("git missing"));

    const added = await sourceService.addSource("https://gitlab.com/example/skills.git");

    expect(added.ok).toBe(false);
    if (added.ok) {
      return;
    }
    expect(added.errors[0]?.code).toBe("GIT_CLONE_FAILED");
  });
});
