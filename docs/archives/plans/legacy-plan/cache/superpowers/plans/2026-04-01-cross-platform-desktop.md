# Cross-Platform Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `skill-flow` runtime portable across macOS, Windows, and Ubuntu, then add a single Tauri desktop shell that reuses `skill-flow bridge --json` as the only business boundary.

**Architecture:** Phase 1 stays inside the current TypeScript runtime: remove shell-dependent ZIP extraction, centralize platform path/link policy, and lock bridge behavior with tests so CLI and desktop stay aligned. Phase 2 adds `apps/desktop` as a React + Vite + Tauri 2 shell that talks to the same bridge protocol, while `apps/desktop-mac` remains intact until the new shell is stable and packaged across all three platforms.

**Tech Stack:** TypeScript, Vitest, React 19, Vite, Tauri 2, Rust, existing `@skill-flow/*` workspace packages.

I'm using the writing-plans skill to create the implementation plan.

---

### Task 1: Remove Shell-Dependent ZIP Extraction

**Files:**
- Modify: `packages/core-engine/package.json`
- Modify: `packages/core-engine/src/services/source-service.ts`
- Modify: `packages/core-engine/src/tests/source-service.test.ts`
- Modify: `packages/core-engine/src/tests/test-helpers.ts`
- Create: `packages/core-engine/src/services/zip-archive.ts`

- [ ] **Step 1: Write the failing archive portability tests**

```ts
test("extracts github archives without requiring ditto or unzip", async () => {
  const archiveRoot = path.join(sandbox.sandboxRoot, "archive-root");
  await writeRepoFiles(archiveRoot, {
    "demo-main/browse/SKILL.md": skillDoc("browse", "Browser flow."),
  });

  const archivePath = path.join(sandbox.sandboxRoot, "demo-main.zip");
  await createZipArchive(path.join(archiveRoot, "demo-main"), archivePath, true);

  const service = createSourceService();
  const extractPath = path.join(sandbox.sandboxRoot, "extract");

  await (service as unknown as {
    extractZipArchive(archivePath: string, extractPath: string): Promise<void>;
  }).extractZipArchive(archivePath, extractPath);

  expect(
    await fs.readFile(path.join(extractPath, "demo-main", "browse", "SKILL.md"), "utf8"),
  ).toContain("Browser flow.");
});

test("preserves archive contents when the extracted folder does not match the expected root", async () => {
  const archiveRoot = path.join(sandbox.sandboxRoot, "mismatch-root");
  await writeRepoFiles(archiveRoot, {
    "unexpected/review/SKILL.md": skillDoc("review", "Review flow."),
  });

  const archivePath = path.join(sandbox.sandboxRoot, "unexpected.zip");
  await createZipArchive(path.join(archiveRoot, "unexpected"), archivePath, true);

  const service = createSourceService();
  const extractPath = path.join(sandbox.sandboxRoot, "extract-mismatch");

  await (service as unknown as {
    extractZipArchive(archivePath: string, extractPath: string): Promise<void>;
  }).extractZipArchive(archivePath, extractPath);

  await (service as unknown as {
    copyExtractedArchive(
      extractPath: string,
      checkoutPath: string,
      expectedArchiveRootName?: string,
    ): Promise<void>;
  }).copyExtractedArchive(extractPath, path.join(sandbox.sandboxRoot, "checkout"), "demo-main");

  expect(
    await fs.readFile(path.join(sandbox.sandboxRoot, "checkout", "unexpected", "review", "SKILL.md"), "utf8"),
  ).toContain("Review flow.");
});
```

- [ ] **Step 2: Run the focused core-engine test file and confirm it fails**

```bash
npm run -w @skill-flow/core-engine test -- src/tests/source-service.test.ts
```

Expected: FAIL because `extractZipArchive` still shells out to `ditto` / `unzip`, and `createZipArchive` still depends on `ditto`, so the new portability tests are not satisfied.

- [ ] **Step 3: Add a pure-JS archive helper and dependency**

