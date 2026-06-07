# Import Timeout And Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent recommended skill group imports from staying on `Downloading...` indefinitely, and explain why other Import buttons are unavailable during a running import.

**Architecture:** Add bounded timeouts at both network and desktop bridge process boundaries. Keep the current single-import model, but surface the active-import lock through card button help text. Preserve existing import rollback paths and provider error mapping.

**Tech Stack:** Swift 6 / SwiftUI / XCTest for desktop, Node 25 fetch / TypeScript / Vitest for integration and query packages.

---

## File Structure

- Create `packages/integration/src/utils/fetch-timeout.ts`
  - Owns timeout-bound `fetch` behavior and the timeout error type.
- Create `packages/integration/src/tests/fetch-timeout.test.ts`
  - Verifies timeout aborts, caller abort propagation, and successful responses.
- Modify `packages/integration/src/utils/skills-directory.ts`
  - Replaces import provider `fetch` calls with `fetchWithTimeout`.
- Modify `packages/integration/src/utils/github-catalog.ts`
  - Replaces GitHub API `fetch` calls with `fetchWithTimeout`.
- Modify `packages/core-engine/src/services/source-service.ts`
  - Uses `fetchWithTimeout` for GitHub and GitLab archive downloads.
- Modify `packages/query/src/tests/import-page-flow.test.ts`
  - Adds regression coverage that timed-out provider previews fail cleanly.
- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
  - Adds process timeout support to `send`.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
  - Verifies a slow helper returns localized timeout instead of hanging.
- Modify `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
  - Adds configurable help text for disabled action buttons.
- Modify `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
  - Computes active-import disabled state and disabled reason.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
  - Adds source-level regression tests for active-import help propagation.

---

## Task 1: Add Timeout-Bound Fetch Helper

**Files:**
- Create: `packages/integration/src/utils/fetch-timeout.ts`
- Test: `packages/integration/src/tests/fetch-timeout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/integration/src/tests/fetch-timeout.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import {
  DEFAULT_PROVIDER_FETCH_TIMEOUT_MS,
  FetchTimeoutError,
  fetchWithTimeout,
} from "../utils/fetch-timeout.js";

describe("fetchWithTimeout", () => {
  test("returns a successful response before timeout", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithTimeout("https://example.test/source")).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/source",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("aborts a request after the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      });
    }));

    const promise = fetchWithTimeout("https://example.test/slow", {}, { timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    await expect(promise).rejects.toMatchObject({
      name: "FetchTimeoutError",
      code: "FETCH_TIMEOUT",
      timeoutMs: 25,
      url: "https://example.test/slow",
    });
  });

  test("preserves an existing caller abort signal", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const callerError = new Error("caller aborted");
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      });
    }));

    const promise = fetchWithTimeout(
      "https://example.test/caller-abort",
      { signal: controller.signal },
      { timeoutMs: 1000 },
    );
    controller.abort(callerError);

    await expect(promise).rejects.toBe(callerError);
  });

  test("exports the provider timeout default", () => {
    expect(DEFAULT_PROVIDER_FETCH_TIMEOUT_MS).toBe(30_000);
    expect(new FetchTimeoutError("https://example.test", 1).message).toContain("timed out");
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/fetch-timeout.test.ts
```

Expected: FAIL because `../utils/fetch-timeout.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `packages/integration/src/utils/fetch-timeout.ts`:

```ts
export const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = 30_000;

export type FetchTimeoutOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export class FetchTimeoutError extends Error {
  readonly code = "FETCH_TIMEOUT";
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, message?: string) {
    super(message ?? `Request to ${url} timed out after ${timeoutMs}ms.`);
    this.name = "FetchTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_FETCH_TIMEOUT_MS;
  const url = describeFetchInput(input);
  const timeoutError = new FetchTimeoutError(url, timeoutMs, options.timeoutMessage);
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;

  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? new Error("Fetch request was aborted.");
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(timeoutError);
  }, timeoutMs);
  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason ?? new Error("Fetch request was aborted."));
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

