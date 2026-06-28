# Skill Flow Full Cross-Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `skill-flow` into one cross-platform product with a shared CLI/runtime and a new Tauri desktop shell that reproduces the current `apps/desktop-mac` logic and UI scope on macOS, Windows, and Linux.

**Architecture:** Keep `packages/*` as the shared business core, keep `apps/cli` as the runtime and `bridge --json` boundary, and add a new `apps/desktop` Tauri shell that consumes the same state root and bridge contract. Migrate behavior from `apps/desktop-mac` by freezing its contract first, then port routes, state, and UI into the new shell without introducing a second source of truth.

**Tech Stack:** TypeScript, Node.js, Vitest, Tauri 2, Rust, React, Vite, GitHub Actions, existing `skill-flow` monorepo packages

---

## Execution Notes

- The new desktop shell must not rely on end-user `node` being present in `PATH`. Development mode may use a local helper override, but release packaging must ship an explicit desktop helper path.

## File Structure

### Existing files to modify

- `package.json`
  - add root scripts for desktop build, desktop test, desktop dev, and release validation
- `package-lock.json`
  - capture new desktop renderer and Tauri dependencies
- `apps/cli/package.json`
  - add cross-platform build/test/release helper scripts
- `apps/cli/src/bridge-command.ts`
  - stabilize bridge bootstrap and helper resolution for desktop callers
- `apps/cli/src/cli.tsx`
  - keep desktop bridge entry and direct CLI flows aligned across platforms
- `apps/cli/src/tests/bridge-command.test.ts`
  - extend bridge contract tests
- `apps/cli/src/tests/config-integration.test.ts`
  - extend cross-platform config/runtime tests
- `packages/integration/src/utils/constants.ts`
  - extend the platform registry beyond the first path-policy slice
- `packages/integration/src/project-observations.ts`
  - keep observation paths aligned with cross-platform runtime rules
- `packages/core-engine/src/services/source-service.ts`
  - centralize platform archive and helper handling
- `packages/core-engine/src/services/workspace-bootstrap-service.ts`
  - keep bridge/bootstrap behavior platform-safe
- `scripts/release/generate-sha256.sh`
  - reuse checksum generation for desktop and CLI deliverables

### New files to create

- `docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md`
  - the frozen migration contract extracted from `apps/desktop-mac`
- `apps/desktop/package.json`
  - new desktop app package manifest
- `apps/desktop/tsconfig.json`
  - desktop TypeScript config
- `apps/desktop/vite.config.ts`
  - renderer build config
- `apps/desktop/index.html`
  - Tauri renderer entry
- `apps/desktop/src/main.tsx`
  - renderer bootstrap
- `apps/desktop/src/app/App.tsx`
  - application root
- `apps/desktop/src/app/routes.tsx`
  - route inventory matching `apps/desktop-mac`
- `apps/desktop/src/bridge/client.ts`
  - bridge invocation layer for desktop
- `apps/desktop/src/bridge/types.ts`
  - typed bridge contract mirrors
- `apps/desktop/src/store/*`
  - desktop state slices migrated from macOS desktop semantics
- `apps/desktop/src/view-models/*`
  - UI-facing state logic migrated from `apps/desktop-mac`
- `apps/desktop/src/components/*`
  - shared UI components reproducing desktop-mac behavior
- `apps/desktop/src/screens/*`
  - Home, Import, Detail, Settings screens
- `apps/desktop/src/menu/tray.ts`
  - tray/menu quick actions
- `apps/desktop/src/i18n/*`
  - localization layer for desktop
- `apps/desktop/src/tests/*`
  - desktop contract, integration, and renderer tests
- `apps/desktop/src-tauri/Cargo.toml`
  - desktop shell backend manifest
- `apps/desktop/src-tauri/src/lib.rs`
  - Tauri app bootstrap
- `apps/desktop/src-tauri/src/main.rs`
  - desktop runner
- `apps/desktop/src-tauri/src/bridge.rs`
  - shell-to-CLI process invocation
- `apps/desktop/src-tauri/src/menu.rs`
  - menu/tray wiring
- `apps/desktop/src-tauri/src/config.rs`
  - desktop shell path/config resolution
- `apps/desktop/src-tauri/build.rs`
  - register desktop helper resources and build-time config
- `apps/desktop/src-tauri/tauri.conf.json`
  - shared Tauri config
