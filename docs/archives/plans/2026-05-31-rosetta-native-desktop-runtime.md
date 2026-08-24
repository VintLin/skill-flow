# Rosetta Native Desktop Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make macOS desktop release packages run the bridge and ClawHub/skills.sh imports through the bundled native Node/npm/npx toolchain on Apple Silicon, without removing Intel Mac release artifacts.

**Architecture:** Keep the existing three-asset release matrix: `arm64`, `x86_64`, and `universal`. Package each app bundle with a same-architecture Node toolchain, let the Swift bridge prepend that toolchain to helper `PATH`, and let JS ClawHub execution prefer the explicit bundled `npx` path when present. Validation scripts lock the release contract by checking executable architectures, bundled npm/npx availability, and native execution metadata.

**Tech Stack:** Swift 6, Swift Foundation `Process`, XCTest, Node.js ESM, Vitest, Bash release scripts, macOS `PlistBuddy`, `lipo`, and official Node.js macOS runtime archives.

---

## File Structure

- `packages/integration/src/utils/clawhub.ts`: owns ClawHub command execution. It will resolve the `npx` command from `SKILL_FLOW_BUNDLED_NPX` first, then fallback to `npx`.
- `packages/integration/src/tests/clawhub.test.ts`: covers the command resolution contract for bundled `npx` and existing fallback behavior.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`: owns desktop helper process startup and dependency preflight. It will expose focused helpers for bundled Node bin discovery and bridge environment construction.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`: covers environment construction and bundled `npx` preflight behavior.
- `scripts/release/package-desktop-mac.sh`: stages `node`, `npm`, `npx`, and npm support files for each packaged architecture, and writes `LSRequiresNativeExecution` for Apple Silicon-capable bundles.
- `scripts/release/validate-mac-artifacts.sh`: validates the packaged runtime contract for every expected architecture.
- `README.md`, `README.zh.md`, `apps/desktop-mac/README.md`: documents the new release behavior and keeps `git` as the remaining external dependency.

### Task 1: Make ClawHub Prefer Bundled npx

**Files:**
- Modify: `packages/integration/src/tests/clawhub.test.ts`
- Modify: `packages/integration/src/utils/clawhub.ts`

- [ ] **Step 1: Write the failing bundled npx test**

Update the imports and setup in `packages/integration/src/tests/clawhub.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
```

Add this environment backup near `const execFileMock = vi.hoisted(() => vi.fn());`:

```ts
const originalBundledNpx = process.env.SKILL_FLOW_BUNDLED_NPX;
```

Update the test lifecycle:

```ts
describe("clawhub utils", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    delete process.env.SKILL_FLOW_BUNDLED_NPX;
  });

  afterEach(() => {
    if (originalBundledNpx === undefined) {
      delete process.env.SKILL_FLOW_BUNDLED_NPX;
    } else {
      process.env.SKILL_FLOW_BUNDLED_NPX = originalBundledNpx;
    }
  });
```

Add this test after `parses the actual clawhub search output shape`:

```ts
  test("uses bundled npx override when provided", async () => {
    const bundledNpx = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/npx";
    process.env.SKILL_FLOW_BUNDLED_NPX = bundledNpx;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: { cwd?: string; encoding?: string; env?: NodeJS.ProcessEnv },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "summarize  Summarize  (4.030)", "");
      },
    );

    await expect(searchClawHubSkills("summarize", 1)).resolves.toEqual([
      { slug: "summarize", title: "Summarize", score: 4.03 },
    ]);

    expect(execFileMock).toHaveBeenCalledWith(
      bundledNpx,
      ["-y", "clawhub@latest", "search", "summarize", "--limit", "1"],
      expect.objectContaining({
        encoding: "utf8",
        env: expect.objectContaining({
          SKILL_FLOW_BUNDLED_NPX: bundledNpx,
        }),
      }),
      expect.any(Function),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/clawhub.test.ts
```

Expected: FAIL because `clawhub()` still calls `"npx"` instead of the bundled override path.

- [ ] **Step 3: Implement minimal ClawHub command resolution**

Modify `packages/integration/src/utils/clawhub.ts` by adding this constant near the imports:

```ts
const BUNDLED_NPX_ENV = "SKILL_FLOW_BUNDLED_NPX";
```