function describeFetchInput(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/fetch-timeout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit this task if commits are approved**

If the user has explicitly approved commits, run:

```bash
git add packages/integration/src/utils/fetch-timeout.ts packages/integration/src/tests/fetch-timeout.test.ts
git commit -m "feat: add fetch timeout helper"
```

If commits are not approved, do not commit.

---

## Task 2: Use Fetch Timeout In Provider And Archive Requests

**Files:**
- Modify: `packages/integration/src/utils/skills-directory.ts`
- Modify: `packages/integration/src/utils/github-catalog.ts`
- Modify: `packages/core-engine/src/services/source-service.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Add failing provider timeout coverage**

Add this test near the other preview tests in `packages/query/src/tests/import-page-flow.test.ts`:

```ts
  test("previewImportSource reports provider timeout without hanging", async () => {
    vi.useFakeTimers();
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<ResponseLike>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      });
    }));

    const app = new SkillFlowApp();
    const previewPromise = app.previewImportSource("anthropics/skills");
    await vi.advanceTimersByTimeAsync(30_000);
    const preview = await previewPromise;

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data).toMatchObject({
      status: "failed",
      reasonCode: "provider_request_failed",
      retryable: true,
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails or hangs before implementation**

Run:

```bash
npm run -w @skill-flow/query test -- packages/query/src/tests/import-page-flow.test.ts -t "provider timeout"
```

Expected: FAIL because provider fetches are not timeout-bound.

- [ ] **Step 3: Update `skills-directory.ts`**

At the top of `packages/integration/src/utils/skills-directory.ts`, add:

```ts
import { fetchWithTimeout } from "./fetch-timeout.js";
```

Replace direct provider fetch calls:

```ts
const response = await fetch(
  `${SKILLS_DIRECTORY_BASE_URL}/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
);
```

with:

```ts
const response = await fetchWithTimeout(
  `${SKILLS_DIRECTORY_BASE_URL}/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
);
```

Replace:

```ts
const response = await fetch(`${SKILLS_DIRECTORY_BASE_URL}${FEED_PATHS[feedId]}`);
```

with:

```ts
const response = await fetchWithTimeout(`${SKILLS_DIRECTORY_BASE_URL}${FEED_PATHS[feedId]}`);
```

Replace the implementation of `fetchSkillsDirectoryHtml` with timeout-bound fetch. If the current function body differs, keep its parsing/error codes and only replace the fetch call:

```ts
async function fetchSkillsDirectoryHtml(url: string, kind: "source" | "owner" | "skill"): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw createProviderError(
      response.status === 429 ? "SKILLS_SOURCE_RATE_LIMITED" : "SKILLS_SOURCE_REQUEST_FAILED",
      `skills.sh ${kind} page request failed with ${response.status}.`,
    );
  }
  return response.text();
}
```

- [ ] **Step 4: Update `github-catalog.ts`**

At the top of `packages/integration/src/utils/github-catalog.ts`, add:

```ts
import { fetchWithTimeout } from "./fetch-timeout.js";
```

Replace:

```ts
const response = await fetch(
  `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
  { headers: buildGitHubHeaders() },
);
```

with:

```ts
const response = await fetchWithTimeout(
  `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
  { headers: buildGitHubHeaders() },
);
```

Replace:

```ts
const response = await fetch(
  `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
  { headers: buildGitHubHeaders() },
);
```

with:

```ts
const response = await fetchWithTimeout(
  `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
  { headers: buildGitHubHeaders() },
);
```

- [ ] **Step 5: Update archive downloads in `source-service.ts`**

Add this import near the other integration imports in `packages/core-engine/src/services/source-service.ts`:

```ts
import { fetchWithTimeout } from "@skill-flow/integration/utils/fetch-timeout";
```

Replace the `fetch` call in `downloadGitHubArchive`:

```ts
const response = await fetch(
  `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`,
);
```

with:

```ts
const response = await fetchWithTimeout(
  `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`,
  {},
  {
    timeoutMessage: `GitHub archive download timed out for '${owner}/${repo}' branch '${branch}'.`,
  },
);
```

Replace the `fetch` call in `downloadGitLabArchive`:

```ts
const response = await fetch(
  `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/repository/archive.zip?sha=${encodeURIComponent(branch)}`,
  {
    headers: {
      ...(process.env.GITLAB_TOKEN
        ? { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN }
        : {}),
    },
  },
);
```

with:

```ts
const response = await fetchWithTimeout(
  `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/repository/archive.zip?sha=${encodeURIComponent(branch)}`,
  {
    headers: {
      ...(process.env.GITLAB_TOKEN
        ? { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN }
        : {}),
    },
  },
  {
    timeoutMessage: `GitLab archive download timed out for '${host}/${projectPath}' branch '${branch}'.`,
  },
);
```

- [ ] **Step 6: Run focused TypeScript tests**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/fetch-timeout.test.ts
npm run -w @skill-flow/query test -- packages/query/src/tests/import-page-flow.test.ts -t "provider timeout"
npm run -w @skill-flow/core-engine test -- packages/core-engine/src/tests/source-service.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit this task if commits are approved**

If the user has explicitly approved commits, run:

```bash
git add packages/integration/src/utils/skills-directory.ts packages/integration/src/utils/github-catalog.ts packages/core-engine/src/services/source-service.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "fix: bound import provider requests"
```

If commits are not approved, do not commit.

---

## Task 3: Add Desktop Bridge Process Timeout

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write the failing Swift test**

Add this test to `BridgeClientExecutionTests` after `testListAllowsMainActorWorkWhileHelperIsStillRunning`:

```swift
    func testListTimesOutWhenHelperNeverExits() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 5_000)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient(commandTimeoutMilliseconds: 50) }

        do {
            _ = try await bridge.list()
            XCTFail("Expected list to time out.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testListTimesOutWhenHelperNeverExits
```

Expected: FAIL because `BridgeClient(commandTimeoutMilliseconds:)` does not exist.

- [ ] **Step 3: Add timeout configuration to `BridgeClient`**

In `BridgeClient.swift`, add stored properties near `private let mutationCoordinator`:

```swift
    private let commandTimeoutMilliseconds: UInt64
    private let commandTimeoutGraceMilliseconds: UInt64

    init(
        commandTimeoutMilliseconds: UInt64 = 60_000,
        commandTimeoutGraceMilliseconds: UInt64 = 1_000
    ) {
        self.commandTimeoutMilliseconds = commandTimeoutMilliseconds
        self.commandTimeoutGraceMilliseconds = commandTimeoutGraceMilliseconds
    }
```

Because this adds an explicit initializer, existing `BridgeClient()` call sites continue to compile with defaults.

- [ ] **Step 4: Replace the unbounded process wait in `send`**

In `BridgeClient.send`, replace:

```swift
        try process.run()
        inputPipe.fileHandleForWriting.write(requestData)
        inputPipe.fileHandleForWriting.closeFile()

        _ = await exitIterator.next()
        process.terminationHandler = nil
```

with:

```swift
        try process.run()
        inputPipe.fileHandleForWriting.write(requestData)
        inputPipe.fileHandleForWriting.closeFile()

        let didExit = await waitForProcessExit(
            exitIterator: &exitIterator,
            process: process,
            timeoutMilliseconds: commandTimeoutMilliseconds,
            graceMilliseconds: commandTimeoutGraceMilliseconds
        )
        process.terminationHandler = nil
        guard didExit else {
            outputPipe.fileHandleForReading.readabilityHandler = nil
            errorPipe.fileHandleForReading.readabilityHandler = nil
            throw BridgeClientError.timeout(commandTimeoutMilliseconds)
        }
```

Add this private method inside `BridgeClient`:

```swift
    private func waitForProcessExit(
        exitIterator: inout AsyncStream<Void>.Iterator,
        process: Process,
        timeoutMilliseconds: UInt64,
        graceMilliseconds: UInt64
    ) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                _ = await exitIterator.next()
                return true
            }
            group.addTask {
                try? await Task.sleep(for: .milliseconds(timeoutMilliseconds))
                return false
            }

            let didExit = await group.next() ?? false
            group.cancelAll()
            guard !didExit else {
                return true
            }

            if process.isRunning {
                process.terminate()
            }
            if graceMilliseconds > 0 {
                try? await Task.sleep(for: .milliseconds(graceMilliseconds))
            }
            return false
        }
    }
```

- [ ] **Step 5: Run the bridge tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests
```

Expected: PASS.

- [ ] **Step 6: Commit this task if commits are approved**

If the user has explicitly approved commits, run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "fix: time out desktop bridge commands"
```

If commits are not approved, do not commit.

---

## Task 4: Surface Active Import Lock In Import Buttons

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`

- [ ] **Step 1: Write the source-level regression tests**

Add this test to `ImportScreenContainerTests` near the other Import button state tests:

```swift
    func testImportScreenPassesActiveImportReasonToGroupCard() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Import/ImportScreen.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("activeImportDisabledReason"))
        XCTAssertTrue(source.contains("actionButtonHelpText: Self.importActionHelpText("))
        XCTAssertTrue(source.contains("importingGroupId != nil && importingGroupId != card.id"))
    }
