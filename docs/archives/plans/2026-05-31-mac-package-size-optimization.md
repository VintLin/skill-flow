# macOS Package Size Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the real macOS `.app` and `.dmg` size without removing desktop functionality or relying on Rosetta.

**Architecture:** Keep the full npm CLI behavior unchanged, but stop packaging CLI/TUI-only runtime dependencies into the desktop helper. Add a desktop-only bridge entrypoint, prune npm documentation files from the bundled Node runtime, and strip only the Swift app executable before packaging. Do not strip the bundled Node binary because local experiments showed `strip` invalidates Node's existing code signature.

**Tech Stack:** Swift Package Manager, Bash release scripts, Node.js 22 runtime bundle, esbuild ESM bundling. Context7 resolved the current esbuild docs as `/evanw/esbuild`; this plan uses esbuild's `bundle`, `platform: "node"`, `format: "esm"`, and `minify` options for the desktop-only entrypoint.

---

## Current Evidence

- Current arm64 app: `168M`
- Current arm64 DMG: `71M`
- Current universal app: `307M`
- Current universal DMG: `125M`
- Current arm64 helper: `21M`
- Current arm64 helper `node_modules`: `20M`
- Current arm64 Swift executable: `13M`
- Current bundled arm64 npm directory: `15M`
- npm docs/man/Markdown/map candidates: `3.5M`
- Temp `strip -x` experiment on `SkillFlowDesktop`: `13,496,880` bytes to `5,216,176` bytes

## File Structure

- Create `apps/cli/src/bridge-runner.ts`
  - Owns JSON bridge command option handling, stdin reading, response writing, and exit code decisions.
  - Used by the normal CLI `bridge` command and by the desktop-only bridge entrypoint.
- Create `apps/cli/src/desktop-bridge.ts`
  - Desktop helper entrypoint.
  - Instantiates `SkillFlowApp` and runs only bridge protocol handling.
  - Does not import `commander`, `ink`, `react`, or TUI modules.
- Modify `apps/cli/src/cli.tsx`
  - Replace inline `bridge` action logic with `runBridgeCommand(app, options)`.
  - Keep all existing user-facing CLI commands intact.
- Modify `scripts/release/build-cli-package.mjs`
  - Build `desktop-bridge.js` as a bundled Node ESM entrypoint.
  - Keep existing `cli.js` and `bridge-command.js` package outputs.
- Modify `scripts/release/package-desktop-mac.sh`
  - Stage only `desktop-bridge.js` into the app helper.
  - Remove helper `npm install` and copied `@skill-flow/*` package dists.
  - Prune bundled npm docs/man/Markdown/map files after copying npm.
  - Run `strip -x` on the Swift executable after copying/lipo and before DMG creation.
- Modify `scripts/release/validate-mac-artifacts.sh`
  - Require `helper/dist/desktop-bridge.js`.
  - Reject packaged helper `dist/cli.js`, `commander`, `ink`, and `react`.
  - Execute the desktop bridge with invalid JSON to prove the bundled helper starts without helper `node_modules`.
  - Keep existing Node/npm/npx validation.
- Create `scripts/release/audit-mac-package-size.sh`
  - Prints reproducible KiB sizes for app, DMG, helper, helper `node_modules`, Swift executable, Node runtime, npm runtime, and npm prune candidates.
- Modify `apps/cli/src/tests/npm-package.test.ts`
  - Assert published package still includes `cli.js`, `bridge-command.js`, and `desktop-bridge.js`.
  - Assert bundled entries do not import unpublished workspace packages.
- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
  - Prefer `helper/dist/desktop-bridge.js`.
  - Keep `helper/dist/cli.js` as a fallback for development and stale local bundles.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
  - Add source-level assertions that desktop bridge resolution prefers `desktop-bridge.js` and keeps `cli.js` fallback.

---

### Task 1: Add A Reproducible macOS Package Size Audit

**Files:**
- Create: `scripts/release/audit-mac-package-size.sh`

- [ ] **Step 1: Create the audit script**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="${1:-}"
DMG_PATH="${2:-}"

if [[ -z "$APP_BUNDLE" || ! -d "$APP_BUNDLE" ]]; then
  echo "Usage: $0 '/path/to/Skill Flow.app' [/path/to/Skill-Flow.dmg]" >&2
  exit 1
fi