Add this helper before `export async function clawhub`:

```ts
function resolveNpxCommand(env: NodeJS.ProcessEnv = process.env): string {
  const bundledNpx = env[BUNDLED_NPX_ENV]?.trim();
  return bundledNpx && bundledNpx.length > 0 ? bundledNpx : "npx";
}
```

Update `clawhub()` to use the resolved command:

```ts
export async function clawhub(
  args: string[],
  options: { cwd?: string } = {},
): Promise<string> {
  const { stdout } = await execFileAsync(
    resolveNpxCommand(),
    ["-y", "clawhub@latest", ...args],
    {
      cwd: options.cwd,
      encoding: "utf8",
      env: process.env,
    },
  );

  return stdout.trim();
}
```

- [ ] **Step 4: Run focused integration tests**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/clawhub.test.ts
```

Expected: PASS. The existing search parsing and suspicious install tests still pass, and the new bundled npx test passes.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add packages/integration/src/utils/clawhub.ts packages/integration/src/tests/clawhub.test.ts
git commit -m "fix: prefer bundled npx for clawhub"
```

Expected: commit succeeds with only the ClawHub utility and its tests staged.

### Task 2: Pass Bundled Runtime Environment From Desktop Bridge

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`

- [ ] **Step 1: Write failing bridge environment tests**

Add these tests after `testNodeResolutionFallsBackToEnvWhenNoKnownNodePathExists` in `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`:

```swift
    func testBundledNodeBinResolutionRequiresBundledNode() {
        let bundleURL = URL(fileURLWithPath: "/Applications/Skill Flow.app")
        let bundledNode = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/node"

        let resolved = BridgeClient.resolveBundledNodeBinDirectory(
            bundleURL: bundleURL,
            architecture: "arm64",
            isExecutable: { path in path == bundledNode }
        )

        XCTAssertEqual(
            resolved,
            "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"
        )
    }

    func testBridgeEnvironmentPrependsBundledNodeBinAndExportsBundledNpx() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"
        let bundledNpx = "\(bundledBin)/npx"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: ["PATH": "/usr/bin", "HOME": "/Users/example"],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { path in path == bundledNpx }
        )

        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
        XCTAssertEqual(environment["SKILL_FLOW_BUNDLED_NPX"], bundledNpx)
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["HOME"], "/Users/example")
    }

    func testBridgeEnvironmentSkipsBundledNpxWhenItIsMissing() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: ["PATH": "/usr/bin"],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { _ in false }
        )

        XCTAssertNil(environment["SKILL_FLOW_BUNDLED_NPX"])
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/desktop-mac
swift test --filter 'BridgeClientExecutionTests/test(BundledNodeBinResolutionRequiresBundledNode|BridgeEnvironmentPrependsBundledNodeBinAndExportsBundledNpx|BridgeEnvironmentSkipsBundledNpxWhenItIsMissing)'
```

Expected: FAIL because `BridgeClient` does not yet expose `resolveBundledNodeBinDirectory` or `bridgeEnvironment`.

- [ ] **Step 3: Add focused runtime environment helpers**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`, add these static helpers after `resolveNodeExecutable(...)`:

```swift
    static func resolveBundledNodeBinDirectory(
        bundleURL: URL = Bundle.main.bundleURL,
        architecture: String = BridgeClient.currentNodeArchitecture,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> String? {
        let bundledNodePath = bundleURL
            .appendingPathComponent("Contents/Resources/node/\(architecture)/bin/node")
            .path

        guard isExecutable(bundledNodePath) else {
            return nil
        }

        return URL(fileURLWithPath: bundledNodePath)
            .deletingLastPathComponent()
            .path
    }

    static func bridgeEnvironment(
        baseEnvironment: [String: String] = ProcessInfo.processInfo.environment,
        bundledNodeBinDirectory: String? = BridgeClient.resolveBundledNodeBinDirectory(),
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> [String: String] {
        var environment = baseEnvironment
        environment["SKILL_FLOW_CALLER"] = "desktop-bridge"

        guard let bundledNodeBinDirectory else {
            return environment
        }

        let existingPath = environment["PATH"] ?? ""
        environment["PATH"] = existingPath.isEmpty
            ? bundledNodeBinDirectory
            : "\(bundledNodeBinDirectory):\(existingPath)"

        let bundledNpx = URL(fileURLWithPath: bundledNodeBinDirectory)
            .appendingPathComponent("npx")
            .path
        if isExecutable(bundledNpx) {
            environment["SKILL_FLOW_BUNDLED_NPX"] = bundledNpx
        }

        return environment
    }
```