```

Add this test near existing group card source-level tests, or at the end of `ImportScreenContainerTests`:

```swift
    func testSharedGroupCardUsesActionButtonHelpTextForDisabledImportButtons() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Components/GroupCardComponents.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("let actionButtonHelpText: String?"))
        XCTAssertTrue(source.contains("self.actionButtonHelpText = actionButtonHelpText"))
        XCTAssertTrue(source.contains(".help(actionButtonHelpText ?? buttonTitle)"))
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd apps/desktop-mac && swift test --filter ImportScreenContainerTests/testImportScreenPassesActiveImportReasonToGroupCard
cd apps/desktop-mac && swift test --filter ImportScreenContainerTests/testSharedGroupCardUsesActionButtonHelpTextForDisabledImportButtons
```

Expected: FAIL because the new properties and helper are not present.

- [ ] **Step 3: Add action button help text to `SharedGroupCard`**

In `GroupCardComponents.swift`, add a property near `actionButtonTitle`:

```swift
    let actionButtonHelpText: String?
```

Update the initializer parameter list near `actionButtonTitle`:

```swift
        actionButtonTitle: String? = nil,
        actionButtonHelpText: String? = nil,
        actionButtonIcon: ActionIcon = .import,
```

Assign it in the initializer:

```swift
        self.actionButtonTitle = actionButtonTitle
        self.actionButtonHelpText = actionButtonHelpText
        self.actionButtonIcon = actionButtonIcon