```json
{
  "dependencies": {
    "@skill-flow/domain": "1.3.0",
    "@skill-flow/integration": "1.3.0",
    "@skill-flow/storage": "1.3.0",
    "adm-zip": "^0.5.16",
    "commander": "^14.0.3"
  }
}
```

```ts
// packages/core-engine/src/services/zip-archive.ts
import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "@skill-flow/integration/utils/fs";

export async function extractZipArchivePortable(
  archivePath: string,
  extractPath: string,
): Promise<void> {
  await ensureDir(extractPath);
  const archive = new AdmZip(archivePath);

  for (const entry of archive.getEntries()) {
    const destination = path.join(extractPath, entry.entryName);
    if (entry.isDirectory) {
      await ensureDir(destination);
      continue;
    }

    await ensureDir(path.dirname(destination));
    await fs.writeFile(destination, entry.getData());
  }
}

export async function createZipArchivePortable(
  rootPath: string,
  archivePath: string,
  keepParent: boolean,
): Promise<void> {
  const archive = new AdmZip();
  archive.addLocalFolder(rootPath, keepParent ? path.basename(rootPath) : "");
  await ensureDir(path.dirname(archivePath));
  archive.writeZip(archivePath);
}
```

- [ ] **Step 4: Wire `SourceService` and test helpers to the portable helper**

```ts
// packages/core-engine/src/services/source-service.ts
import { extractZipArchivePortable } from "./zip-archive.js";

private async extractZipArchive(archivePath: string, extractPath: string): Promise<void> {
  await extractZipArchivePortable(archivePath, extractPath);
}
```

```ts
// packages/core-engine/src/tests/test-helpers.ts
import { createZipArchivePortable } from "../services/zip-archive.js";

export async function createZipArchive(
  root: string,
  archivePath: string,
  keepParent = false,
) {
  await createZipArchivePortable(root, archivePath, keepParent);
}
```

- [ ] **Step 5: Re-run the core-engine tests and verify they pass**

```bash
npm run -w @skill-flow/core-engine test -- src/tests/source-service.test.ts
```

Expected: PASS with archive extraction no longer depending on host-provided `ditto` / `unzip`.

- [ ] **Step 6: Commit the archive portability unit**

```bash
git add packages/core-engine/package.json packages/core-engine/src/services/source-service.ts packages/core-engine/src/services/zip-archive.ts packages/core-engine/src/tests/source-service.test.ts packages/core-engine/src/tests/test-helpers.ts
git commit -m "fix: remove shell zip dependencies from source service"
```

### Task 2: Centralize Platform Path and Link Policy

**Files:**
- Create: `packages/integration/src/utils/platform-paths.ts`
- Create: `packages/integration/src/tests/platform-paths.test.ts`
- Modify: `packages/integration/src/utils/constants.ts`
- Modify: `packages/integration/src/utils/fs.ts`
- Modify: `apps/cli/src/tests/target-definitions.test.ts`
- Modify: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Write failing tests for Windows state-root and link behavior**

```ts
// packages/integration/src/tests/platform-paths.test.ts
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  resolveStateRootForPlatform,
  resolveSymlinkKindForPlatform,
  resolveTargetWriteRootsForPlatform,
} from "../utils/platform-paths.js";

describe("platform path policy", () => {
  test("uses AppData for the default Windows state root", () => {
    expect(
      resolveStateRootForPlatform("win32", "C:\\Users\\vint", {
        APPDATA: "C:\\Users\\vint\\AppData\\Roaming",
      }),
    ).toBe(path.join("C:\\Users\\vint\\AppData\\Roaming", "skill-flow"));
  });

  test("keeps explicit target overrides ahead of platform defaults", () => {
    expect(
      resolveTargetWriteRootsForPlatform("codex", "win32", "C:\\Users\\vint", {
        SKILL_FLOW_TARGET_CODEX: "D:\\SkillTargets\\Codex",
      }),
    ).toEqual(["D:\\SkillTargets\\Codex"]);
  });

  test("uses directory symlinks on Unix and junctions on Windows", () => {
    expect(resolveSymlinkKindForPlatform("darwin")).toBe("dir");
    expect(resolveSymlinkKindForPlatform("linux")).toBe("dir");
    expect(resolveSymlinkKindForPlatform("win32")).toBe("junction");
  });
});
```