- [ ] **Step 4: Use the helpers in bridge process startup**

In `send(command:payload:)`, replace the current environment block:

```swift
        process.environment = ProcessInfo.processInfo.environment.merging([
            "SKILL_FLOW_CALLER": "desktop-bridge"
        ]) { _, new in new }
```

with:

```swift
        let bundledNodeBinDirectory = Self.resolveBundledNodeBinDirectory()
        process.environment = Self.bridgeEnvironment(
            bundledNodeBinDirectory: bundledNodeBinDirectory
        )
```

- [ ] **Step 5: Run focused Swift tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter 'BridgeClientExecutionTests/test(BundledNodeBinResolutionRequiresBundledNode|BridgeEnvironmentPrependsBundledNodeBinAndExportsBundledNpx|BridgeEnvironmentSkipsBundledNpxWhenItIsMissing)'
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "fix: pass bundled node toolchain to desktop helper"
```

Expected: commit succeeds with only Swift bridge and Swift tests staged.

### Task 3: Use Bundled npx During ClawHub Preflight

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`

- [ ] **Step 1: Write the failing source-level preflight test**

Add this test after `testRuntimeMissingCommandErrorsAreMappedToDependencyGuidance`:

```swift
    func testClawHubPreflightAcceptsBundledNpxBeforeSystemNpx() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift")

        XCTAssertTrue(source.contains("bundledNpxPath(in: bundledNodeBinDirectory)"))
        XCTAssertTrue(source.contains("if locator.hasPrefix(\"clawhub:\"), bundledNpxPath(in: bundledNodeBinDirectory) == nil, !isCommandAvailable(\"npx\")"))
        XCTAssertTrue(source.contains("bundledNodeBinDirectory: String?"))
    }
```

Add this helper near the bottom of `BridgeClientExecutionTests` before `SlowBridgeFixture`:

```swift
private func sourceText(at relativePath: String) throws -> String {
    let packageRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
    let fileURL = packageRoot.appendingPathComponent(relativePath)
    return try String(contentsOf: fileURL, encoding: .utf8)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeClientExecutionTests/testClawHubPreflightAcceptsBundledNpxBeforeSystemNpx
```

Expected: FAIL because `validateEnvironment` still checks only system `npx`.

- [ ] **Step 3: Thread bundled runtime directory into preflight**

In `send(command:payload:)`, move the bundled runtime lookup before validation:

```swift
        let nodeExecutable = Self.resolveNodeExecutable()
        let bundledNodeBinDirectory = Self.resolveBundledNodeBinDirectory()
        try validateEnvironment(
            command: command,
            payload: payload,
            nodeExecutable: nodeExecutable,
            bundledNodeBinDirectory: bundledNodeBinDirectory
        )
```

Keep the environment construction from Task 2:

```swift
        process.environment = Self.bridgeEnvironment(
            bundledNodeBinDirectory: bundledNodeBinDirectory
        )
```

- [ ] **Step 4: Update validateEnvironment and add bundled npx helper**

Replace the `validateEnvironment` signature with:

```swift
    private func validateEnvironment(
        command: BridgeCommand,
        payload: [String: AnyCodable]?,
        nodeExecutable: String,
        bundledNodeBinDirectory: String?
    ) throws {
```

Add this helper before `isNodeAvailable(_:)`:

```swift
    private func bundledNpxPath(in bundledNodeBinDirectory: String?) -> String? {
        guard let bundledNodeBinDirectory else {
            return nil
        }

        let bundledNpx = URL(fileURLWithPath: bundledNodeBinDirectory)
            .appendingPathComponent("npx")
            .path
        return FileManager.default.isExecutableFile(atPath: bundledNpx) ? bundledNpx : nil
    }
```

Replace the ClawHub preflight block with:

```swift
        if locator.hasPrefix("clawhub:"), bundledNpxPath(in: bundledNodeBinDirectory) == nil, !isCommandAvailable("npx") {
            throw BridgeClientError.missingDependency(.npx)
        }
```

- [ ] **Step 5: Run focused preflight test**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeClientExecutionTests/testClawHubPreflightAcceptsBundledNpxBeforeSystemNpx
```

Expected: PASS.

- [ ] **Step 6: Run all bridge execution tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeClientExecutionTests
```

Expected: all `BridgeClientExecutionTests` pass.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "fix: allow bundled npx in desktop preflight"
```

Expected: commit succeeds with only Swift bridge and Swift tests staged.

### Task 4: Package npm and npx With The macOS App

**Files:**
- Modify: `scripts/release/package-desktop-mac.sh`

- [ ] **Step 1: Update Info.plist generation for native execution**

In `scripts/release/package-desktop-mac.sh`, add this block after the `BUNDLE_ID` assignment:

```bash
NATIVE_EXECUTION_PLIST=""
if [[ "$ARCH" != "x86_64" ]]; then
  NATIVE_EXECUTION_PLIST="  <key>LSRequiresNativeExecution</key>
  <true/>"
fi
```

Insert `$NATIVE_EXECUTION_PLIST` into the Info.plist heredoc immediately after `LSMinimumSystemVersion`:

```xml
  <key>LSMinimumSystemVersion</key>
  <string>$DEFAULT_MIN_MACOS</string>
$NATIVE_EXECUTION_PLIST
  <key>NSHighResolutionCapable</key>
  <true/>
```

- [ ] **Step 2: Stage npm and npx support files**

In `stage_node_runtime()`, replace the current copy block:

```bash
  rm -rf "$extract_dir" "$dest_dir"
  mkdir -p "$extract_dir" "$dest_dir/bin"
  tar -xf "$archive_path" -C "$extract_dir"
  cp "$node_dist_dir/bin/node" "$dest_dir/bin/node"
  chmod +x "$dest_dir/bin/node"
```

with:

```bash
  rm -rf "$extract_dir" "$dest_dir"
  mkdir -p "$extract_dir" "$dest_dir/bin" "$dest_dir/lib/node_modules"
  tar -xf "$archive_path" -C "$extract_dir"
  cp "$node_dist_dir/bin/node" "$dest_dir/bin/node"
  cp -R -P "$node_dist_dir/bin/npm" "$node_dist_dir/bin/npx" "$dest_dir/bin/"
  cp -R "$node_dist_dir/lib/node_modules/npm" "$dest_dir/lib/node_modules/npm"
  chmod +x "$dest_dir/bin/node" "$dest_dir/bin/npm" "$dest_dir/bin/npx"
```

Replace the final runtime probe:

```bash
  "$dest_dir/bin/node" --version >/dev/null
```

with:

```bash
  "$dest_dir/bin/node" --version >/dev/null
  PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npm" --version >/dev/null
  PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npx" --version >/dev/null
```

- [ ] **Step 3: Add packaged runtime summary output**

At the bottom of `package-desktop-mac.sh`, replace:

```bash
echo "Bundled Node.js: v$NODE_RUNTIME_VERSION"
```

with:

```bash
echo "Bundled Node.js: v$NODE_RUNTIME_VERSION"
echo "Bundled npm/npx: yes"
```

- [ ] **Step 4: Run shell syntax check**

Run:

```bash
bash -n scripts/release/package-desktop-mac.sh
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add scripts/release/package-desktop-mac.sh
git commit -m "fix: bundle npm and npx in mac packages"
```

Expected: commit succeeds with only the macOS packaging script staged.

### Task 5: Validate Runtime Toolchain And Native Execution Metadata

**Files:**
- Modify: `scripts/release/validate-mac-artifacts.sh`

- [ ] **Step 1: Add validation for npm, npx, node architecture, and native execution**

Inside the `for arch in "${REQUIRED_ARCHS[@]}"` loop in `scripts/release/validate-mac-artifacts.sh`, replace the current bundled Node validation:

```bash
    NODE_EXECUTABLE="$NODE_RUNTIME_DIR/$arch/bin/node"
    if [[ ! -x "$NODE_EXECUTABLE" ]]; then
      echo "Missing bundled Node runtime for '$arch': $NODE_EXECUTABLE" >&2
      exit 1
    fi

    "$NODE_EXECUTABLE" --version >/dev/null