```

In `importButton`, replace:

```swift
        .help(buttonTitle)
```

with:

```swift
        .help(actionButtonHelpText ?? buttonTitle)
```

- [ ] **Step 4: Compute active import state in `ImportScreen`**

In `ImportScreen.importCard`, before `SharedGroupCard(...)`, add:

```swift
        let isAnotherImportRunning = importingGroupId != nil && importingGroupId != card.id
        let activeImportDisabledReason = isAnotherImportRunning
            ? t("import.action.disabled.import_running")
            : nil
```

Update the `SharedGroupCard` call to pass:

```swift
                actionButtonTitle: Self.importActionTitle(for: card, localized: { key in t(key) }),
                actionButtonHelpText: Self.importActionHelpText(
                    for: card,
                    activeImportDisabledReason: activeImportDisabledReason,
                    localized: { key in t(key) }
                ),
                actionButtonIcon: ActionIcon.import,
```

Update the disabled calculation call:

```swift
                isActionButtonDisabled: Self.importActionIsDisabled(
                    for: card,
                    selectedSkillIds: container.selectedSkillIdsForImport(for: card),
                    isAnotherImportRunning: isAnotherImportRunning
                ),
```

Update `importActionIsDisabled`:

```swift
    static func importActionIsDisabled(
        for card: ImportViewModel.Card,
        draft: ImportDraftState? = nil,
        selectedSkillIds: [String]? = nil,
        isAnotherImportRunning: Bool = false
    ) -> Bool {
        isAnotherImportRunning
            || card.isInstalledLocally
            || card.requiresLocalVariantSelection
            || ((selectedSkillIds ?? draft?.selectedSkillIds)?.isEmpty == true && !card.skills.isEmpty)
    }
```

Add a helper near `importActionTitle`:

```swift
    static func importActionHelpText(
        for card: ImportViewModel.Card,
        activeImportDisabledReason: String?,
        localized: (String) -> String
    ) -> String? {
        if let activeImportDisabledReason {
            return activeImportDisabledReason
        }
        return importActionTitle(for: card, localized: localized)
    }