size_kib() {
  local target="$1"
  if [[ -e "$target" ]]; then
    du -sk "$target" | awk '{print $1}'
  else
    printf '%s' "0"
  fi
}

print_row() {
  local label="$1"
  local target="$2"
  printf '%-34s %10s KiB  %s\n' "$label" "$(size_kib "$target")" "$target"
}

HELPER_DIR="$APP_BUNDLE/Contents/Resources/helper"
HELPER_NODE_MODULES="$HELPER_DIR/node_modules"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/SkillFlowDesktop"
NODE_RUNTIME_DIR="$APP_BUNDLE/Contents/Resources/node"

print_row "app bundle" "$APP_BUNDLE"
if [[ -n "$DMG_PATH" ]]; then
  print_row "dmg" "$DMG_PATH"
fi
print_row "helper" "$HELPER_DIR"
print_row "helper node_modules" "$HELPER_NODE_MODULES"
print_row "swift executable" "$EXECUTABLE"
print_row "node runtime" "$NODE_RUNTIME_DIR"

while IFS= read -r -d '' npm_dir; do
  print_row "npm runtime" "$npm_dir"
  candidate_kib="$(
    find "$npm_dir" \( -path '*/docs/*' -o -path '*/man/*' -o -name '*.md' -o -name '*.markdown' -o -name '*.map' \) \
      -type f -print0 2>/dev/null \
      | xargs -0 du -ck 2>/dev/null \
      | awk '/total$/ {print $1}'
  )"
  printf '%-34s %10s KiB  %s\n' "npm prune candidates" "${candidate_kib:-0}" "$npm_dir"
done < <(find "$NODE_RUNTIME_DIR" -path '*/lib/node_modules/npm' -type d -print0 2>/dev/null)
```

- [ ] **Step 2: Make the script executable**

Run:

```bash
chmod +x scripts/release/audit-mac-package-size.sh
```

Expected: no output.

- [ ] **Step 3: Run the audit against the current arm64 artifact**

Run:

```bash
scripts/release/audit-mac-package-size.sh \
  "dist/desktop-mac/arm64/Skill Flow.app" \
  "dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg"
