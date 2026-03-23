import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  TARGET_COMPAT_READ_CANDIDATES,
  TARGET_DEFINITIONS,
  TARGET_PATH_CANDIDATES,
} from "../utils/constants.js";

describe("target definitions", () => {
  test("includes config-based OpenCode skills directory in default detection paths", () => {
    expect(TARGET_PATH_CANDIDATES.opencode).toContain(
      path.join(os.homedir(), ".config", "opencode", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["github-copilot"]).toContain(
      path.join(os.homedir(), ".copilot", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["gemini-cli"]).toContain(
      path.join(os.homedir(), ".gemini", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.windsurf).toContain(
      path.join(os.homedir(), ".codeium", "windsurf", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["roo-code"]).toContain(
      path.join(os.homedir(), ".roo", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.cline).toContain(
      path.join(os.homedir(), ".cline", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.kiro).toContain(
      path.join(os.homedir(), ".kiro", "skills"),
    );
  });

  test("classifies shared global roots as compatibility reads instead of write roots", () => {
    expect(TARGET_DEFINITIONS.codex.writerKey).toBe("agents-skills");
    expect(TARGET_PATH_CANDIDATES.codex).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES["gemini-cli"]).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES["github-copilot"]).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.cursor).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.pi).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["gemini-cli"]).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["github-copilot"]).not.toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
  });
});