- `apps/desktop/src-tauri/tauri.windows.conf.json`
  - Windows-specific Tauri overrides
- `apps/desktop/src-tauri/capabilities/default.json`
  - desktop capability manifest
- `apps/desktop/README.md`
  - desktop development, packaging, and prerequisites
- `scripts/release/build-cli.sh`
  - create desktop-consumable CLI helper artifacts
- `scripts/release/build-desktop.sh`
  - cross-platform desktop build entry
- `scripts/release/package-desktop.sh`
  - desktop package generation entry
- `scripts/release/validate-desktop-artifacts.sh`
  - desktop artifact validation
- `.github/workflows/release-desktop.yml`
  - desktop CI release workflow
- `.github/workflows/test-cross-platform.yml`
  - matrix test workflow for CLI and desktop smoke validation

## Task 1: Freeze The Desktop Contract

**Files:**
- Create: `docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md`
- Read: `apps/desktop-mac/README.md`
- Read: `apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Navigation/DesktopRoute.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/ViewModels/HomeViewModel.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportViewModel.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/ViewModels/DetailViewModel.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/App/DesktopResourceLocator.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopMutationCoordinator.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopGroupTagStore.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Store/ProjectionRules.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentRenderer.swift`
- Read: `apps/desktop-mac/Sources/DesktopApp/Components/DesktopInteractionMotion.swift`
- Read: `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift`

- [ ] **Step 1: Write the contract document before touching the new desktop shell**

```md
# Skill Flow Desktop Contract

## Routes

- `home`
- `import`
- `detail/:skillId`
- `settings`

## Core workflows

- load inventory on launch
- open detail from selected skill
- import from source recommendations and manual source flows
- mutate projections through serialized mutation coordinator behavior
- edit settings and persist shell-local preferences

## Required shell behaviors

- tray/menu quick entry
- localized strings
- loading, empty, and error states per screen
- restart-safe bridge reconnection
- update-check surface behavior
- projection rules parity
- resource locator parity for helper discovery
```

- [ ] **Step 2: Verify the contract document is present and readable**

Run: `sed -n '1,220p' docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md`
Expected: route inventory, workflow inventory, and shell behavior sections are present

- [ ] **Step 3: Cross-check contract coverage against macOS tests**

```bash
rg -n "Home|Import|Detail|Settings|Mutation|Navigation|Localization|MenuBar" \
  apps/desktop-mac/Tests/SkillFlowDesktopTests
```

Expected: test names map cleanly to the contract sections with no major feature omitted

- [ ] **Step 4: Commit**

```bash
git add docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md
git commit -m "docs: freeze desktop migration contract"
```

## Task 2: Harden Shared Runtime For Cross-Platform CLI

**Files:**
- Modify: `packages/integration/src/utils/constants.ts`
- Modify: `packages/integration/src/project-observations.ts`
- Modify: `packages/core-engine/src/services/source-service.ts`
- Modify: `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `packages/integration/src/tests/target-path-policy.test.ts`
- Test: `packages/integration/src/tests/project-observations.test.ts`
- Test: `packages/core-engine/src/tests/source-service.test.ts`
- Test: `packages/core-engine/src/tests/workspace-bootstrap-service.test.ts`
- Test: `apps/cli/src/tests/bridge-command.test.ts`
- Test: `apps/cli/src/tests/config-integration.test.ts`

- [ ] **Step 1: Add failing CLI/runtime tests for platform helper and bridge behavior**

```ts
it("uses injected test home instead of host home on windows", () => {
  const result = resolveRuntimeHome({
    platform: "win32",
    env: { SKILL_FLOW_TEST_HOME: "C:\\Users\\test-home" },
  });

  expect(result).toBe("C:\\Users\\test-home");
});

it("normalizes bridge helper path for desktop callers", async () => {
  const result = await resolveBridgeExecutable({
    platform: "linux",
    helperOverride: "/tmp/cli/dist/cli.js",
  });

  expect(result.command).toBe("node");
  expect(result.args).toContain("/tmp/cli/dist/cli.js");
});
```

- [ ] **Step 2: Run the new failing tests**

Run: `npm run -w @skill-flow/integration test -- src/tests/target-path-policy.test.ts src/tests/project-observations.test.ts && npm run -w @skill-flow/core-engine test -- src/tests/source-service.test.ts src/tests/workspace-bootstrap-service.test.ts && npm run -w skill-flow test -- src/tests/bridge-command.test.ts src/tests/config-integration.test.ts`
Expected: FAIL with missing bridge/runtime normalization or cross-platform helper coverage

- [ ] **Step 3: Implement the minimal shared runtime hardening**

```ts
export type SupportedPlatform = "darwin" | "linux" | "win32";