```ts
// apps/cli/src/tests/skill-flow.test.ts
test("falls back to copy when Windows junction creation is denied", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  vi.spyOn(fs, "symlink").mockRejectedValueOnce(Object.assign(new Error("blocked"), { code: "EPERM" }));

  const result = await app.applyDraft(sourceId, {
    selectedLeafIds: [`${sourceId}:browse`],
    enabledTargets: ["openclaw"],
  });

  expect(result.ok).toBe(true);
  expect(await fs.stat(path.join(process.env.SKILL_FLOW_TARGET_OPENCLAW!, "browse"))).toBeTruthy();
});
```

- [ ] **Step 2: Run the integration and CLI target tests and confirm they fail**

```bash
npm run -w @skill-flow/integration test -- src/tests/platform-paths.test.ts
npm run -w skill-flow test -- src/tests/target-definitions.test.ts src/tests/skill-flow.test.ts
```

Expected: FAIL because there is no explicit platform policy module, `getStateRoot()` always returns `~/.skillflow`, and `createSymlink()` always hardcodes `"junction"`.

- [ ] **Step 3: Add a dedicated platform policy module**

```ts
// packages/integration/src/utils/platform-paths.ts
import path from "node:path";
import type { DeploymentTargetName } from "@skill-flow/domain/types";

export function resolveStateRootForPlatform(
  platform: NodeJS.Platform,
  homeDir: string,
  env: NodeJS.ProcessEnv,
): string {
  if (env.SKILL_FLOW_STATE_ROOT) {
    return path.resolve(env.SKILL_FLOW_STATE_ROOT);
  }

  if (platform === "win32") {
    const appData = env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, "skill-flow");
  }

  return path.join(homeDir, ".skillflow");
}

export function resolveTargetWriteRootsForPlatform(
  target: DeploymentTargetName,
  platform: NodeJS.Platform,
  homeDir: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const overrideMap: Record<DeploymentTargetName, string | undefined> = {
    "claude-code": env.SKILL_FLOW_TARGET_CLAUDE_CODE,
    codex: env.SKILL_FLOW_TARGET_CODEX,
    cursor: env.SKILL_FLOW_TARGET_CURSOR,
    "github-copilot": env.SKILL_FLOW_TARGET_GITHUB_COPILOT,
    "gemini-cli": env.SKILL_FLOW_TARGET_GEMINI_CLI,
    opencode: env.SKILL_FLOW_TARGET_OPENCODE,
    openclaw: env.SKILL_FLOW_TARGET_OPENCLAW,
    pi: env.SKILL_FLOW_TARGET_PI,
    windsurf: env.SKILL_FLOW_TARGET_WINDSURF,
    "roo-code": env.SKILL_FLOW_TARGET_ROO_CODE,
    cline: env.SKILL_FLOW_TARGET_CLINE,
    amp: env.SKILL_FLOW_TARGET_AMP,
    kiro: env.SKILL_FLOW_TARGET_KIRO,
  };

  const explicit = overrideMap[target]?.trim();
  if (explicit) {
    return [path.resolve(explicit)];
  }

  if (platform === "win32") {
    return [path.join(homeDir, `.${target}`, "skills")];
  }

  return [path.join(homeDir, `.${target}`, "skills")];
}

export function resolveSymlinkKindForPlatform(
  platform: NodeJS.Platform,
): "junction" | "dir" {
  return platform === "win32" ? "junction" : "dir";
}
```

- [ ] **Step 4: Switch existing helpers to use the explicit policy**

```ts
// packages/integration/src/utils/constants.ts
import os from "node:os";
import {
  resolveStateRootForPlatform,
  resolveTargetWriteRootsForPlatform,
} from "./platform-paths.js";

export function getStateRoot(): string {
  return resolveStateRootForPlatform(process.platform, os.homedir(), process.env);
}

const homeDir = os.homedir();
const env = process.env;

export const TARGET_PATH_CANDIDATES: Record<DeploymentTargetName, string[]> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, resolveTargetWriteRootsForPlatform(target, process.platform, homeDir, env)]),
  ) as Record<DeploymentTargetName, string[]>;
```