```

- [ ] **Step 5: Add localized text**

Add these lines to the localization files:

`apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`

```text
"import.action.disabled.import_running" = "Another import is already running.";
```

`apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`

```text
"import.action.disabled.import_running" = "已有导入任务正在进行。";
```

`apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`

```text
"import.action.disabled.import_running" = "別のインポートが実行中です。";
```

- [ ] **Step 6: Run desktop tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter ImportScreenContainerTests
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests
```

Expected: PASS.

- [ ] **Step 7: Commit this task if commits are approved**

If the user has explicitly approved commits, run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift
git commit -m "fix: explain active import lock"
```

If commits are not approved, do not commit.

---

## Task 5: Final Verification

**Files:**
- No new source files.
- Verify all files modified in Tasks 1-4.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
npm run -w @skill-flow/integration test -- packages/integration/src/tests/fetch-timeout.test.ts
npm run -w @skill-flow/query test -- packages/query/src/tests/import-page-flow.test.ts
npm run -w @skill-flow/core-engine test -- packages/core-engine/src/tests/source-service.test.ts
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests && swift test --filter ImportScreenContainerTests && swift test --filter DesktopLocalizationTests
```

Expected: all PASS.

- [ ] **Step 2: Run build for touched TypeScript packages**

Run:

```bash
npm run -w @skill-flow/integration build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
```

Expected: all PASS.

- [ ] **Step 3: Run bridge smoke checks with a temporary state root**

Run:

```bash
env SKILL_FLOW_STATE_ROOT=/tmp/skill-flow-import-timeout-smoke node apps/cli/dist/desktop-bridge.js bridge --json --request '{"protocolVersion":"1.0","command":"search-import-groups","payload":{"query":""}}'
env SKILL_FLOW_STATE_ROOT=/tmp/skill-flow-import-timeout-smoke node apps/cli/dist/desktop-bridge.js bridge --json --request '{"protocolVersion":"1.0","command":"preview-import-source","payload":{"locator":"anthropics/skills"}}'
env SKILL_FLOW_STATE_ROOT=/tmp/skill-flow-import-timeout-smoke node apps/cli/dist/desktop-bridge.js bridge --json --request '{"protocolVersion":"1.0","command":"import-source","payload":{"locator":"anthropics/skills","draft":{"selectedSkillIds":["skill-creator"],"enabledTargets":[]}}}'
```

Expected:

- Search response has `"ok":true`.
- Preview response has `"status":"ready"` or a clear provider failure, not a hang.
- Import response has `"status":"ready"` or a clear timeout/provider failure, not a hang.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-06-03-import-timeout-and-feedback-design.md docs/superpowers/plans/2026-06-04-import-timeout-and-feedback.md packages/integration/src/utils/fetch-timeout.ts packages/integration/src/utils/skills-directory.ts packages/integration/src/utils/github-catalog.ts packages/core-engine/src/services/source-service.ts packages/query/src/tests/import-page-flow.test.ts apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift
```

Expected: diff only contains timeout handling, import button feedback, tests, and the plan/spec files.

- [ ] **Step 5: Commit final verification if commits are approved and earlier tasks were not committed**

If the user has explicitly approved commits and tasks were not committed individually, run:

```bash
git add packages/integration/src/utils/fetch-timeout.ts packages/integration/src/tests/fetch-timeout.test.ts packages/integration/src/utils/skills-directory.ts packages/integration/src/utils/github-catalog.ts packages/core-engine/src/services/source-service.ts packages/query/src/tests/import-page-flow.test.ts apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift
git commit -m "fix: prevent stuck recommended imports"
```

If commits are not approved, do not commit.

---

## Self-Review

- Spec coverage:
  - Bridge subprocess timeout is covered by Task 3.
  - Provider and archive fetch timeouts are covered by Tasks 1 and 2.
  - Active import button explanation is covered by Task 4.
  - Rollback preservation is not changed directly; Task 2 keeps existing runtime path and Task 5 verifies import smoke behavior.
  - Focused tests and validation are covered by Tasks 1-5.
- Placeholder scan:
  - No deferred implementation placeholders.
  - Each code-changing task includes concrete code snippets and commands.
- Type consistency:
  - `fetchWithTimeout`, `FetchTimeoutError`, `actionButtonHelpText`, `importActionHelpText`, and `commandTimeoutMilliseconds` are introduced before later usage.