export function resolveRuntimeHome(input: {
  platform: SupportedPlatform;
  env: NodeJS.ProcessEnv;
}): string {
  const explicit =
    input.env.SKILL_FLOW_TEST_HOME ??
    input.env.SKILL_FLOW_DESKTOP_TEST_HOME ??
    undefined;

  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }

  return os.homedir();
}

export async function resolveBridgeExecutable(input: {
  platform: SupportedPlatform;
  helperOverride?: string;
}): Promise<{ command: string; args: string[] }> {
  if (input.helperOverride) {
    return { command: "node", args: [input.helperOverride] };
  }

  return buildDefaultCliInvocation(input.platform);
}
```

- [ ] **Step 4: Re-run targeted runtime and CLI tests**

Run: `npm run -w @skill-flow/integration test -- src/tests/target-path-policy.test.ts src/tests/project-observations.test.ts && npm run -w @skill-flow/core-engine test -- src/tests/source-service.test.ts src/tests/workspace-bootstrap-service.test.ts && npm run -w skill-flow test -- src/tests/bridge-command.test.ts src/tests/config-integration.test.ts`
Expected: PASS

- [ ] **Step 5: Run build validation for the shared runtime and CLI**

Run: `npm run -w @skill-flow/integration build && npm run -w @skill-flow/core-engine build && npm run -w skill-flow build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/integration packages/core-engine apps/cli
git commit -m "feat: harden cross-platform cli runtime"
```

## Task 3: Add Desktop Package, Dependencies, And Shell Foundation

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/app/App.tsx`
- Create: `apps/desktop/src/app/routes.tsx`
- Create: `apps/desktop/src/bridge/client.ts`
- Create: `apps/desktop/src/bridge/types.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/bridge.rs`
- Create: `apps/desktop/src-tauri/src/config.rs`
- Create: `apps/desktop/src-tauri/src/menu.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/tauri.windows.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing scaffold test for desktop bootstrap**

```ts
import { describe, expect, it } from "vitest";
import { buildDesktopRouteMap } from "../src/app/routes";