```ts
// packages/integration/src/utils/fs.ts
import { resolveSymlinkKindForPlatform } from "./platform-paths.js";

export async function createSymlink(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await removePath(targetPath);
  await ensureDir(path.dirname(targetPath));

  try {
    await fs.symlink(sourcePath, targetPath, resolveSymlinkKindForPlatform(process.platform));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
      await fs.cp(sourcePath, targetPath, { recursive: true, dereference: false });
      return;
    }
    throw error;
  }
}
```

- [ ] **Step 5: Re-run the platform tests and verify they pass**

```bash
npm run -w @skill-flow/integration test -- src/tests/platform-paths.test.ts
npm run -w skill-flow test -- src/tests/target-definitions.test.ts src/tests/skill-flow.test.ts
```

Expected: PASS with state-root resolution, target overrides, and link fallback behavior all explicitly covered.

- [ ] **Step 6: Commit the platform policy unit**

```bash
git add packages/integration/src/utils/platform-paths.ts packages/integration/src/tests/platform-paths.test.ts packages/integration/src/utils/constants.ts packages/integration/src/utils/fs.ts apps/cli/src/tests/target-definitions.test.ts apps/cli/src/tests/skill-flow.test.ts
git commit -m "feat: add explicit cross-platform path policy"
```

### Task 3: Scaffold a Tauri Desktop Shell Around the Existing Bridge Protocol

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/styles.css`
- Create: `apps/desktop/src/lib/bridge.ts`
- Create: `apps/desktop/src/lib/bridge.test.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/bridge.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/tauri.windows.conf.json`
- Create: `apps/desktop/src-tauri/tauri.linux.conf.json`
- Create: `apps/desktop/src-tauri/tauri.macos.conf.json`
- Modify: `package.json`

- [ ] **Step 1: Write the failing bridge transport tests for the new desktop app**

```ts
// apps/desktop/src/lib/bridge.test.ts
import { describe, expect, test, vi } from "vitest";
import { PROTOCOL_VERSION } from "@skill-flow/shared-types/protocol";
import { createDesktopBridgeClient } from "./bridge";

