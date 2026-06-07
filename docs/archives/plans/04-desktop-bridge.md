# Desktop Bridge V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 macOS 桌面端支持 V2 import preview、draft、bridge payload 和 diagnostics，同时保持旧 CLI/旧 preview 可用。

**Architecture:** Swift ViewModel 保存 `uiId + selector`，UI 勾选优先看 `uiId`，bridge 在确认 CLI 支持 V2 时发送 `selectedSkills`。如果当前 preview 没有 selector 或 CLI 未声明支持 V2，桌面端进入 legacy mode payload selection，直接发送 legacy `selectedSkillIds`；只有已经发送 V2 `selectedSkills` 且旧 CLI 明确返回 `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2` 时，才 retry legacy payload。selector 结构或语义错误不得 retry legacy。

**Tech Stack:** SwiftUI、XCTest、bridge JSON payload。

---

## 文件范围

修改：

- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

## Tasks

### Task 1: Add Swift selector payload models

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testImportSelectorPayloadEncodesRepoPath() throws {
    let selector = ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design", name: nil)
    let data = try JSONEncoder().encode(selector)
    let json = String(data: data, encoding: .utf8)!
    XCTAssertTrue(json.contains("\"kind\":\"repoPath\""))
    XCTAssertTrue(json.contains("\"path\":\"skills/frontend-design\""))
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: fail because model does not exist.

- [ ] **Step 3: Add models**

Add:

```swift
struct ImportSkillSelectorPayload: Codable, Equatable, Sendable {
    let kind: String
    let path: String?
    let name: String?
}

struct ImportSkillSelectionPayload: Codable, Equatable, Sendable {
    let uiId: String
    let selector: ImportSkillSelectorPayload
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "feat: add desktop import selector payloads"
```

### Task 2: Parse V2 preview skills

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testPreviewParserReadsUiIdAndSelector() {
    let payload: [String: AnyCodable] = [
        "status": AnyCodable("ready"),
        "version": AnyCodable(2),
        "skills": AnyCodable([
            [
                "id": AnyCodable("skills/frontend-design"),
                "uiId": AnyCodable("skill_b6hm2m3d9nd8c4k7q2ea"),
                "title": AnyCodable("frontend-design"),
                "selector": AnyCodable([
                    "kind": AnyCodable("repoPath"),
                    "path": AnyCodable("skills/frontend-design")
                ])
            ]
        ])
    ]

    let skill = MainViewModel.parseImportPreview(payload).skills.first
    XCTAssertEqual(skill?.uiId, "skill_b6hm2m3d9nd8c4k7q2ea")
    XCTAssertEqual(skill?.selector?.kind, "repoPath")
    XCTAssertEqual(skill?.selector?.path, "skills/frontend-design")
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: fail because parser only reads `id`.

- [ ] **Step 3: Extend ImportGroupSkill**

Add fields:

```swift
let uiId: String
let selector: ImportSkillSelectorPayload?
```

Rules:

- `uiId = payload["uiId"] ?? payload["id"]`
- `id = payload["id"]`
- `selector = nil` for legacy preview

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "feat: parse desktop import preview selectors"
```

### Task 3: Detect import V2 capability and preserve legacy mode/retry

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testUsesLegacyPayloadWhenPreviewDoesNotDeclareV2() async throws {
    let bridge = BridgeClient.fixture()
    _ = try await bridge.commitImportSource(
        preparationId: "prep-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design", name: nil)
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: false
    )

    let payload = try fixture.lastPayload()
    XCTAssertNil(payload["draft"]?["selectedSkills"])
    XCTAssertEqual(payload["draft"]?["selectedSkillIds"] as? [String], ["skills/frontend-design"])
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: fail because capability is not modeled.

- [ ] **Step 3: Add capability rule**

Desktop treats import V2 as supported only when:

- preview payload has `version == 2`
- every selected skill has `selector`
- bridge bootstrap or preview payload includes `capabilities.importDraftV2 == true`

If any condition is false before sending the request, use legacy mode payload selection and send legacy `selectedSkillIds`.

- [ ] **Step 4: Add legacy retry**

If a V2 payload fails with:

```text
BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2
```

and the request contained `selectedSkills`, retry once with legacy `selectedSkillIds`.

Do not retry legacy for:

```text
BRIDGE_REQUEST_INVALID
IMPORT_SELECTOR_INVALID
IMPORT_SELECTOR_NOT_FOUND
IMPORT_SELECTOR_AMBIGUOUS
```

These errors mean the request is malformed or the selector cannot be resolved. The desktop must refresh preview/prepare or show diagnostics instead of sending legacy ids.

Terminology:

- legacy mode payload selection happens before a V2 request is sent, because selector/capability data is unavailable
- legacy retry happens only after a sent V2 request fails with `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`
- `BRIDGE_REQUEST_INVALID`, `IMPORT_SELECTOR_INVALID`, `IMPORT_SELECTOR_NOT_FOUND`, and `IMPORT_SELECTOR_AMBIGUOUS` are never legacy retry triggers

- [ ] **Step 5: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "feat: detect desktop import v2 capability"
```

### Task 4: Send V2 import draft payload

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testCommitImportSourceSendsSelectedSkillsWhenAvailable() async throws {
    let bridge = BridgeClient.fixture()
    _ = try await bridge.commitImportSource(
        preparationId: "prep-1",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design", name: nil)
            )
        ],
        selectedSkillIds: ["legacy-id"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    let payload = try fixture.lastPayload()
    XCTAssertNotNil(payload["draft"]?["selectedSkills"])
    XCTAssertNil(payload["draft"]?["selectedSkillIds"])
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: fail because BridgeClient sends only `selectedSkillIds`.

- [ ] **Step 3: Update command interfaces**

Bridge APIs accept:

```swift
selectedSkills: [ImportSkillSelectionPayload]
selectedSkillIds: [String]
enabledTargets: [String]
```

Payload rule:

- if `supportsImportV2` and `selectedSkills` non-empty, send `selectedSkills`
- otherwise send `selectedSkillIds` as legacy bridge payload construction only

`selectedSkillIds` must not be used for new desktop UI selection state. It is only:

- old preview restore material
- legacy bridge payload construction
- retry payload after `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`

- [ ] **Step 4: Update ImportScreenContainer**

When checked skill has selector:

```swift
ImportSkillSelectionPayload(uiId: skill.uiId, selector: selector)
```

If any selected V2 skill lacks selector, block submit and show `IMPORT_PREVIEW_SELECTOR_MISSING`.

- [ ] **Step 5: Run tests**

```bash
cd apps/desktop-mac
swift test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "feat: send desktop import v2 drafts"
```

### Task 5: Send V2 import-source fallback payload

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testImportSourceFallbackSendsSelectedSkillsWhenSupported() async throws {
    let bridge = BridgeClient.fixture()
    _ = try await bridge.importSource(
        locator: "github:anthropics/skills",
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design", name: nil)
            )
        ],
        selectedSkillIds: ["skills/frontend-design"],
        enabledTargets: ["codex"],
        supportsImportV2: true
    )

    let payload = try fixture.lastPayload()
    XCTAssertEqual(try fixture.lastCommand(), "import-source")
    XCTAssertNotNil(payload["draft"]?["selectedSkills"])
    XCTAssertNil(payload["draft"]?["selectedSkillIds"])
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: fail because fallback import only sends `selectedSkillIds`.

- [ ] **Step 3: Update importSource API**

Add:

```swift
importSource(
    locator: String,
    selectedSkills: [ImportSkillSelectionPayload],
    selectedSkillIds: [String],
    enabledTargets: [String],
    supportsImportV2: Bool
)
```

Use the same draft payload rule as `commitImportSource`.

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.BridgeClientExecutionTests
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "feat: send import-source v2 fallback drafts"
```

### Task 6: Wire local import and local scan selections to V2

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testLocalImportChoiceBuildsSelectedSkillsWhenSelectorsExist() {
    let choice = LocalImportChoice(
        sourceChoiceId: "matched-source",
        legacyChoiceId: "origin",
        label: "Origin",
        locator: "github:anthropics/skills",
        selectedSkillIds: ["skills/frontend-design"],
        selectedSkills: [
            ImportSkillSelectionPayload(
                uiId: "skill_b6hm2m3d9nd8c4k7q2ea",
                selector: ImportSkillSelectorPayload(kind: "repoPath", path: "skills/frontend-design", name: nil)
            )
        ]
    )

    XCTAssertEqual(choice.selectedSkills.first?.selector.path, "skills/frontend-design")
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: fail because local choices do not store V2 selections.

- [ ] **Step 3: Add selectedSkills to local choices**

Update:

- `LocalImportChoice`
- `LocalScanImportChoice`
- helper that currently computes `selectedSkillIdsForImport`

Add parallel helper:

```swift
selectedSkillsForImport
```

If selector data exists, send V2. Otherwise send legacy ids.

Choice id rule:

- new V2 local choices use `sourceChoiceId`
- `legacyChoiceId == "origin"` is only used when sending or restoring legacy payloads
- desktop UI selection state must not depend on `"origin"` for new V2 choices
- `LocalImportChoice.selectedSkillIds` and `LocalScanImportChoice.selectedSkillIds` are compat payload fields only; new UI state reads `selectedSkills`

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "feat: support local import v2 selections"
```

### Task 7: Improve import failure toast diagnostics

**Files:**

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func testImportFailureToastIncludesSelectorDiagnostic() {
    let message = MainViewModel.importFailureMessage(
        reasonCode: "IMPORT_SELECTOR_NOT_FOUND",
        diagnostics: [
            ImportDiagnosticPayload(
                code: "IMPORT_SELECTOR_NOT_FOUND",
                message: "No prepared skill matched selector.",
                details: ["kind": "repoPath", "value": "skills/frontend-design"]
            )
        ]
    )

    XCTAssertTrue(message.contains("IMPORT_SELECTOR_NOT_FOUND"))
    XCTAssertTrue(message.contains("repoPath"))
    XCTAssertTrue(message.contains("skills/frontend-design"))
}
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: fail because toast only shows generic failure.

- [ ] **Step 3: Parse diagnostics**

Add `ImportDiagnosticPayload` and a single formatter:

```swift
importFailureMessage(from response: BridgeResponse?, error: Error?) -> String
```

It must handle both:

- `response.data.status == "failed"`
- `BridgeClientError.commandFailed(response:)`

Extract:

- `reasonCode`
- `diagnostics[].details.kind`
- `diagnostics[].details.value`
- target for `ADD_AGENT_NOT_AVAILABLE`
- bridge code for `BRIDGE_REQUEST_INVALID`
- bridge code for `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`

- [ ] **Step 4: Run tests**

```bash
cd apps/desktop-mac
swift test --filter SkillFlowDesktopTests.MainViewModelSelectionTests
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "feat: show import selector diagnostics in desktop"
```