describe("desktop route scaffold", () => {
  it("exposes the four desktop contract roots", () => {
    expect(buildDesktopRouteMap()).toEqual([
      "/",
      "/import",
      "/detail/:skillId",
      "/settings",
    ]);
  });
});
```

- [ ] **Step 2: Run the failing desktop test before creating the app**

Run: `npm run -w @skill-flow/desktop test`
Expected: FAIL because the desktop workspace does not exist yet

- [ ] **Step 3: Create the minimal Tauri + renderer shell**

```json
{
  "name": "@skill-flow/desktop",
  "private": true,
  "type": "module",
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.9.3",
    "vite": "^7.0.0",
    "vitest": "^4.1.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

```ts
export function buildDesktopRouteMap(): string[] {
  return ["/", "/import", "/detail/:skillId", "/settings"];
}
```

```rust
#[tauri::command]
async fn invoke_bridge(request: String) -> Result<String, String> {
    crate::bridge::invoke_bridge_json(request).await
}
```

- [ ] **Step 4: Install the new workspace dependencies**

Run: `npm install`
Expected: PASS and `package-lock.json` includes `@skill-flow/desktop` renderer/Tauri dependencies

- [ ] **Step 5: Add root workspace scripts**

```json
{
  "scripts": {
    "desktop:build": "npm run -w @skill-flow/desktop build",
    "desktop:test": "npm run -w @skill-flow/desktop test",
    "desktop:dev": "npm run -w @skill-flow/desktop tauri:dev"
  }
}
```

- [ ] **Step 6: Re-run desktop scaffold tests**

Run: `npm run -w @skill-flow/desktop test`
Expected: PASS

- [ ] **Step 7: Verify the shell builds**

Run: `npm run -w @skill-flow/desktop build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json apps/desktop
git commit -m "feat: scaffold cross-platform desktop shell"
```

## Task 4: Connect The Desktop Shell To The CLI Bridge

**Files:**
- Modify: `apps/desktop/src/bridge/client.ts`
- Modify: `apps/desktop/src/bridge/types.ts`
- Modify: `apps/desktop/src-tauri/src/bridge.rs`
- Modify: `apps/desktop/src-tauri/src/config.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Test: `apps/desktop/src/tests/bridge-client.test.ts`
- Test: `apps/desktop/src/tests/shell-config.test.ts`

- [ ] **Step 1: Write failing bridge client tests**

```ts
it("serializes bridge requests as json and parses json responses", async () => {
  const bridge = createDesktopBridgeClient({
    invoke: async (_cmd, payload) =>
      JSON.stringify({ ok: true, echo: JSON.parse(payload.request) }),
  });

  const result = await bridge.query({ kind: "inventory" });

  expect(result).toEqual({
    ok: true,
    echo: { kind: "inventory" },
  });
});

it("prefers a bundled helper path in packaged desktop mode", async () => {
  const result = resolveDesktopHelper({
    mode: "bundled",
    bundledExecutable: "/opt/Skill Flow/resources/bin/skill-flow-helper",
  });

  expect(result.command).toBe("/opt/Skill Flow/resources/bin/skill-flow-helper");
  expect(result.args).toEqual([]);
});
```

- [ ] **Step 2: Run the new failing desktop bridge tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/bridge-client.test.ts src/tests/shell-config.test.ts`
Expected: FAIL because the bridge client and shell config do not yet normalize the helper invocation

- [ ] **Step 3: Implement the desktop bridge client and Rust bridge bridge**

```ts
export function createDesktopBridgeClient(deps: {
  invoke: (command: string, payload: { request: string }) => Promise<string>;
}) {
  return {
    async query(request: unknown) {
      const raw = await deps.invoke("invoke_bridge", {
        request: JSON.stringify(request),
      });

      return JSON.parse(raw);
    },
  };
}
```

```rust
pub async fn invoke_bridge_json(request: String) -> Result<String, String> {
    let response = spawn_cli_bridge(request).await.map_err(|err| err.to_string())?;
    Ok(response)
}
```

```ts
export function resolveDesktopHelper(input: {
  mode: "dev" | "bundled";
  helperOverride?: string;
  bundledExecutable?: string;
}) {
  if (input.mode === "bundled") {
    return { command: input.bundledExecutable!, args: [] };
  }

  return { command: "node", args: [input.helperOverride!] };
}
```

- [ ] **Step 4: Re-run desktop bridge tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/bridge-client.test.ts src/tests/shell-config.test.ts`
Expected: PASS

- [ ] **Step 5: Smoke the shell in dev mode**

Run: `npm run -w @skill-flow/desktop tauri:build`
Expected: PASS or a clear platform prerequisite error that matches README prerequisites

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat: connect desktop shell to cli bridge"
```

## Task 5: Port Desktop State Model And Navigation

**Files:**
- Create: `apps/desktop/src/store/async-resource-state.ts`
- Create: `apps/desktop/src/store/desktop-app-state.ts`
- Create: `apps/desktop/src/store/import-state.ts`
- Create: `apps/desktop/src/store/settings-state.ts`
- Create: `apps/desktop/src/store/selection-state.ts`
- Create: `apps/desktop/src/store/workspace-state.ts`
- Create: `apps/desktop/src/store/view-state.ts`
- Create: `apps/desktop/src/navigation/desktop-route.ts`
- Create: `apps/desktop/src/navigation/desktop-navigator.ts`
- Create: `apps/desktop/src/view-models/main-view-model.ts`
- Create: `apps/desktop/src/view-models/home-view-model.ts`
- Create: `apps/desktop/src/view-models/import-view-model.ts`
- Create: `apps/desktop/src/view-models/detail-view-model.ts`
- Create: `apps/desktop/src/view-models/settings-view-model.ts`
- Test: `apps/desktop/src/tests/main-view-model.test.ts`
- Test: `apps/desktop/src/tests/home-view-model.test.ts`
- Test: `apps/desktop/src/tests/import-view-model.test.ts`
- Test: `apps/desktop/src/tests/detail-view-model.test.ts`
- Test: `apps/desktop/src/tests/settings-view-model.test.ts`

- [ ] **Step 1: Add failing state/navigation parity tests**

```ts
it("navigates from home selection into detail route", () => {
  const vm = createMainViewModel(fakeDesktopRuntime());

  vm.selectSkill("skill-1");

  expect(vm.route).toEqual({ kind: "detail", skillId: "skill-1" });
});

it("serializes mutations through a single pending lane", async () => {
  const vm = createImportViewModel(fakeDesktopRuntime());

  await Promise.all([vm.apply("skill-a"), vm.apply("skill-b")]);

  expect(vm.mutationHistory).toEqual(["skill-a", "skill-b"]);
});
```

- [ ] **Step 2: Run the new failing state tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/main-view-model.test.ts src/tests/home-view-model.test.ts src/tests/import-view-model.test.ts src/tests/detail-view-model.test.ts src/tests/settings-view-model.test.ts`
Expected: FAIL because the store and view-model layer is not implemented yet

- [ ] **Step 3: Port the minimal state model from `apps/desktop-mac` semantics**

```ts
export type DesktopRoute =
  | { kind: "home" }
  | { kind: "import" }
  | { kind: "detail"; skillId: string }
  | { kind: "settings" };

export function createMainViewModel(runtime: DesktopRuntimeFacade) {
  let route: DesktopRoute = { kind: "home" };

  return {
    get route() {
      return route;
    },
    selectSkill(skillId: string) {
      route = { kind: "detail", skillId };
    },
    openImport() {
      route = { kind: "import" };
    },
    openSettings() {
      route = { kind: "settings" };
    },
  };
}
```

- [ ] **Step 4: Re-run state/navigation tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/main-view-model.test.ts src/tests/home-view-model.test.ts src/tests/import-view-model.test.ts src/tests/detail-view-model.test.ts src/tests/settings-view-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src
git commit -m "feat: port desktop state and navigation model"
```

## Task 6: Port Home, Import, Detail, And Settings Screens

**Files:**
- Create: `apps/desktop/src/screens/home-screen.tsx`
- Create: `apps/desktop/src/screens/import-screen.tsx`
- Create: `apps/desktop/src/screens/detail-screen.tsx`
- Create: `apps/desktop/src/screens/settings-screen.tsx`
- Create: `apps/desktop/src/components/agent-icon.tsx`
- Create: `apps/desktop/src/components/group-card.tsx`
- Create: `apps/desktop/src/components/group-tags.tsx`
- Create: `apps/desktop/src/components/markdown-document.tsx`
- Create: `apps/desktop/src/components/desktop-motion.tsx`
- Create: `apps/desktop/src/runtime/resource-locator.ts`
- Create: `apps/desktop/src/runtime/settings-store.ts`
- Create: `apps/desktop/src/runtime/group-tag-store.ts`
- Create: `apps/desktop/src/runtime/update-checker.ts`
- Create: `apps/desktop/src/store/projection-rules.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Test: `apps/desktop/src/tests/home-screen.test.tsx`
- Test: `apps/desktop/src/tests/import-screen.test.tsx`
- Test: `apps/desktop/src/tests/detail-screen.test.tsx`
- Test: `apps/desktop/src/tests/settings-screen.test.tsx`
- Test: `apps/desktop/src/tests/resource-locator.test.ts`
- Test: `apps/desktop/src/tests/projection-rules.test.ts`

- [ ] **Step 1: Write failing screen-level tests**

```tsx
it("renders the home screen inventory groups", async () => {
  render(<HomeScreen viewModel={fakeHomeViewModel()} />);

  expect(await screen.findByText("Installed Skills")).toBeInTheDocument();
});

it("renders settings mount path rows", async () => {
  render(<SettingsScreen viewModel={fakeSettingsViewModel()} />);

  expect(await screen.findByText("Codex")).toBeInTheDocument();
  expect(screen.getByText(/\.codex/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the failing screen tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/home-screen.test.tsx src/tests/import-screen.test.tsx src/tests/detail-screen.test.tsx src/tests/settings-screen.test.tsx`
Expected: FAIL because the screen components do not exist yet

- [ ] **Step 3: Implement the minimal screen and component port**

```tsx
export function App() {
  const main = useMainViewModel();

  switch (main.route.kind) {
    case "home":
      return <HomeScreen viewModel={main.home} />;
    case "import":
      return <ImportScreen viewModel={main.import} />;
    case "detail":
      return <DetailScreen viewModel={main.detail} />;
    case "settings":
      return <SettingsScreen viewModel={main.settings} />;
  }
}
```

```tsx
export function MarkdownDocument({ source }: { source: string }) {
  return <article data-testid="markdown-document">{source}</article>;
}
```

- [ ] **Step 4: Re-run screen tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/home-screen.test.tsx src/tests/import-screen.test.tsx src/tests/detail-screen.test.tsx src/tests/settings-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full desktop test suite**

Run: `npm run -w @skill-flow/desktop test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src
git commit -m "feat: port desktop core screens"
```

## Task 7: Port Tray/Menu, Localization, And Mutation Coordination

**Files:**
- Create: `apps/desktop/src/menu/tray.ts`
- Create: `apps/desktop/src/i18n/en.ts`
- Create: `apps/desktop/src/i18n/zh.ts`
- Create: `apps/desktop/src/runtime/mutation-coordinator.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/view-models/*`
- Modify: `apps/desktop/src-tauri/src/menu.rs`
- Test: `apps/desktop/src/tests/tray.test.ts`
- Test: `apps/desktop/src/tests/localization.test.ts`
- Test: `apps/desktop/src/tests/mutation-coordinator.test.ts`

- [ ] **Step 1: Write failing tray/localization/mutation tests**

```ts
it("maps tray quick actions to desktop routes", () => {
  expect(buildTrayMenuModel()).toEqual([
    { id: "open-home", route: { kind: "home" } },
    { id: "open-import", route: { kind: "import" } },
    { id: "open-settings", route: { kind: "settings" } },
  ]);
});

it("queues apply and uninstall actions serially", async () => {
  const coordinator = createMutationCoordinator();
  const history: string[] = [];

  await Promise.all([
    coordinator.run(async () => history.push("apply")),
    coordinator.run(async () => history.push("uninstall")),
  ]);

  expect(history).toEqual(["apply", "uninstall"]);
});
```

- [ ] **Step 2: Run the failing parity tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/tray.test.ts src/tests/localization.test.ts src/tests/mutation-coordinator.test.ts`
Expected: FAIL because tray mapping, localization bundle, and mutation lane are missing

- [ ] **Step 3: Implement the minimal shell parity layer**

```ts
export function buildTrayMenuModel() {
  return [
    { id: "open-home", route: { kind: "home" } },
    { id: "open-import", route: { kind: "import" } },
    { id: "open-settings", route: { kind: "settings" } },
  ];
}

export function createMutationCoordinator() {
  let tail = Promise.resolve();

  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      const next = tail.then(work, work);
      tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}
```

- [ ] **Step 4: Re-run parity tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/tray.test.ts src/tests/localization.test.ts src/tests/mutation-coordinator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src apps/desktop/src-tauri/src/menu.rs
git commit -m "feat: port desktop tray and mutation coordination"
```

## Task 8: Add Cross-Platform Desktop Integration And Smoke Validation

**Files:**
- Create: `apps/desktop/src/tests/desktop-integration.test.ts`
- Create: `apps/desktop/src/tests/desktop-smoke.test.ts`
- Create: `.github/workflows/test-cross-platform.yml`
- Modify: `apps/desktop/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add failing integration and smoke tests**

```ts
it("refreshes inventory after an import mutation", async () => {
  const runtime = fakeDesktopRuntime();
  const vm = createImportViewModel(runtime);

  await vm.apply("skill-a");

  expect(runtime.queryLog).toContain("inventory:refresh");
});
```

```yaml
name: test-cross-platform
on: [push, pull_request]
jobs:
  matrix-test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
```

- [ ] **Step 2: Run the failing integration tests locally**

Run: `npm run -w @skill-flow/desktop test -- src/tests/desktop-integration.test.ts src/tests/desktop-smoke.test.ts`
Expected: FAIL because integration refresh and smoke scaffolding are not yet complete

- [ ] **Step 3: Implement refresh-aware integration hooks and CI matrix**

```ts
await mutationCoordinator.run(async () => {
  await bridge.command({ kind: "apply-skill", skillId });
  await homeViewModel.refresh();
});
```

- [ ] **Step 4: Re-run desktop integration tests**

Run: `npm run -w @skill-flow/desktop test -- src/tests/desktop-integration.test.ts src/tests/desktop-smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Run repository test coverage for shared runtime, CLI, and desktop**

Run: `npm run build && npm run test && npm run -w @skill-flow/desktop build && npm run -w @skill-flow/desktop test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json apps/desktop .github/workflows/test-cross-platform.yml
git commit -m "test: add cross-platform desktop validation matrix"
```

## Task 9: Add Desktop Packaging, Release Scripts, And Prerequisite Docs

**Files:**
- Create: `scripts/release/build-cli.sh`
- Create: `scripts/release/build-desktop.sh`
- Create: `scripts/release/package-desktop.sh`
- Create: `scripts/release/validate-desktop-artifacts.sh`
- Create: `.github/workflows/release-desktop.yml`
- Modify: `apps/desktop/README.md`
- Modify: `apps/cli/package.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `package.json`
- Modify: `scripts/release/generate-sha256.sh`

- [ ] **Step 1: Add failing release validation script checks**

```bash
test -f dist/desktop/linux/sha256.txt
test -f dist/desktop/windows/sha256.txt
test -f dist/desktop/macos/sha256.txt
test -f dist/cli/linux/skill-flow-helper
test -f dist/cli/windows/skill-flow-helper.exe
test -f dist/cli/macos/skill-flow-helper
```

- [ ] **Step 2: Run release validation before scripts exist**

Run: `bash scripts/release/validate-desktop-artifacts.sh`
Expected: FAIL because the new desktop artifacts are not yet produced

- [ ] **Step 3: Implement the build and package scripts**

```bash
#!/usr/bin/env bash
set -euo pipefail

./scripts/release/build-cli.sh
npm run -w @skill-flow/desktop build
npm run -w @skill-flow/desktop tauri:build
bash scripts/release/generate-sha256.sh dist/desktop
```

```md
## Linux prerequisites

Ubuntu/Debian:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```
```

- [ ] **Step 4: Re-run release validation after building artifacts**

Run: `bash scripts/release/build-desktop.sh && bash scripts/release/validate-desktop-artifacts.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release apps/desktop/README.md package.json .github/workflows/release-desktop.yml
git commit -m "feat: add desktop packaging and release flow"
```

## Task 10: Cut Over To The New Desktop Shell

### UI Parity Gate

- [ ] Home top bar, search, project scope, and home content structure match the macOS shell
- [ ] Import recommendation/search states match the macOS shell
- [ ] Detail sidebar/header/document structure match the macOS shell
- [ ] Settings sections and actions match the macOS shell
- [ ] Screen tests assert structure and key behavior, not only string presence

**Files:**
- Modify: `package.json`
- Modify: `apps/desktop/README.md`
- Modify: `docs/plan/cross-platform-desktop/README.md`
- Modify: `docs/plan/cross-platform-desktop/FULL_CROSS_PLATFORM_DESIGN.md`
- Modify: release workflow docs and references that still point to `apps/desktop-mac`
- Delete in a dedicated cleanup commit: `apps/desktop-mac/*` after cross-platform desktop validation is complete

- [ ] **Step 1: Add the final cutover checklist as a failing review gate**

```md
- [ ] `npm run -w @skill-flow/desktop build`
- [ ] `npm run -w @skill-flow/desktop test`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] Desktop package artifacts validated on macOS, Windows, Linux
- [ ] `apps/desktop-mac` no longer referenced by default docs/scripts
```

- [ ] **Step 2: Update default desktop references to the new shell**

```json
{
  "scripts": {
    "desktop:build": "npm run -w @skill-flow/desktop build",
    "desktop:test": "npm run -w @skill-flow/desktop test"
  }
}
```

- [ ] **Step 3: Run the full release-grade verification**

Run: `npm run build && npm run test && npm run -w @skill-flow/desktop build && npm run -w @skill-flow/desktop test && bash scripts/release/validate-desktop-artifacts.sh`
Expected: PASS

- [ ] **Step 4: Commit the cutover**

```bash
git add package.json apps/desktop docs/plan/cross-platform-desktop scripts/release .github/workflows
git commit -m "feat: cut over to cross-platform desktop shell"
```

- [ ] **Step 5: Remove `apps/desktop-mac` in a separate cleanup commit once the new shell ships cleanly**

```bash
git rm -r apps/desktop-mac
git commit -m "delete: remove legacy mac desktop shell"
```

## Self-Review Checklist

- Every migration phase has a concrete deliverable and verification command.
- Runtime hardening comes before shell and screen migration.
- The new desktop shell stays on the existing `bridge --json` boundary.
- Packaging and Linux prerequisites are part of the plan instead of deferred cleanup.
- Cutover and legacy-shell removal are split into separate commits.