```

Expected: output includes non-zero rows for `app bundle`, `dmg`, `helper`, `helper node_modules`, `swift executable`, `node runtime`, and `npm runtime`.

- [ ] **Step 4: Commit**

```bash
git add scripts/release/audit-mac-package-size.sh
git commit -m "chore: add mac package size audit"
```

---

### Task 2: Add A Desktop-Only Bridge Entrypoint

**Files:**
- Create: `apps/cli/src/bridge-runner.ts`
- Create: `apps/cli/src/desktop-bridge.ts`
- Modify: `apps/cli/src/cli.tsx`
- Modify: `scripts/release/build-cli-package.mjs`
- Modify: `apps/cli/src/tests/npm-package.test.ts`

- [ ] **Step 1: Write failing package-output assertions**

Modify `apps/cli/src/tests/npm-package.test.ts` inside `packed CLI does not depend on unpublished workspace packages`:

```ts
    const packedCliEntry = await fs.readFile(path.join(packedPackageRoot, "dist", "cli.js"), "utf8");
    const packedBridgeEntry = await fs.readFile(
      path.join(packedPackageRoot, "dist", "bridge-command.js"),
      "utf8",
    );
    const packedDesktopBridgeEntry = await fs.readFile(
      path.join(packedPackageRoot, "dist", "desktop-bridge.js"),
      "utf8",
    );

    expect(packedCliEntry).not.toMatch(internalImportPattern);
    expect(packedBridgeEntry).not.toMatch(internalImportPattern);
    expect(packedDesktopBridgeEntry).not.toMatch(internalImportPattern);
    expect(packedDesktopBridgeEntry).not.toMatch(/from\s+["'](?:commander|ink|react|react\/jsx-runtime)["']/);
```

Modify the second test's final assertion:

```ts
    await expect(fs.stat(path.join(stageRoot, "dist", "cli.js"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(stageRoot, "dist", "bridge-command.js"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(stageRoot, "dist", "desktop-bridge.js"))).resolves.toBeTruthy();
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run -w skill-flow test -- src/tests/npm-package.test.ts
```

Expected: FAIL because `dist/desktop-bridge.js` does not exist.

- [ ] **Step 3: Create reusable bridge command runner**

Create `apps/cli/src/bridge-runner.ts`:

```ts
import {
  buildBridgeResponse,
  parseBridgeRequest,
  type BridgeRequest,
} from "@skill-flow/shared-types/protocol";
import type { SkillFlowApp } from "@skill-flow/query/runtime";
import { executeBridgeRequest } from "./bridge-command.js";

export type BridgeCommandOptions = {
  json?: boolean;
  request?: string;
};

export type BridgeCommandIO = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

export async function runBridgeCommand(
  app: SkillFlowApp,
  options: BridgeCommandOptions,
  io: BridgeCommandIO = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
): Promise<number> {
  if (!options.json) {
    io.stderr.write("bridge requires --json\n");
    return 2;
  }

  const requestInput = options.request ?? (await readStdin(io.stdin)).trim();
  if (!requestInput) {
    io.stdout.write(`${JSON.stringify(buildBridgeResponse({
      command: "list",
      ok: false,
      errors: [
        {
          code: "BRIDGE_EMPTY_REQUEST",
          message: "Bridge request payload is empty.",
        },
      ],
    }))}\n`);
    return 1;
  }

  let request: BridgeRequest;
  try {
    request = parseBridgeRequest(JSON.parse(requestInput));
  } catch (error) {
    io.stdout.write(`${JSON.stringify(buildBridgeResponse({
      command: "list",
      ok: false,
      errors: [
        {
          code: "BRIDGE_REQUEST_INVALID",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }))}\n`);
    return 1;
  }

  const response = await executeBridgeRequest(app, request);
  io.stdout.write(`${JSON.stringify(response)}\n`);
  return response.ok ? 0 : 1;
}

export function parseBridgeProcessArgs(args: string[]): BridgeCommandOptions {
  const bridgeArgs = args[0] === "bridge" ? args.slice(1) : args;
  const options: BridgeCommandOptions = {};
  for (let index = 0; index < bridgeArgs.length; index += 1) {
    const arg = bridgeArgs[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--request") {
      const value = bridgeArgs[index + 1];
      if (value === undefined) {
        throw new Error("bridge --request requires a JSON value");
      }
      options.request = value;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported bridge argument: ${arg}`);
  }
  return options;
}

async function readStdin(stdin: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
```

- [ ] **Step 4: Create desktop bridge entrypoint**

Create `apps/cli/src/desktop-bridge.ts`:

```ts
#!/usr/bin/env node
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { parseBridgeProcessArgs, runBridgeCommand } from "./bridge-runner.js";

process.env.SKILL_FLOW_CALLER ??= "desktop-bridge";

const app = new SkillFlowApp();

try {
  const options = parseBridgeProcessArgs(process.argv.slice(2));
  process.exitCode = await runBridgeCommand(app, options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
```

- [ ] **Step 5: Replace inline CLI bridge handling**

Modify `apps/cli/src/cli.tsx` imports:

```ts
import { runBridgeCommand } from "./bridge-runner.js";
```

Remove these imports from `apps/cli/src/cli.tsx`:

```ts
import {
  buildBridgeResponse,
  parseBridgeRequest,
  type BridgeRequest,
} from "@skill-flow/shared-types/protocol";
import { executeBridgeRequest } from "./bridge-command.js";
```

Replace the `program.command("bridge")` action body with:

```ts
  .action(async (options: { json?: boolean; request?: string }) => {
    process.exitCode = await runBridgeCommand(app, options);
  });
```

Delete the `readStdin()` function from `apps/cli/src/cli.tsx`.

- [ ] **Step 6: Add the esbuild desktop bridge entry**

Modify `scripts/release/build-cli-package.mjs`:

```js
await build({
  entryPoints: {
    cli: path.join(cliRoot, "src", "cli.tsx"),
    "bridge-command": path.join(cliRoot, "src", "bridge-command.ts"),
  },
  outdir: distRoot,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["commander", "ink", "react", "react/jsx-runtime"],
});

await build({
  entryPoints: {
    "desktop-bridge": path.join(cliRoot, "src", "desktop-bridge.ts"),
  },
  outdir: distRoot,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  minify: true,
});
```

- [ ] **Step 7: Run package tests**

Run:

```bash
npm run -w skill-flow test -- src/tests/npm-package.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run bridge command tests**

Run:

```bash
npm run -w skill-flow test -- src/tests/bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/bridge-runner.ts apps/cli/src/desktop-bridge.ts apps/cli/src/cli.tsx scripts/release/build-cli-package.mjs apps/cli/src/tests/npm-package.test.ts
git commit -m "feat: add desktop bridge helper entry"
```

---

### Task 3: Package Only The Desktop Bridge Helper

**Files:**
- Modify: `scripts/release/package-desktop-mac.sh`
- Modify: `scripts/release/validate-mac-artifacts.sh`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing validation checks for helper contents**

Modify `scripts/release/validate-mac-artifacts.sh` after the helper directory check:

```bash
DESKTOP_BRIDGE="$HELPER_DIR/dist/desktop-bridge.js"
LEGACY_CLI_HELPER="$HELPER_DIR/dist/cli.js"

[[ -f "$DESKTOP_BRIDGE" ]] || {
  echo "Missing desktop bridge helper: $DESKTOP_BRIDGE" >&2
  exit 1
}

if [[ -e "$LEGACY_CLI_HELPER" ]]; then
  echo "Desktop package should not include legacy CLI helper: $LEGACY_CLI_HELPER" >&2
  exit 1
fi

for cli_only_dependency in commander ink react; do
  if [[ -e "$HELPER_DIR/node_modules/$cli_only_dependency" ]]; then
    echo "Desktop helper should not include CLI-only dependency: $cli_only_dependency" >&2
    exit 1
  fi
done
```

- [ ] **Step 2: Run validation to verify it fails against the current artifact**

Run:

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
```

Expected: FAIL with `Missing desktop bridge helper`.

- [ ] **Step 3: Stage only `desktop-bridge.js`**

Replace `stage_helper()` in `scripts/release/package-desktop-mac.sh` with:

```bash
stage_helper() {
  local helper_stage="$1"
  local cli_version

  cli_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').version")"

  mkdir -p "$helper_stage/dist"
  cp "$CLI_DIST_DIR/desktop-bridge.js" "$helper_stage/dist/desktop-bridge.js"

  cat > "$helper_stage/package.json" <<EOF
{
  "name": "skill-flow-helper",
  "version": "$cli_version",
  "private": true,
  "type": "module"
}
EOF
}
```

- [ ] **Step 4: Prefer `desktop-bridge.js` in the Swift bridge client**

Modify `resolveHelperURL()` in `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`:

```swift
        if let bundledHelperURL = existingURL(at: Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/helper/dist/desktop-bridge.js")) {
            return bundledHelperURL
        }

        if let resourcePath = Bundle.main.path(forResource: "desktop-bridge", ofType: "js", inDirectory: "helper/dist"),
           let bundledHelperURL = existingURL(at: URL(fileURLWithPath: resourcePath)) {
            return bundledHelperURL
        }

        if let bundledHelperURL = existingURL(at: Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/helper/dist/cli.js")) {
            return bundledHelperURL
        }

        if let resourcePath = Bundle.main.path(forResource: "cli", ofType: "js", inDirectory: "helper/dist"),
           let bundledHelperURL = existingURL(at: URL(fileURLWithPath: resourcePath)) {
            return bundledHelperURL
        }
```

Keep the existing development fallback candidates for `apps/cli/dist/cli.js`.

- [ ] **Step 5: Add Swift source assertions**

Add this test to `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`:

```swift
    func testDesktopBridgeHelperIsPreferredOverLegacyCliHelper() throws {
        let source = try sourceText()

        XCTAssertTrue(source.contains("helper/dist/desktop-bridge.js"))
        XCTAssertTrue(source.contains("forResource: \"desktop-bridge\", ofType: \"js\", inDirectory: \"helper/dist\""))
        XCTAssertTrue(source.contains("helper/dist/cli.js"))
        XCTAssertLessThan(
            source.range(of: "helper/dist/desktop-bridge.js")!.lowerBound,
            source.range(of: "helper/dist/cli.js")!.lowerBound
        )
    }
```

- [ ] **Step 6: Add a runtime validation for the bridge helper**

Modify `scripts/release/validate-mac-artifacts.sh` inside the per-architecture loop after the npm/npx version probes:

```bash
    set +e
    BRIDGE_INVALID_OUTPUT="$(printf '{' | "$NODE_EXECUTABLE" "$DESKTOP_BRIDGE" bridge --json 2>/dev/null)"
    BRIDGE_INVALID_STATUS="$?"
    set -e
    if [[ "$BRIDGE_INVALID_STATUS" -ne 1 ]]; then
      echo "Desktop bridge invalid JSON probe returned unexpected status: $BRIDGE_INVALID_STATUS" >&2
      exit 1
    fi
    printf '%s' "$BRIDGE_INVALID_OUTPUT" | "$NODE_EXECUTABLE" -e '
const fs = require("node:fs");
const response = JSON.parse(fs.readFileSync(0, "utf8"));
if (response.ok !== false || !Array.isArray(response.errors)) {
  process.exit(1);
}
'
```

- [ ] **Step 7: Run Swift tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter BridgeClientExecutionTests
```

Expected: PASS.

- [ ] **Step 8: Run shell syntax checks**

Run:

```bash
bash -n scripts/release/package-desktop-mac.sh
bash -n scripts/release/validate-mac-artifacts.sh
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add scripts/release/package-desktop-mac.sh scripts/release/validate-mac-artifacts.sh apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "fix: package desktop bridge without cli dependencies"
```

---

### Task 4: Prune Bundled npm Documentation Files

**Files:**
- Modify: `scripts/release/package-desktop-mac.sh`
- Modify: `scripts/release/validate-mac-artifacts.sh`

- [ ] **Step 1: Add validation that npm docs/man are absent**

Modify `scripts/release/validate-mac-artifacts.sh` inside the per-architecture loop after npm/npx version probes:

```bash
    NPM_ROOT="$NODE_RUNTIME_DIR/$arch/lib/node_modules/npm"
    if [[ -d "$NPM_ROOT/docs" || -d "$NPM_ROOT/man" ]]; then
      echo "Bundled npm should not include docs/man directories: $NPM_ROOT" >&2
      exit 1
    fi
```

- [ ] **Step 2: Run validation to verify it fails against the current artifact**

Run:

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
```

Expected: FAIL with `Bundled npm should not include docs/man directories`.

- [ ] **Step 3: Add npm pruning function**

Add this function to `scripts/release/package-desktop-mac.sh` before `stage_node_runtime()`:

```bash
prune_bundled_npm() {
  local runtime_dir="$1"
  local npm_root="$runtime_dir/lib/node_modules/npm"

  if [[ ! -d "$npm_root" ]]; then
    echo "Unable to prune npm; missing directory: $npm_root" >&2
    exit 1
  fi

  rm -rf "$npm_root/docs" "$npm_root/man"
  find "$npm_root" \
    \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \) \
    -type f \
    ! -iname 'license*' \
    -delete
}
```

- [ ] **Step 4: Call pruning for cached and freshly extracted runtimes**

In the dev cached runtime branch, after copying `installed_runtime_dir` to `dest_dir`, add:

```bash
      prune_bundled_npm "$dest_dir"
```

In the fresh extraction path, after copying `npm` and before the version probes, add:

```bash
  prune_bundled_npm "$dest_dir"
```

- [ ] **Step 5: Run shell syntax check**

Run:

```bash
bash -n scripts/release/package-desktop-mac.sh
bash -n scripts/release/validate-mac-artifacts.sh
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/release/package-desktop-mac.sh scripts/release/validate-mac-artifacts.sh
git commit -m "fix: prune bundled npm docs"
```

---

### Task 5: Strip Only The Swift Executable

**Files:**
- Modify: `scripts/release/package-desktop-mac.sh`
- Modify: `scripts/release/validate-mac-artifacts.sh`

- [ ] **Step 1: Add executable sanity validation**

Modify `scripts/release/validate-mac-artifacts.sh` after `ACTUAL_ARCHS="$(lipo -archs "$EXECUTABLE")"`:

```bash
  EXECUTABLE_FILE_TYPE="$(file "$EXECUTABLE")"
  if [[ "$EXECUTABLE_FILE_TYPE" != *"Mach-O"* ]]; then
    echo "Unexpected executable file type: $EXECUTABLE_FILE_TYPE" >&2
    exit 1
  fi
```

- [ ] **Step 2: Strip the Swift executable after copy/lipo**

Modify `scripts/release/package-desktop-mac.sh` after:

```bash
chmod +x "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
```

Add:

```bash
strip -x "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
chmod +x "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
```

- [ ] **Step 3: Run shell syntax checks**

Run:

```bash
bash -n scripts/release/package-desktop-mac.sh
bash -n scripts/release/validate-mac-artifacts.sh
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/release/package-desktop-mac.sh scripts/release/validate-mac-artifacts.sh
git commit -m "fix: strip mac desktop executable"
```

---

### Task 6: Build Artifacts And Compare Real Size

**Files:**
- No source changes unless a verification failure identifies a concrete bug in the changed files above.

- [ ] **Step 1: Run JS build and tests**

Run:

```bash
npm run build
npm run -w skill-flow test -- src/tests/npm-package.test.ts src/tests/bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run desktop Swift tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter BridgeClientExecutionTests
```

Expected: PASS.

- [ ] **Step 3: Build arm64 macOS package**

Run:

```bash
scripts/release/package-desktop-mac.sh --arch arm64 --mode dev
```

Expected: output includes:

```text
Architectures: arm64
Bundled Node.js: v22.22.2
Bundled npm/npx: yes
```

- [ ] **Step 4: Validate arm64 artifact**

Run:

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
hdiutil verify "dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg"
```

Expected: validation prints `Artifact validation passed`; `hdiutil verify` prints `VALID`.

- [ ] **Step 5: Audit arm64 package size**

Run:

```bash
scripts/release/audit-mac-package-size.sh \
  "dist/desktop-mac/arm64/Skill Flow.app" \
  "dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg"
```

Expected:
- `helper node_modules` is `0 KiB`.
- `helper` is substantially smaller than the previous `21M`.
- `swift executable` is substantially smaller than the previous `13M`.
- `npm prune candidates` is `0 KiB` or close to zero.

- [ ] **Step 6: Build universal macOS package**

Run:

```bash
scripts/release/package-desktop-mac.sh --arch universal --mode dev
```

Expected: output includes:

```text
Architectures: x86_64 arm64
Bundled Node.js: v22.22.2
Bundled npm/npx: yes
```

- [ ] **Step 7: Validate universal artifact**

Run:

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/universal/Skill Flow.app" arm64,x86_64
hdiutil verify "dist/desktop-mac/universal/Skill-Flow-universal-dev.dmg"
```

Expected: validation prints `Artifact validation passed`; `hdiutil verify` prints `VALID`.

- [ ] **Step 8: Audit universal package size**

Run:

```bash
scripts/release/audit-mac-package-size.sh \
  "dist/desktop-mac/universal/Skill Flow.app" \
  "dist/desktop-mac/universal/Skill-Flow-universal-dev.dmg"
```

Expected:
- `helper node_modules` is `0 KiB`.
- Universal DMG is smaller than the previous `125M`.
- Universal app is smaller than the previous `307M`.

- [ ] **Step 9: Commit verification-only script adjustments if any were required**

If Task 6 required no source changes, skip this step.

If a validation failure required a change to one of the files already touched by Tasks 1-5, commit only that fix:

```bash
git add scripts/release package.json apps/cli apps/desktop-mac
git commit -m "fix: validate optimized mac package"
```

---

## Not Included

- Do not strip `Contents/Resources/node/*/bin/node`. Local testing reduced the binary size, but `strip` warned that it invalidates Node's code signature.
- Do not remove npm/npx. Desktop ClawHub imports use bundled `npx`, so npm/npx are part of the current runtime contract.
- Do not remove x86_64 from the universal package. Release recommendation can steer most users to arm64, but universal remains useful for users who need one artifact across Apple Silicon and Intel Macs.
- Do not change public CLI behavior. The desktop optimization is isolated to the packaged app helper.

## Expected Outcome

- The largest direct saving should come from removing helper `node_modules` from the desktop app, currently measured at `20M` uncompressed in the arm64 app.
- Swift `strip -x` should save about `8M` uncompressed on arm64 based on the local temp experiment.
- npm pruning should save about `3.5M` uncompressed per bundled architecture based on the current artifact.
- Final compressed DMG savings will be smaller than raw `.app` savings because UDZO already compresses text-heavy JavaScript and npm files.

## Self-Review

- Spec coverage: The plan continues real size investigation and defines concrete changes that can reduce packaged artifacts, not only docs.
- Placeholder scan: No unresolved placeholder steps remain.
- Type consistency: `runBridgeCommand`, `parseBridgeProcessArgs`, and `desktop-bridge.js` names are consistent across build, packaging, validation, and Swift resolution steps.