```

with:

```bash
    NODE_BIN_DIR="$NODE_RUNTIME_DIR/$arch/bin"
    NODE_EXECUTABLE="$NODE_BIN_DIR/node"
    NPM_EXECUTABLE="$NODE_BIN_DIR/npm"
    NPX_EXECUTABLE="$NODE_BIN_DIR/npx"

    for tool_path in "$NODE_EXECUTABLE" "$NPM_EXECUTABLE" "$NPX_EXECUTABLE"; do
      if [[ ! -x "$tool_path" ]]; then
        echo "Missing bundled runtime executable for '$arch': $tool_path" >&2
        exit 1
      fi
    done

    NODE_ARCHS="$(lipo -archs "$NODE_EXECUTABLE")"
    if [[ " $NODE_ARCHS " != *" $arch "* ]]; then
      echo "Bundled Node runtime for '$arch' has unexpected architecture: $NODE_ARCHS" >&2
      exit 1
    fi

    "$NODE_EXECUTABLE" --version >/dev/null
    PATH="$NODE_BIN_DIR:$PATH" "$NPM_EXECUTABLE" --version >/dev/null
    PATH="$NODE_BIN_DIR:$PATH" "$NPX_EXECUTABLE" --version >/dev/null
```

After the loop, add:

```bash
  if [[ " ${REQUIRED_ARCHS[*]} " == *" arm64 "* ]]; then
    NATIVE_EXECUTION="$(/usr/libexec/PlistBuddy -c 'Print :LSRequiresNativeExecution' "$INFO_PLIST" 2>/dev/null || true)"
    if [[ "$NATIVE_EXECUTION" != "true" ]]; then
      echo "Expected LSRequiresNativeExecution=true for Apple Silicon-capable bundle" >&2
      exit 1
    fi
  fi
```

- [ ] **Step 2: Run shell syntax check**

Run:

```bash
bash -n scripts/release/validate-mac-artifacts.sh
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add scripts/release/validate-mac-artifacts.sh
git commit -m "test: validate bundled mac node toolchain"
```

Expected: commit succeeds with only the validation script staged.

### Task 6: Update Desktop Runtime Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `apps/desktop-mac/README.md`

- [ ] **Step 1: Update English desktop prerequisites**

In `README.md`, replace the `Desktop prerequisites` text:

```markdown
Skill Flow Desktop release builds include a bundled Node.js runtime for the desktop helper, so double-click launch does not depend on shell-managed `node` paths from tools like `asdf` or `nvm`.

- `git` is required for non-GitHub Git sources
- `npx` is required for skills.sh imports

Development builds and damaged release bundles can still fall back to a system `node` 20 or newer. If the desktop app detects a missing dependency, it will surface an actionable error and point back to this section.
```

with:

```markdown
Skill Flow Desktop release builds include a bundled native Node.js/npm/npx toolchain for the desktop helper and skills.sh imports, so double-click launch does not depend on shell-managed Node paths from tools like `asdf` or `nvm`.

- `git` is required for non-GitHub Git sources

Development builds and damaged release bundles can still fall back to a system Node.js 20 or newer with npm/npx. If the desktop app detects a missing dependency, it will surface an actionable error and point back to this section.
```

- [ ] **Step 2: Update Chinese desktop prerequisites**

In `README.zh.md`, replace the `桌面端前置依赖` text:

```markdown
Skill Flow Desktop release 构建会内置用于 desktop helper 的 Node.js runtime，因此双击启动不再依赖 `asdf` 或 `nvm` 写入 shell 的 `node` 路径。

- 导入非 GitHub Git source 需要 `git`
- 导入 skills.sh source 需要 `npx`

开发构建和损坏的 release bundle 仍会 fallback 到系统 `node` 20 或更高版本。如果桌面应用检测到依赖缺失，会直接提示可执行的错误信息，并引导回本节处理。
```

with:

```markdown
Skill Flow Desktop release 构建会内置用于 desktop helper 和 skills.sh 导入的原生 Node.js/npm/npx 工具链，因此双击启动不再依赖 `asdf` 或 `nvm` 写入 shell 的 Node 路径。

