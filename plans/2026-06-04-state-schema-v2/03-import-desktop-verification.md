# Import Desktop And Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 import preview/prepare/commit、desktop bridge 和发布验证切换到 V2 selector 契约，消除 `selectedSkillIds` 多义。

**Architecture:** preview 生成 `uiId + selector`，prepare 生成同一 preparation 生命周期内的 `PreparedSkillRefV2`，commit 只用 selector 绑定 prepared refs。桌面端 UI 保存 `uiId + selector`；只有 capability `importDraftV2 === true` 时发送 V2，否则直接发送 legacy payload；只有 `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2` 允许 V2 请求后 retry legacy。

**Tech Stack:** TypeScript、Vitest、SwiftUI、Swift XCTest、bridge JSON payload、release docs。

---

## Files

Modify:

- `packages/integration/src/*`
- `packages/query/src/runtime.ts`
- `packages/query/src/tests/import-page-flow.test.ts`
- `packages/shared-types/src/*`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`
- `README.md`
- `README.zh.md`
- `releases/<version>.md`

Create:

- `packages/query/src/tests/state-schema-v2-e2e.test.ts`
- `packages/query/src/tests/state-schema-v2-target-repair.test.ts`
- `packages/query/src/tests/skill-collection-diagnostics.test.ts`

## Task 1: Add Selector Utilities And Preview V2 Fields

**Files:**

- Modify: `packages/integration/src/*`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("preview uses stable uiId and repoPath selector for github archive fallback", async () => {
  const preview = await app.previewImportSource("github:anthropics/skills");
  const skill = preview.data.skills.find((candidate) => candidate.selector.path === "skills/frontend-design");

  expect(skill).toMatchObject({
    selector: { kind: "repoPath", path: "skills/frontend-design" },
    origin: expect.objectContaining({
      provider: expect.any(String),
    }),
  });
  expect(skill!.uiId).toMatch(/^skill_/);
  expect(skill!.uiId).not.toContain("skills-main");
  expect(skill!.legacyId).toBe("skills/frontend-design");
});

test.each([
  [".", undefined, "."],
  ["./skills/frontend-design", undefined, "skills/frontend-design"],
  ["archive-root/skills/frontend-design", "archive-root", "skills/frontend-design"],
])("normalizes repoPath selector %s", (input, archiveRoot, expected) => {
  expect(normalizeImportRepoPathSelector(input, { archiveRoot })).toEqual({ kind: "repoPath", path: expected });
});

test.each([
  ["/Users/me/skills/frontend-design"],
  ["../skills/frontend-design"],
  ["skills//frontend-design"],
  ["skills/../../secret"],
  ["skills/\u0000bad"],
])("rejects invalid repoPath selector %s", (input) => {
  expect(() => normalizeImportRepoPathSelector(input)).toThrow("IMPORT_SELECTOR_INVALID");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: fail because preview still relies on legacy string ids.

- [ ] **Step 3: Implement selector generation**

Rules:

- derive `sourceSelectionKey` from normalized `canonicalLocator + requestedPath`.
- derive `selectorKey` from selector kind and value.
- derive `uiId` from `sourceSelectionKey + selectorKey`.
- set `selector` to `{ kind: "repoPath", path }`; first-stage V2 does not emit `skillName` selectors.
- match repoPath selectors against `LeafRecordV2.relativePath`.
- selector validator must normalize repo root `.` and archive root prefixes, and reject absolute paths, `../` traversal, empty path segments, control characters, and paths that escape the archive root.
- keep legacy `legacyId` and `legacyAliases` only for compat.
- keep provider/archive ids in `origin`, not as commit identity.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/integration packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: add import preview selectors"
```

## Task 2: Add Preparation Cache And Selector Binding

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/storage/src/*`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("commit binds selector against same preparation record", async () => {
  const preview = await app.previewImportSource("github:anthropics/skills");
  const selected = preview.data.skills.find((skill) => skill.selector.path === "skills/frontend-design")!;

  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: selected.uiId, selector: selected.selector }],
    enabledTargets: ["codex"],
  });

  expect(result.data.status).toBe("success");
  expect(result.data.boundLeafIds).toHaveLength(1);
});

test("commit returns selector not found instead of falling back to legacy ids", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: "skill_missing", selector: { kind: "repoPath", path: "skills/missing" } }],
    enabledTargets: ["codex"],
  });

  expect(result.data.status).toBe("failed");
  expect(result.data.reasonCode).toBe("IMPORT_SELECTOR_NOT_FOUND");
  expect(result.data.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "IMPORT_SELECTOR_NOT_FOUND",
      details: expect.objectContaining({ kind: "repoPath", value: "skills/missing" }),
    }),
  );
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: fail because commit does not bind structured selectors.

- [ ] **Step 3: Implement preparation lifecycle**

Rules:

- `prepareImportSource` writes `ImportPreparationRecordV2`.
- record includes `status`, `preparedAt`, `expiresAt`, `existingSourceIdHint`, `sourceKind`, `checkoutPath`, `sourceRevision`, `availableTargets`, `skillRefs`, `currentAttempt`, `lease`, `failure`, and `diagnostics`.
- `PreparedSkillRefV2.leafId` is provisional while cached.
- commit must follow `01-overview-and-data-model.md`: re-validate source from `manifest.json`, never trust `existingSourceIdHint` as authority, and never let cache mint or persist authority `sourceId`.
- commit must bind selectors only against the same preparation record.
- if record is expired or leaf no longer exists, return `IMPORT_PREPARATION_STALE`.
- if another commit is running, return `IMPORT_PREPARATION_ALREADY_COMMITTING`.
- if commit fails, keep the preparation record for retry and toast diagnostics until cache expiry.
- do not derive leaf id from `uiId`, provider id, archive path, or title.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/runtime.ts packages/storage packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: bind import selectors through preparation cache"
```

## Task 3: Add Bridge Parser V2 Draft Compatibility

**Files:**

- Modify: `packages/shared-types/src/*`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("bridge parser accepts selectedSkills payload", async () => {
  const response = await bridgeRuntime.handle({
    command: "commit-import-source",
    payload: {
      preparationId: "prep-1",
      draft: {
        selectedSkills: [
          { uiId: "skill_abc", selector: { kind: "repoPath", path: "skills/frontend-design" } },
        ],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
  expect(response.data.draft).toMatchObject({
    sourceChoiceId: "choice-local-1",
    selectedSkills: [
      { uiId: "skill_local", selector: { kind: "repoPath", path: "skills/local-tool" } },
    ],
  });
  expect(response.data.draft).not.toHaveProperty("selectedChoiceId");
});

test("bridge parser accepts import-source selectedSkills payload", async () => {
  const response = await bridgeRuntime.handle({
    command: "import-source",
    payload: {
      locator: "github:anthropics/skills",
      draft: {
        selectedSkills: [
          { uiId: "skill_abc", selector: { kind: "repoPath", path: "skills/frontend-design" } },
        ],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
  expect(response.data.draft).toMatchObject({
    scanId: "scan-1",
    sourceChoiceId: "choice-scan-1",
    selectedSkills: [
      { uiId: "skill_scan", selector: { kind: "repoPath", path: "tools/scan-tool" } },
    ],
  });
  expect(response.data.draft).not.toHaveProperty("selectedChoiceId");
});

test("bridge parser accepts import-local-choice selectedSkills payload", async () => {
  const response = await bridgeRuntime.handle({
    command: "import-local-choice",
    payload: {
      sourceChoiceId: "choice-local-1",
      draft: {
        selectedSkills: [
          { uiId: "skill_local", selector: { kind: "repoPath", path: "skills/local-tool" } },
        ],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
});

test("bridge parser accepts import-local-scan-choice selectedSkills payload", async () => {
  const response = await bridgeRuntime.handle({
    command: "import-local-scan-choice",
    payload: {
      scanId: "scan-1",
      sourceChoiceId: "choice-scan-1",
      draft: {
        selectedSkills: [
          { uiId: "skill_scan", selector: { kind: "repoPath", path: "tools/scan-tool" } },
        ],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
});

test("bridge parser maps legacy local origin choice to sourceChoiceId compat", async () => {
  const response = await bridgeRuntime.handle({
    command: "import-local-choice",
    payload: {
      selectedChoiceId: "origin",
      draft: {
        selectedSkillIds: ["skills/local-tool"],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
  expect(response.warnings).toContainEqual(
    expect.objectContaining({
      code: "IMPORT_DRAFT_LEGACY_SELECTED_CHOICE_ID",
      details: expect.objectContaining({ selectedChoiceId: "origin" }),
    }),
  );
});

test("bridge parser accepts selectedSkillIds fallback for local scan compat", async () => {
  const response = await bridgeRuntime.handle({
    command: "import-local-scan-choice",
    payload: {
      scanId: "scan-1",
      sourceChoiceId: "choice-scan-1",
      draft: {
        selectedSkillIds: ["tools/scan-tool"],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error?.code).not.toBe("BRIDGE_REQUEST_INVALID");
  expect(response.warnings).toContainEqual(
    expect.objectContaining({ code: "IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS" }),
  );
});

test("bridge parser rejects invalid selector shape", async () => {
  const response = await bridgeRuntime.handle({
    command: "commit-import-source",
    payload: {
      preparationId: "prep-1",
      draft: {
        selectedSkills: [{ uiId: "skill_abc", selector: { kind: "providerSkillId", value: "x" } }],
        enabledTargets: ["codex"],
      },
    },
  });

  expect(response.error.code).toBe("BRIDGE_REQUEST_INVALID");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: fail until bridge parser supports V2 draft.

- [ ] **Step 3: Implement parser**

Parser rules:

- define `BridgeImportDraftCompat` or `LegacyImportDraftCompat` in the bridge/query compat layer:

```ts
type BridgeImportDraftCompat =
  | { selectedSkills: ImportSkillSelectionV2[]; enabledTargets: string[]; selectedSkillIds?: string[] }
  | { selectedSkillIds: string[]; enabledTargets: string[] };
```

- parser must cover `commit-import-source`, `import-source`, `import-local-choice`, and `import-local-scan-choice`.
- `import-local-choice` requires `sourceChoiceId` for V2; legacy `selectedChoiceId: "origin"` maps to the current origin choice only in compat mode and emits `IMPORT_DRAFT_LEGACY_SELECTED_CHOICE_ID`.
- `import-local-scan-choice` requires `scanId` and `sourceChoiceId` for V2.
- if payload has `selectedSkills`, parse as V2.
- if payload only has `selectedSkillIds`, parse as legacy compat.
- if both exist, prefer `selectedSkills` and add warning diagnostic.
- invalid JSON shape returns `BRIDGE_REQUEST_INVALID`.
- selector semantic failures return `IMPORT_SELECTOR_INVALID`, `IMPORT_SELECTOR_NOT_FOUND`, or `IMPORT_SELECTOR_AMBIGUOUS`.
- only desktop capability `importDraftV2 === true` may send V2.
- unknown or missing capability must send legacy mode payload selection directly.
- `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2` is only for a new CLI path that explicitly rejects V2; do not assume old CLIs can return this new error code.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: accept import v2 bridge drafts"
```

## Task 4: Add Desktop V2 Payload And Legacy Mode/Retry

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing Swift tests**

```swift
func testCommitImportSourceSendsSelectedSkillsWhenSupported() async throws {
    let fixture = RecordingBridgeFixture.install()
    let bridge = fixture.bridge
    _ = try await bridge.commitImportSource(
        preparationId: "prep-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    let payload = try fixture.lastPayload()
    XCTAssertNotNil(payload["draft"]?["selectedSkills"])
    XCTAssertNil(payload["draft"]?["selectedSkillIds"])
}

func testImportSourceSendsSelectedSkillsWhenSupported() async throws {
    let fixture = RecordingBridgeFixture.install()
    let bridge = fixture.bridge
    _ = try await bridge.importSource(
        locator: "github:anthropics/skills",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    let payload = try fixture.lastPayload()
    XCTAssertEqual(payload["command"] as? String, "import-source")
    XCTAssertNotNil(payload["payload"]?["draft"]?["selectedSkills"])
    XCTAssertNil(payload["payload"]?["draft"]?["selectedSkillIds"])
}

func testLocalImportAndScanUseSelectedSkillsWhenSupported() async throws {
    let fixture = RecordingBridgeFixture.install()
    let viewModel = MainViewModel(bridge: fixture.bridge)

    try await viewModel.importLocalChoice(
        sourceChoiceId: "choice-local-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_local",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/local-tool")
            )
        ],
        selectedSkillIds: ["skills/local-tool"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )
    XCTAssertNotNil(try fixture.lastPayload()["payload"]?["draft"]?["selectedSkills"])

    try await viewModel.importLocalScanChoice(
        scanId: "scan-1",
        sourceChoiceId: "choice-scan-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_scan",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "tools/scan-tool")
            )
        ],
        selectedSkillIds: ["tools/scan-tool"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )
    XCTAssertNotNil(try fixture.lastPayload()["payload"]?["draft"]?["selectedSkills"])
}

func testDoesNotRetryLegacyForSelectorSemanticErrors() async throws {
    let fixture = ErroringBridgeFixture.install(errorCode: "IMPORT_SELECTOR_NOT_FOUND")
    let bridge = fixture.bridge

    await XCTAssertThrowsErrorAsync(
        try await bridge.commitImportSource(
            preparationId: "prep-1",
            selectedSkills: [
                ImportSkillSelectionPayload(
                    uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                    selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/missing")
                )
            ],
            selectedSkillIds: ["skills/missing"],
            enabledTargets: ["codex"],
            supportsImportV2: true
        )
    )

    XCTAssertEqual(try fixture.sentPayloadCount(), 1)
}

func testCommitImportSourceSendsLegacyWhenCapabilityFalseOrMissing() async throws {
    let fixture = RecordingBridgeFixture.install()
    let bridge = fixture.bridge

    _ = try await bridge.commitImportSource(
        preparationId: "prep-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: false
    )
    var payload = try fixture.lastPayload()
    XCTAssertNil(payload["draft"]?["selectedSkills"])
    XCTAssertEqual(payload["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])

    _ = try await bridge.commitImportSource(
        preparationId: "prep-2",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: nil
    )
    payload = try fixture.lastPayload()
    XCTAssertNil(payload["draft"]?["selectedSkills"])
    XCTAssertEqual(payload["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])
}

func testImportSourceSendsLegacyWhenCapabilityFalseOrMissing() async throws {
    let fixture = RecordingBridgeFixture.install()
    let bridge = fixture.bridge

    _ = try await bridge.importSource(
        locator: "github:anthropics/skills",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: false
    )
    var payload = try fixture.lastPayload()
    XCTAssertNil(payload["payload"]?["draft"]?["selectedSkills"])
    XCTAssertEqual(payload["payload"]?["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])

    _ = try await bridge.importSource(
        locator: "github:anthropics/skills",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: nil
    )
    payload = try fixture.lastPayload()
    XCTAssertNil(payload["payload"]?["draft"]?["selectedSkills"])
    XCTAssertEqual(payload["payload"]?["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])
}

func testCommitImportSourceRetriesLegacyOnceWhenV2Unsupported() async throws {
    let fixture = ErroringBridgeFixture.install(errorCode: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2", succeedOnAttempt: 2)
    let bridge = fixture.bridge

    _ = try await bridge.commitImportSource(
        preparationId: "prep-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    XCTAssertEqual(try fixture.sentPayloadCount(), 2)
    XCTAssertNotNil(try fixture.payload(at: 0)["draft"]?["selectedSkills"])
    XCTAssertEqual(try fixture.payload(at: 1)["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])
}

func testImportSourceRetriesLegacyOnceWhenV2Unsupported() async throws {
    let fixture = ErroringBridgeFixture.install(errorCode: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2", succeedOnAttempt: 2)
    let bridge = fixture.bridge

    _ = try await bridge.importSource(
        locator: "github:anthropics/skills",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design")
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    XCTAssertEqual(try fixture.sentPayloadCount(), 2)
    XCTAssertNotNil(try fixture.payload(at: 0)["payload"]?["draft"]?["selectedSkills"])
    XCTAssertEqual(try fixture.payload(at: 1)["payload"]?["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: fail because desktop still sends legacy ids.

- [ ] **Step 3: Implement Swift payload models**

```swift
struct ImportSkillSelectorPayload: Codable, Equatable, Sendable {
    let kind: String
    let path: String?
}

struct ImportSkillSelectionPayload: Codable, Equatable, Sendable {
    let uiId: String
    let selector: ImportSkillSelectorPayload
}
```

- [ ] **Step 4: Implement desktop selection rules**

Rules:

- UI selection state uses `uiId + selector`.
- `selectedSkillIds` is compat payload material only.
- use V2 payload only when preview `version == 2`, selected skills all have selector, and capability `importDraftV2 == true`.
- if those conditions are false before sending, including unknown or missing `importDraftV2`, use legacy mode payload selection.
- after sending V2, retry legacy once only for `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`.
- never retry legacy for `BRIDGE_REQUEST_INVALID`, `IMPORT_SELECTOR_INVALID`, `IMPORT_SELECTOR_NOT_FOUND`, `IMPORT_SELECTOR_AMBIGUOUS`.
- if selected V2 skill lacks selector, block submit and show `IMPORT_PREVIEW_SELECTOR_MISSING`.

- [ ] **Step 5: Add toast diagnostics formatter**

Add failing formatter tests:

```swift
func testImportToastFormatterIncludesReasonDiagnosticSelectorTargetAndBridgeCode() {
    let message = ImportToastDiagnosticsFormatter.message(
        reasonCode: "IMPORT_SELECTOR_NOT_FOUND",
        diagnostics: [
            BridgeDiagnostic(
                code: "IMPORT_SELECTOR_NOT_FOUND",
                message: "Selector not found",
                details: [
                    "kind": "repoPath",
                    "value": "skills/missing",
                    "target": "codex",
                    "bridgeCode": "BRIDGE_REQUEST_INVALID"
                ]
            )
        ]
    )

    XCTAssertTrue(message.contains("IMPORT_SELECTOR_NOT_FOUND"))
    XCTAssertTrue(message.contains("repoPath"))
    XCTAssertTrue(message.contains("skills/missing"))
    XCTAssertTrue(message.contains("codex"))
    XCTAssertTrue(message.contains("BRIDGE_REQUEST_INVALID"))
}

func testImportToastFormatterIncludesUnsupportedV2BridgeCode() {
    let message = ImportToastDiagnosticsFormatter.message(
        reasonCode: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2",
        diagnostics: [
            BridgeDiagnostic(
                code: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2",
                message: "Import draft v2 is unsupported",
                details: ["bridgeCode": "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2"]
            )
        ]
    )

    XCTAssertTrue(message.contains("BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2"))
}

func testImportToastFormatterIncludesUnavailableTarget() {
    let message = ImportToastDiagnosticsFormatter.message(
        reasonCode: "ADD_AGENT_NOT_AVAILABLE",
        diagnostics: [
            BridgeDiagnostic(
                code: "ADD_AGENT_NOT_AVAILABLE",
                message: "Target unavailable",
                details: ["target": "codex"]
            )
        ]
    )

    XCTAssertTrue(message.contains("ADD_AGENT_NOT_AVAILABLE"))
    XCTAssertTrue(message.contains("codex"))
}
```

Formatter must include:

- `reasonCode`
- first diagnostic `code`
- selector `details.kind`
- selector `details.value`
- target for `ADD_AGENT_NOT_AVAILABLE`
- bridge code for `BRIDGE_REQUEST_INVALID`
- bridge code for `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`

- [ ] **Step 6: Run Swift tests**

```bash
cd apps/desktop-mac
swift test
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac
git commit -m "feat: support import v2 desktop bridge"
```

## Task 5: Add Provider E2E, Repair, And Diagnostics Verification

**Files:**

- Create: `packages/query/src/tests/state-schema-v2-e2e.test.ts`
- Create: `packages/query/src/tests/state-schema-v2-target-repair.test.ts`
- Create: `packages/query/src/tests/skill-collection-diagnostics.test.ts`

- [ ] **Step 1: Add provider e2e tests**

```ts
test.each([
  ["fixture:anthropics-skills", "skills/frontend-design"],
  ["fixture:vercel-agent-skills", "skills/frontend-design"],
  ["fixture:gstack", "skills/gstack"],
])("%s imports through preview prepare commit with repoPath selector", async (fixtureName, repoPath) => {
  const provider = createMockImportProvider(fixtureName);
  const locator = provider.locator;
  const app = new SkillFlowApp({ stateRoot: await createTempStateRoot(), importProvider: provider });
  const preview = await app.previewImportSource(locator);
  const skill = preview.data.skills.find((candidate) => candidate.selector.path === repoPath)!;
  expect(skill.selector).toEqual({ kind: "repoPath", path: repoPath });
  expect(skill.origin.providerSkillId ?? "").not.toBe(skill.uiId);

  const prepared = await app.prepareImportSource(locator);
  const preparation = await app.store.readImportPreparationRecord(prepared.data.preparationId);
  expect(preparation.skillRefs).toContainEqual(expect.objectContaining({ repoPath }));

  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: skill.uiId, selector: skill.selector }],
    enabledTargets: ["codex"],
  });
  expect(result.data.status).toBe("success");
});
```

Default e2e tests must use fixture/mock providers for deterministic archive fallback, local checkout, and selector behavior. Real GitHub provider coverage belongs in an opt-in integration suite such as `state-schema-v2-provider.integration.test.ts`, gated by `SKILL_FLOW_RUN_PROVIDER_INTEGRATION=1`, and must not run in default `npm test`.

- [ ] **Step 2: Add target repair tests**

```ts
test("repair does not trust stale projection target path or content hash", async () => {
  const targetRoot = await createTempTargetRoot("old-codex-skills");
  const app = await seedMigratedStateWithStaleProjection({
    targetPath: path.join(targetRoot, "frontend-design"),
    contentHash: "hash-stale",
  });

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "relink",
      current: expect.objectContaining({
        targetPath: expect.not.stringContaining(targetRoot),
        contentHash: expect.not.stringMatching("hash-stale"),
      }),
    }),
  );
});

test("collection projection hash comes from materialized snapshot after origin changes", async () => {
  const app = await seedMigratedCollectionFixture();
  await mutateOriginSkillContent(app, "source-a", "leaf-a", "# Updated Origin\n");

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      sourceId: "group-1",
      current: expect.objectContaining({ contentHash: "hash-copied" }),
    }),
  );
});

test("repair blocks unknown target without writing stale path", async () => {
  const targetRoot = await createTempTargetRoot("old-agent");
  const stalePath = path.join(targetRoot, "frontend-design");
  const app = await seedMigratedStateWithUnknownTarget({
    target: "old-agent",
    targetPath: stalePath,
  });

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "block",
      target: "old-agent",
      current: expect.objectContaining({ status: "blocked" }),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "TARGET_UNKNOWN", retryable: false }),
      ]),
    }),
  );
  expect(await pathExists(stalePath)).toBe(false);
});

test("repair removes disabled leaf projection", async () => {
  const app = await seedMigratedStateWithDisabledLeafProjection({
    sourceId: "source-a",
    leafId: "leaf-disabled",
    target: "codex",
  });

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "remove",
      sourceId: "source-a",
      leafId: "leaf-disabled",
      current: expect.objectContaining({ status: "removed" }),
    }),
  );
});

test("status inspection reports target drift and apply repairs it", async () => {
  const app = await seedMigratedStateWithTargetDrift({
    sourceId: "source-a",
    leafId: "leaf-a",
    target: "codex",
  });

  const before = await app.inspectTargetStatus();
  expect(before.data.diagnostics).toContainEqual(
    expect.objectContaining({ code: "TARGET_PROJECTION_DRIFT" }),
  );

  await app.applyTargets();

  const after = await app.inspectTargetStatus();
  expect(after.data.diagnostics).not.toContainEqual(
    expect.objectContaining({ code: "TARGET_PROJECTION_DRIFT" }),
  );
});

test("repair recomputes target root from current target definition", async () => {
  const previousRoot = await createTempTargetRoot("old-codex-skills");
  const currentRoot = await createTempTargetRoot("new-codex-skills");
  const app = await seedMigratedStateWithTargetRootChange({
    target: "codex",
    previousRoot,
    currentRoot,
  });

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "relink",
      target: "codex",
      previous: expect.objectContaining({ targetPath: expect.stringContaining(previousRoot) }),
      current: expect.objectContaining({ targetPath: expect.stringContaining(currentRoot) }),
    }),
  );
});
```

- [ ] **Step 3: Add collection diagnostics tests**

```ts
test("collection reports origin hash changed without mutating snapshot", async () => {
  const app = await seedMigratedCollectionFixture();
  await mutateOriginSkillContent(app, "source-a", "leaf-a", "# Updated Origin\n");

  const result = await app.inspectCollection("group-1");
  expect(result.data.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "COLLECTION_ORIGIN_HASH_CHANGED",
      details: expect.objectContaining({
        sourceId: "source-a",
        leafId: "leaf-a",
        repoPath: "skills/frontend-design",
        capturedHash: expect.any(String),
        currentHash: expect.any(String),
      }),
    }),
  );
  expect(await readCollectionSnapshot(app, "group-1", "member-1")).toContain("Frontend Design");
});
```

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- state-schema-v2-e2e.test.ts state-schema-v2-target-repair.test.ts skill-collection-diagnostics.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/tests/state-schema-v2-e2e.test.ts packages/query/src/tests/state-schema-v2-target-repair.test.ts packages/query/src/tests/skill-collection-diagnostics.test.ts
git commit -m "test: verify state schema v2 import and repair"
```

## Task 6: Documentation, Release Notes, And Full Verification

**Files:**

- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `releases/<version>.md`

- [ ] **Step 1: Update user docs**

Document:

```text
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2
SKILL_FLOW_STATE_ROOT=/custom/path skill-flow migrate-state --to v2
```

State:

- default state root is `~/.skillflow`.
- migration creates backup `<stateRoot>.backup-YYYYMMDD-HHMMSS`.
- cache is pruned and rebuilt.
- target directories are not authoritative.
- run apply/repair after migration if target directories look stale.
- rollback restores the backup state root.
- after rollback, run `skill-flow migrate-state --to v2 --dry-run` or desktop migration status inspection.
- do not reconstruct state from target directories.

- [ ] **Step 2: Add release note**

Release note must include:

```text
State schema v2 migrates Skill Flow's persisted state under ~/.skillflow.
Legacy state is only readable by the migration command and migration status inspection.
Run skill-flow migrate-state --to v2 --dry-run before applying migration.
```

- [ ] **Step 3: Run full verification**

```bash
npm run build
npm test
cd apps/desktop-mac
swift test
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md README.zh.md releases
git commit -m "docs: document state schema v2 migration"
```

## Legacy Boundary Conditions

Do not add ordinary runtime legacy state reading. Legacy state support is limited to migration and bridge payload parsing. Before release, verify all are true:

1. ordinary query/runtime state reads reject V1 with `STATE_MIGRATION_REQUIRED`.
2. migration CLI and desktop migration status inspection can read V1 and explain the conversion.
3. new desktop + new CLI, old desktop + new CLI, new desktop + old CLI combo tests pass for bridge payload negotiation.
4. desktop sends V2 draft by default and has legacy retry only for `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`.
5. local diagnostics include `skill-flow migrate-state --to v2 --dry-run` and desktop migration status inspection.
6. README and release notes identify that V1 state must be migrated before normal app use.
7. bridge warnings may include `IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`; state layer must not add V1 compatibility warnings because normal runtime must reject V1.