describe("desktop bridge client", () => {
  test("sends protocol-stable requests through the tauri invoke boundary", async () => {
    const invoke = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      command: "list",
      ok: true,
      data: { summaries: [], pinnedSourceIds: [] },
      warnings: [],
      errors: [],
    });

    const bridge = createDesktopBridgeClient(invoke);
    const response = await bridge.list();

    expect(invoke).toHaveBeenCalledWith("bridge_request", {
      request: {
        protocolVersion: PROTOCOL_VERSION,
        command: "list",
      },
    });
    expect(response.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the desktop test file and confirm it fails**

```bash
npm run -w @skill-flow/desktop test -- src/lib/bridge.test.ts
```

Expected: FAIL because `apps/desktop` does not exist yet and there is no Tauri bridge client.

- [ ] **Step 3: Create the workspace package, React shell, and Tauri bridge command**

```json
// apps/desktop/package.json
{
  "name": "@skill-flow/desktop",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@skill-flow/shared-types": "1.3.0",
    "@tauri-apps/api": "^2.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.3",
    "vite": "^8.0.0",
    "vitest": "^4.1.0"
  }
}
```

```ts
// apps/desktop/src/lib/bridge.ts
import { invoke } from "@tauri-apps/api/core";
import type { BridgeRequest, BridgeResponse } from "@skill-flow/shared-types/protocol";
import { PROTOCOL_VERSION } from "@skill-flow/shared-types/protocol";

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<BridgeResponse>;

export function createDesktopBridgeClient(invokeFn: InvokeFn = invoke) {
  async function request(command: BridgeRequest["command"], payload?: BridgeRequest["payload"]) {
    return invokeFn("bridge_request", {
      request: {
        protocolVersion: PROTOCOL_VERSION,
        command,
        ...(payload !== undefined ? { payload } : {}),
      } satisfies BridgeRequest,
    });
  }

  return {
    bootstrap: () => request("bootstrap"),
    list: () => request("list"),
    inspect: (sourceId: string) => request("inspect", { sourceId }),
    add: (locator: string) => request("add", { locator, applyNow: false }),
    apply: (sourceId: string, draft: Record<string, unknown>) => request("apply", { sourceId, draft }),
    update: (sourceIds?: string[]) => request("update", sourceIds ? { sourceIds } : undefined),
    uninstall: (sourceIds: string[]) => request("uninstall", { sourceIds }),
  };
}
```

```rust
// apps/desktop/src-tauri/src/bridge.rs
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

pub struct BridgeState {
    pub helper_override: Option<PathBuf>,
}

#[tauri::command]
pub async fn bridge_request(
    state: State<'_, BridgeState>,
    request: Value,
) -> Result<Value, String> {
    let helper = state
        .helper_override
        .clone()
        .ok_or_else(|| "missing helper override".to_string())?;

    let mut child = Command::new("node")
        .arg(helper)
        .arg("bridge")
        .arg("--json")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let payload = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "bridge stdin missing".to_string())?
        .write_all(&payload)
        .await
        .map_err(|error| error.to_string())?;

    let mut output = Vec::new();
    child
        .stdout
        .as_mut()
        .ok_or_else(|| "bridge stdout missing".to_string())?
        .read_to_end(&mut output)
        .await
        .map_err(|error| error.to_string())?;

    serde_json::from_slice(&output).map_err(|error| error.to_string())
}
```

- [ ] **Step 4: Register the app in the root workspace build and test graph**

```json
// package.json
{
  "scripts": {
    "build": "npm run -w @skill-flow/domain build && npm run -w @skill-flow/shared-types build && npm run -w @skill-flow/integration build && npm run -w @skill-flow/storage build && npm run -w @skill-flow/core-engine build && npm run -w @skill-flow/query build && npm run -w @skill-flow/tui build && npm run -w skill-flow build && npm run -w @skill-flow/desktop build",
    "test": "npm run -w @skill-flow/domain test && npm run -w @skill-flow/shared-types test && npm run -w @skill-flow/integration test && npm run -w @skill-flow/storage test && npm run -w @skill-flow/core-engine test && npm run -w @skill-flow/query test && npm run -w @skill-flow/tui test && npm run -w skill-flow test && npm run -w @skill-flow/desktop test"
  }
}
```

- [ ] **Step 5: Run the new desktop tests and verify the scaffold passes**

```bash
npm install
npm run -w @skill-flow/desktop test -- src/lib/bridge.test.ts
npm run -w @skill-flow/desktop build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: PASS with a minimal desktop shell compiling and the Tauri invoke boundary locked to the existing bridge protocol.

- [ ] **Step 6: Commit the desktop scaffold**

```bash
git add package.json apps/desktop
git commit -m "feat: scaffold tauri desktop shell"
```

### Task 4: Implement Shared Desktop Screens Against the Bridge Boundary

**Files:**
- Create: `apps/desktop/src/features/home/HomeScreen.tsx`
- Create: `apps/desktop/src/features/import/ImportScreen.tsx`
- Create: `apps/desktop/src/features/detail/DetailScreen.tsx`
- Create: `apps/desktop/src/features/settings/SettingsScreen.tsx`
- Create: `apps/desktop/src/state/app-store.ts`
- Create: `apps/desktop/src/test/app-flow.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/styles.css`
- Modify: `apps/desktop/src/lib/bridge.ts`

- [ ] **Step 1: Write a failing end-to-end screen flow test**

```tsx
// apps/desktop/src/test/app-flow.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import App from "../App";

describe("desktop app flow", () => {
  test("boots, opens detail, applies a draft, and refreshes summaries", async () => {
    const bridge = {
      bootstrap: vi.fn().mockResolvedValue({
        ok: true,
        command: "bootstrap",
        protocolVersion: "1.0",
        data: { summaries: [{ sourceId: "demo", title: "Demo Skills" }], pinnedSourceIds: [] },
        warnings: [],
        errors: [],
      }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        command: "list",
        protocolVersion: "1.0",
        data: { summaries: [{ sourceId: "demo", title: "Demo Skills" }], pinnedSourceIds: [] },
        warnings: [],
        errors: [],
      }),
      inspect: vi.fn().mockResolvedValue({
        ok: true,
        command: "inspect",
        protocolVersion: "1.0",
        data: {
          summary: { sourceId: "demo", title: "Demo Skills" },
          binding: { sourceId: "demo", enabledTargets: ["codex"], selectedLeafIds: ["demo:browse"] },
          leafs: [{ id: "demo:browse", title: "Browse" }],
          deployments: [],
        },
        warnings: [],
        errors: [],
      }),
      add: vi.fn(),
      apply: vi.fn().mockResolvedValue({
        ok: true,
        command: "apply",
        protocolVersion: "1.0",
        data: { summary: { sourceId: "demo", title: "Demo Skills" } },
        warnings: [],
        errors: [],
      }),
      update: vi.fn(),
      uninstall: vi.fn(),
    };

    render(<App bridge={bridge} />);

    await waitFor(() => expect(screen.getByText("Demo Skills")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Demo Skills" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(bridge.inspect).toHaveBeenCalledWith("demo");
    expect(bridge.apply).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the desktop UI test and confirm it fails**

```bash
npm run -w @skill-flow/desktop test -- src/test/app-flow.test.tsx
```

Expected: FAIL because the scaffold only has a shell and no app state, screens, or draft/apply flow yet.

- [ ] **Step 3: Add a shared desktop state store that mirrors bridge commands**

```ts
// apps/desktop/src/state/app-store.ts
import { useEffect, useState } from "react";

export function useDesktopAppStore(bridge: {
  bootstrap(): Promise<any>;
  list(): Promise<any>;
  inspect(sourceId: string): Promise<any>;
  apply(sourceId: string, draft: Record<string, unknown>): Promise<any>;
}) {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    void bridge.bootstrap().then((response) => setSummaries(response.data?.summaries ?? []));
  }, [bridge]);

  async function openDetail(sourceId: string) {
    setSelectedSourceId(sourceId);
    const response = await bridge.inspect(sourceId);
    setDetail(response.data);
  }

  async function applyDraft(draft: Record<string, unknown>) {
    if (!selectedSourceId) {
      return;
    }

    await bridge.apply(selectedSourceId, draft);
    const refreshed = await bridge.list();
    setSummaries(refreshed.data?.summaries ?? []);
  }

  return {
    summaries,
    selectedSourceId,
    detail,
    openDetail,
    applyDraft,
  };
}
```

- [ ] **Step 4: Build the four screens directly on top of the shared store**

```tsx
// apps/desktop/src/App.tsx
import { createDesktopBridgeClient } from "./lib/bridge";
import { useDesktopAppStore } from "./state/app-store";
import { HomeScreen } from "./features/home/HomeScreen";
import { DetailScreen } from "./features/detail/DetailScreen";
import { ImportScreen } from "./features/import/ImportScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";

export default function App({
  bridge = createDesktopBridgeClient(),
}: {
  bridge?: ReturnType<typeof createDesktopBridgeClient>;
}) {
  const store = useDesktopAppStore(bridge);

  return (
    <div className="desktop-layout">
      <HomeScreen summaries={store.summaries} onOpen={store.openDetail} />
      <DetailScreen detail={store.detail} onApply={store.applyDraft} />
      <ImportScreen bridge={bridge} />
      <SettingsScreen />
    </div>
  );
}
```

```tsx
// apps/desktop/src/features/detail/DetailScreen.tsx
export function DetailScreen({
  detail,
  onApply,
}: {
  detail: any | null;
  onApply(draft: Record<string, unknown>): Promise<void>;
}) {
  if (!detail) {
    return <section className="panel">Select a source</section>;
  }

  return (
    <section className="panel">
      <h2>{detail.summary.title}</h2>
      <button
        type="button"
        onClick={() =>
          void onApply({
            selectedLeafIds: detail.binding.selectedLeafIds,
            enabledTargets: detail.binding.enabledTargets,
          })}
      >
        Apply
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Re-run the desktop UI tests and confirm the core flows pass**

```bash
npm run -w @skill-flow/desktop test -- src/test/app-flow.test.tsx
npm run -w @skill-flow/desktop build
```

Expected: PASS with bootstrap, detail inspection, apply, and summary refresh working through the bridge contract.

- [ ] **Step 6: Commit the shared desktop UI**

```bash
git add apps/desktop/src
git commit -m "feat: add shared cross-platform desktop screens"
```

### Task 5: Add Multi-Platform Packaging, CI, and Public Documentation

**Files:**
- Create: `.github/workflows/desktop-cross-platform.yml`
- Create: `scripts/release/package-desktop.sh`
- Create: `scripts/release/validate-desktop-artifacts.sh`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `apps/desktop/README.md`
- Create: `releases/RELEASE_v1.4.0.md`

- [ ] **Step 1: Write the failing release workflow and validation expectations**

```bash
bash scripts/release/package-desktop.sh --target windows
bash scripts/release/package-desktop.sh --target linux
bash scripts/release/package-desktop.sh --target macos
```

Expected: FAIL because the scripts and GitHub Actions workflow do not exist yet.

- [ ] **Step 2: Add a single cross-platform packaging entrypoint**

```bash
#!/usr/bin/env bash
# scripts/release/package-desktop.sh
set -euo pipefail

target="${2:-}"

case "${target}" in
  windows) bundle="nsis" ;;
  linux) bundle="deb,appimage" ;;
  macos) bundle="dmg,app" ;;
  *)
    echo "usage: $0 --target <windows|linux|macos>" >&2
    exit 1
    ;;
esac

npm run -w @skill-flow/desktop build
npm run -w @skill-flow/desktop tauri:build -- --bundles "${bundle}"
```

```bash
#!/usr/bin/env bash
# scripts/release/validate-desktop-artifacts.sh
set -euo pipefail

test -d apps/desktop/src-tauri/target/release/bundle
find apps/desktop/src-tauri/target/release/bundle -maxdepth 2 -type f | sort
```

- [ ] **Step 3: Add a matrix GitHub Actions workflow**

```yaml
# .github/workflows/desktop-cross-platform.yml
name: desktop-cross-platform

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            target: macos
          - os: ubuntu-latest
            target: linux
          - os: windows-latest
            target: windows
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm test
      - run: bash scripts/release/package-desktop.sh --target ${{ matrix.target }}
      - run: bash scripts/release/validate-desktop-artifacts.sh
```

- [ ] **Step 4: Update public docs to describe the migration boundary clearly**

```md
<!-- README.md -->
## Desktop Apps

- `apps/desktop-mac` remains the SwiftUI macOS shell during migration.
- `apps/desktop` is the new cross-platform Tauri desktop app for macOS, Windows, and Ubuntu.
- Both desktop shells talk to `skill-flow bridge --json`; CLI and desktop share the same state root and runtime behavior.
```

```md
<!-- releases/RELEASE_v1.4.0.md -->
# Skill Flow v1.4.0

## Added

- Cross-platform desktop shell under `apps/desktop`
- Windows, Ubuntu, and macOS desktop packaging matrix
- Portable ZIP extraction and explicit platform path policy in the runtime

## Changed

- `skill-flow` state root defaults to `%APPDATA%\\skill-flow` on Windows
- Desktop packaging no longer depends on host-provided `ditto` / `unzip`
```

- [ ] **Step 5: Run release verification locally**

```bash
npm test
npm run build
bash scripts/release/package-desktop.sh --target linux
bash scripts/release/validate-desktop-artifacts.sh
```

Expected: PASS on the current host for the host-supported target; the workflow covers Windows and macOS in CI.

- [ ] **Step 6: Commit the release and docs unit**

```bash
git add .github/workflows/desktop-cross-platform.yml scripts/release/package-desktop.sh scripts/release/validate-desktop-artifacts.sh README.md README.zh.md apps/desktop/README.md releases/RELEASE_v1.4.0.md
git commit -m "feat: add cross-platform desktop release pipeline"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-01-cross-platform-desktop.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