- 导入非 GitHub Git source 需要 `git`

开发构建和损坏的 release bundle 仍会 fallback 到系统 Node.js 20 或更高版本及 npm/npx。如果桌面应用检测到依赖缺失，会直接提示可执行的错误信息，并引导回本节处理。
```

- [ ] **Step 3: Update desktop package notes**

In `apps/desktop-mac/README.md`, replace the three runtime notes:

```markdown
- Release packages bundle Node.js `v22.22.2` under `Contents/Resources/node/<arch>/bin/node`, so Finder launch does not depend on shell `PATH`.
- The universal package carries both `arm64` and `x86_64` Node runtimes, so it is expected to be noticeably larger than single-arch packages.
- Bundled Node security updates are handled by updating the pinned runtime version and rebuilding the desktop release.
- skills.sh imports still require a host `npx`; the bundled runtime only covers the desktop bridge helper.
```

with:

```markdown
- Release packages bundle Node.js `v22.22.2` plus npm/npx under `Contents/Resources/node/<arch>/`, so Finder launch and skills.sh imports do not depend on shell `PATH`.
- The universal package carries both `arm64` and `x86_64` Node/npm/npx toolchains, so it is expected to be noticeably larger than single-arch packages.
- Bundled Node/npm/npx security updates are handled by updating the pinned runtime version and rebuilding the desktop release.
- Apple Silicon-capable packages set `LSRequiresNativeExecution=true` so the app uses the native architecture instead of Rosetta.
```

- [ ] **Step 4: Commit Task 6**

Run:

```bash
git add README.md README.zh.md apps/desktop-mac/README.md
git commit -m "docs: document bundled mac node toolchain"
```

Expected: commit succeeds with only documentation staged.

### Task 7: Run Focused Verification And Package Checks

**Files:**
- No source changes expected.

- [ ] **Step 1: Run integration tests**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/clawhub.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run desktop bridge tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter BridgeClientExecutionTests
```

Expected: PASS.

- [ ] **Step 3: Run script syntax checks**

Run:

```bash
bash -n scripts/release/package-desktop-mac.sh
bash -n scripts/release/validate-mac-artifacts.sh
```

Expected: both commands exit 0 with no output.

- [ ] **Step 4: Build an arm64 dev package**

Run from the repo root on an Apple Silicon Mac:

```bash
npm run build
scripts/release/package-desktop-mac.sh --arch arm64 --output dist/desktop-mac --dev --skip-js-build
```

Expected output includes:

```text
DMG: dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
Architectures: arm64
Bundled Node.js: v22.22.2
Bundled npm/npx: yes
```

- [ ] **Step 5: Validate the arm64 app bundle**

Run:

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
```

Expected:

```text
Artifact validation passed: dist/desktop-mac/arm64/Skill Flow.app
```

- [ ] **Step 6: Verify the arm64 DMG**

Run:

```bash
hdiutil verify dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

Expected output includes:

```text
hdiutil: verify: checksum of "dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg" is VALID
```

- [ ] **Step 7: Build and validate universal package**

Run:

```bash
scripts/release/package-desktop-mac.sh --arch universal --output dist/desktop-mac --dev --skip-js-build
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/universal/Skill Flow.app" arm64,x86_64
```

Expected:

```text
Artifact validation passed: dist/desktop-mac/universal/Skill Flow.app
```

- [ ] **Step 8: Inspect final diff and log**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: `git status --short` is empty after all task commits. Recent commits include the six task commits from this plan.

## Self-Review

- Spec coverage: The plan covers bundled npm/npx packaging, Swift bridge `PATH` and `SKILL_FLOW_BUNDLED_NPX`, JS ClawHub command selection, `LSRequiresNativeExecution`, validation scripts, and documentation.
- Placeholder scan: No placeholder sections are present. All code-changing steps include concrete snippets and commands.
- Type consistency: The Swift helper names are `resolveBundledNodeBinDirectory`, `bridgeEnvironment`, and `bundledNpxPath`; those names are used consistently in tests and implementation steps. The JS environment variable is consistently `SKILL_FLOW_BUNDLED_NPX`.
