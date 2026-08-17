import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import * as gitUtils from "@skill-flow/integration/utils/git";
import { InventoryService } from "../services/inventory-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("SourceCheckoutService", () => {
  const sandbox = useSkillFlowSandbox();

  test("classifies GitHub git locators as git checkout kind", async () => {
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(service.resolveSource("https://github.com/acme/skills.git", {}))
      .resolves.toMatchObject({
        kind: "git",
        gitLocator: "https://github.com/acme/skills.git",
      });
    await expect(service.resolveSource("acme/skills/path/to/skill", {}))
      .resolves.toMatchObject({
        kind: "git",
        locator: "https://github.com/acme/skills.git",
        requestedPath: "path/to/skill",
      });
    await expect(service.resolveSource("https://gitlab.com/acme/skills.git", {}))
      .resolves.toMatchObject({
        kind: "git",
        gitLocator: "https://gitlab.com/acme/skills.git",
      });
  });

  test("reads remote HEAD commit for git locators", async () => {
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    const git = vi.spyOn(gitUtils, "git").mockImplementation(async (args) => {
      if (args[0] === "ls-remote" && args[2] === "HEAD") {
        return "0123456789abcdef0123456789abcdef01234567\tHEAD";
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(
      service.readGitRemoteHeadCommit("https://github.com/acme/skills.git"),
    ).resolves.toBe("0123456789abcdef0123456789abcdef01234567");
    expect(git).toHaveBeenCalledWith(
      ["ls-remote", "https://github.com/acme/skills.git", "HEAD"],
      { timeoutMs: 5_000 },
    );
  });

  test("reads remote HEAD commit for GitHub shorthand locators", async () => {
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    const git = vi.spyOn(gitUtils, "git").mockResolvedValue(
      "0123456789abcdef0123456789abcdef01234567\tHEAD",
    );
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(service.readGitRemoteHeadCommit("acme/skills"))
      .resolves.toBe("0123456789abcdef0123456789abcdef01234567");
    expect(git).toHaveBeenCalledWith(
      ["ls-remote", "https://github.com/acme/skills.git", "HEAD"],
      { timeoutMs: 5_000 },
    );
  });

  test("reads the configured remote branch commit", async () => {
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    const git = vi.spyOn(gitUtils, "git").mockResolvedValue(
      "89abcdef0123456789abcdef0123456789abcdef\trefs/heads/release",
    );
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(service.readGitRemoteHeadCommit("acme/skills", { branch: "release" }))
      .resolves.toBe("89abcdef0123456789abcdef0123456789abcdef");
    expect(git).toHaveBeenCalledWith(
      ["ls-remote", "https://github.com/acme/skills.git", "refs/heads/release"],
      { timeoutMs: 5_000 },
    );
  });

  test("accepts SHA-256 remote HEAD commits", async () => {
    const sha256 = "0123456789abcdef".repeat(4);
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockResolvedValue(`${sha256}\tHEAD`);
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(
      service.readGitRemoteHeadCommit("https://github.com/acme/skills.git"),
    ).resolves.toBe(sha256);
  });

  test("prepares a checkout snapshot without writing authority files", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const checkoutPath = path.join(
      sandbox.stateRoot,
      "catalog",
      "import-preparations",
      "prep-1",
      "checkout",
    );
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(repoPath, {
      checkoutPath,
      options: { sourceIdOverride: "design-source" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data).toEqual(expect.objectContaining({
      sourceId: "design-source",
      kind: "local",
      locator: repoPath,
      displayName: path.basename(repoPath),
      checkoutPath,
    }));
    expect(prepared.data.leafs).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
        valid: true,
      }),
    ]);
    await expect(fs.stat(path.join(checkoutPath, "skills", "frontend-design", "SKILL.md")))
      .resolves.toBeTruthy();
    await expect(fs.access(path.join(sandbox.stateRoot, "manifest.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "lock.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "preferences.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "collections.json"))).rejects.toThrow();
  });

  test("refreshes a git checkout from its existing object store", async () => {
    const existingCheckoutPath = path.join(sandbox.sandboxRoot, "existing-checkout");
    const checkoutPath = path.join(sandbox.stateRoot, "source", "git", ".update-existing");
    await fs.mkdir(path.join(existingCheckoutPath, ".git"), { recursive: true });
    await fs.mkdir(path.join(existingCheckoutPath, "skills", "one"), { recursive: true });
    await fs.writeFile(
      path.join(existingCheckoutPath, "skills", "one", "SKILL.md"),
      skillDoc("one", "Old."),
      "utf8",
    );
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockImplementation(async (args, options) => {
      if (
        args[0] === "clone"
        && args[1] === "--local"
        && args[2] === "--no-checkout"
        && args[3] === existingCheckoutPath
        && args[4] === checkoutPath
      ) {
        await fs.cp(existingCheckoutPath, checkoutPath, { recursive: true });
        return "";
      }
      if (args[0] === "remote" && args[1] === "set-url" && options?.cwd === checkoutPath) {
        return "";
      }
      if (args[0] === "fetch" && options?.cwd === checkoutPath) {
        return "";
      }
      if (args[0] === "checkout" && options?.cwd === checkoutPath) {
        await fs.writeFile(
          path.join(checkoutPath, "skills", "one", "SKILL.md"),
          skillDoc("one", "New."),
          "utf8",
        );
        return "";
      }
      if (args[0] === "rev-parse" && args[1] === "HEAD" && options?.cwd === checkoutPath) {
        return "fedcba9876543210fedcba9876543210fedcba98";
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(
      "git@example.test:acme/skills.git",
      {
        checkoutPath,
        existingCheckoutPath,
        options: { sourceIdOverride: "git-existing", originBranch: "release" },
      },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data.commitSha).toBe("fedcba9876543210fedcba9876543210fedcba98");
    await expect(fs.readFile(
      path.join(checkoutPath, "skills", "one", "SKILL.md"),
      "utf8",
    )).resolves.toContain("New.");
  });

  test("falls back to a clean clone when the existing checkout cannot be refreshed", async () => {
    const existingCheckoutPath = path.join(sandbox.sandboxRoot, "broken-existing-checkout");
    const upstreamRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "Fresh."),
    });
    const checkoutPath = path.join(sandbox.stateRoot, "source", "git", ".update-fallback");
    await fs.mkdir(path.join(existingCheckoutPath, ".git"), { recursive: true });
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    const git = vi.spyOn(gitUtils, "git").mockImplementation(async (args, options) => {
      if (args[0] === "clone" && args[1] === "--local") {
        throw new Error("local clone failed");
      }
      if (
        args[0] === "clone"
        && args[1] === "--depth"
        && args[3] === "--branch"
        && args[4] === "release"
        && args[5] === "https://github.com/acme/skills.git"
        && args[6] === checkoutPath
      ) {
        await fs.cp(upstreamRepo, checkoutPath, { recursive: true });
        return "";
      }
      if (args[0] === "rev-parse" && args[1] === "HEAD" && options?.cwd === checkoutPath) {
        return "abcdef0123456789abcdef0123456789abcdef01";
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(
      "https://github.com/acme/skills.git",
      {
        checkoutPath,
        existingCheckoutPath,
        options: { sourceIdOverride: "git-fallback", originBranch: "release" },
      },
    );

    expect(prepared.ok).toBe(true);
    expect(git).toHaveBeenCalledWith([
      "clone",
      "--depth",
      "1",
      "--branch",
      "release",
      "https://github.com/acme/skills.git",
      checkoutPath,
    ]);
    await expect(fs.readFile(
      path.join(checkoutPath, "skills", "one", "SKILL.md"),
      "utf8",
    )).resolves.toContain("Fresh.");
  });

  test("does not switch branches when a locked branch archive is unavailable", async () => {
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("missing", { status: 404 }),
    );
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(
      "https://github.com/acme/skills.git",
      { options: { sourceIdOverride: "locked-release", originBranch: "release" } },
    );

    expect(prepared.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://github.com/acme/skills/archive/refs/heads/release.zip",
    );
  });

  test("rejects skill leafs with escaping symlinks before they can be deployed", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/unsafe/SKILL.md": skillDoc("unsafe", "Unsafe skill."),
    });
    await fs.symlink("../../outside", path.join(repoPath, "skills", "unsafe", "escape"));
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(repoPath, {
      options: { sourceIdOverride: "unsafe-source" },
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.warnings).toContainEqual(expect.objectContaining({
      code: "INVALID_LEAF",
      message: expect.stringContaining("Unsafe symbolic link"),
    }));
  });

  test("prepares GitHub tree locators under the git source root", async () => {
    const upstreamRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
    });
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockImplementation(async (args) => {
      if (
        args[0] === "clone"
        && args[3] === "--branch"
        && args[4] === "main"
        && args[5] === "https://github.com/vercel-labs/skills.git"
      ) {
        await fs.cp(upstreamRepo, args[6]!, { recursive: true });
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return "test-commit-sha";
      }

      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(
      "https://github.com/vercel-labs/skills/tree/main/skills/find-skills",
      { options: { sourceIdOverride: "vercel-labs-skills" } },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data.kind).toBe("git");
    expect(prepared.data.originBranch).toBe("main");
    expect(prepared.data.requestedPath).toBe("skills/find-skills");
    expect(prepared.data.checkoutPath).toContain(`${path.sep}source${path.sep}git${path.sep}`);
    expect(prepared.data.leafs.map((leaf) => leaf.id)).toEqual([
      "vercel-labs-skills:skills/find-skills",
    ]);
  });
});
