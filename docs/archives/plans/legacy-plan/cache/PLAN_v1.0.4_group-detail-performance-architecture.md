# Group Detail Performance Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Group Detail data flow so entering the page and switching large markdown documents no longer stalls on eager file loading, deep value comparison, or repeated markdown parsing.

**Architecture:** Split Group Detail into a lightweight route snapshot and a lazy document content layer. The main view model should publish only stable document descriptors and tree metadata; document bodies and rendered markdown should be resolved on demand through a dedicated store keyed by `document.id` and `renderCacheKey`.

**Tech Stack:** Swift 6, SwiftUI Observation, XCTest, Textual, Yams

---

## File Structure

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - Replace eager `DocumentTab.content` construction in detail snapshots with lightweight document descriptors and lazy detail content manifests.
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/DetailViewModel.swift`
  - Keep `Snapshot` lightweight and aligned with the new descriptor-based contract.
- Create: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailDocumentStore.swift`
  - Own raw document loading, parsed frontmatter caching, and async content retrieval for selected group/skill documents.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
  - Cache view models by revision key instead of deep snapshot equality and expose document-loading accessors.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
  - Render from descriptors, request document content lazily, and keep selection UI responsive while documents resolve.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentView.swift`
  - Compare by lightweight identity (`renderCacheKey`, `metadata`, theme) instead of full markdown body values.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentRenderer.swift`
  - Keep attributed-string cache keyed by `renderCacheKey`; add explicit eviction/reset hooks for tests.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`
  - Cover revision-based reuse/rebuild behavior without large document bodies in snapshots.
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailDocumentStoreTests.swift`
  - Cover lazy loading, single-flight reads, and parsed metadata reuse.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MarkdownDocumentRendererTests.swift`
  - Cover renderer behavior when document identity stays stable and content is fetched lazily.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`
  - Cover detail manifest generation without eager markdown body loading.

### Task 1: Shrink Group Detail Snapshot Surface

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/DetailViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
@MainActor
func testDetailContainerReusesViewModelWhenRevisionAndDescriptorsStayStable() throws {
    let state = DesktopAppState()
    state.view.currentRoute = .detail(sourceId: "alpha")

    let descriptor = MainViewModel.DocumentDescriptor(
        id: "group:/tmp/README.md",
        title: "README.md",
        path: "/tmp/README.md",
        metadata: [],
        renderCacheKey: "group:/tmp/README.md:rev-1",
        externalURL: nil
    )

    let snapshot = DetailViewModel.Snapshot(
        sourceId: "alpha",
        revision: "alpha:rev-1",
        title: "AlphaHub",
        subtitle: "clawhub",
        author: "Acme",
        originLabel: "ClawHub",
        starCount: 12,
        groupStats: MainViewModel.GroupCardStats(skillCount: 1, downloadCount: 10, starCount: 12, githubURL: nil, localPath: nil),
        sourceDetailLines: [],
        sourceRepositoryURL: nil,
        locator: "clawhub/alpha",
        groupPath: "/tmp",
        updatedAt: "2026-04-01T00:00:00Z",
        updatedRelative: "Updated now",
        health: "healthy",
        warningCount: 0,
        errorCount: 0,
        enabledSkillCount: 1,
        totalSkillCount: 1,
        enabledTargetCount: 1,
        saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
        skillSelection: .full,
        targetSelection: .full,
        enabledTargetLabels: ["Claude Code"],
        sourceFacts: [],
        deploymentFacts: [],
        fileTree: [],
        groupDocuments: [descriptor],
        targets: [],
        skills: []
    )

    let container = DetailScreenContainer(state: state) { _ in snapshot }
    let first = try XCTUnwrap(container.viewModel)
    let second = try XCTUnwrap(container.viewModel)

    XCTAssertTrue(first === second)
}

@MainActor
func testDetailContainerRebuildsViewModelWhenRevisionChanges() throws {
    let state = DesktopAppState()
    state.view.currentRoute = .detail(sourceId: "alpha")
    var revision = "alpha:rev-1"

    let container = DetailScreenContainer(state: state) { _ in
        DetailViewModel.Snapshot.fixture(revision: revision)
    }

    let first = try XCTUnwrap(container.viewModel)
    revision = "alpha:rev-2"
    let second = try XCTUnwrap(container.viewModel)

    XCTAssertFalse(first === second)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac && swift test --filter DetailScreenContainerTests
```

Expected: FAIL because `DocumentDescriptor`, `revision`, and fixture helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```swift
struct DocumentDescriptor: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let path: String
    let metadata: [MetadataEntry]
    let renderCacheKey: String
    let externalURL: String?
}

extension DetailViewModel {
    struct Snapshot: Equatable {
        let sourceId: String
        let revision: String
        // existing fields...
        let groupDocuments: [MainViewModel.DocumentDescriptor]
        let skills: [DetailSkill]
    }
}

var viewModel: DetailViewModel? {
    guard let sourceId, let snapshot = detailSnapshot(sourceId) else { return nil }
    if cachedDetailSourceId == sourceId,
       cachedDetailRevision == snapshot.revision,
       let cachedDetailViewModel {
        return cachedDetailViewModel
    }

    let next = DetailViewModel(snapshot: snapshot)
    cachedDetailSourceId = sourceId
    cachedDetailRevision = snapshot.revision
    cachedDetailViewModel = next
    return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/desktop-mac && swift test --filter DetailScreenContainerTests
```

Expected: PASS for the new revision-based reuse/rebuild tests and existing container coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/DetailViewModel.swift apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift
git commit -m "refactor: shrink group detail snapshot identity"
```

### Task 2: Replace Eager Markdown Warmup With Lazy Document Store

**Files:**
- Create: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailDocumentStore.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailDocumentStoreTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
@MainActor
func testDocumentStoreLoadsMarkdownOnlyWhenRequested() async throws {
    let url = try makeMarkdownFile(
        named: "README.md",
        contents: """
        ---
        name: AlphaHub
        ---
        # Hello
        """
    )

    let store = DetailDocumentStore(fileReader: { path in
        XCTAssertEqual(path, url.path)
        return try String(contentsOfFile: path, encoding: .utf8)
    })

    let descriptor = MainViewModel.DocumentDescriptor(
        id: "group:\(url.path)",
        title: "README.md",
        path: url.path,
        metadata: [],
        renderCacheKey: "\(url.path):rev-1",
        externalURL: nil
    )

    let first = try await store.document(for: descriptor)
    let second = try await store.document(for: descriptor)

    XCTAssertEqual(first.content, "# Hello")
    XCTAssertEqual(first.metadata.first?.key, "name")
    XCTAssertEqual(second.content, "# Hello")
    XCTAssertEqual(store.debugLoadCount(for: url.path), 1)
}

@MainActor
func testDetailSnapshotBuildsGroupDocumentsWithoutReadingMarkdownBodies() async throws {
    let model = try await makeModel()
    try await seedInspectPayload(model, sourceId: "alpha")

    let snapshot = try XCTUnwrap(model.detailSnapshot(for: "alpha"))

    XCTAssertFalse(snapshot.groupDocuments.isEmpty)
    XCTAssertTrue(snapshot.groupDocuments.allSatisfy { !$0.renderCacheKey.isEmpty })
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac && swift test --filter DetailDocumentStoreTests
cd apps/desktop-mac && swift test --filter MainViewModelSelectionTests
```

Expected: FAIL because `DetailDocumentStore`, lazy `document(for:)`, and descriptor-only snapshots do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```swift
@MainActor
final class DetailDocumentStore {
    struct LoadedDocument: Equatable {
        let id: String
        let metadata: [MainViewModel.MetadataEntry]
        let content: String
        let renderCacheKey: String
    }

    typealias FileReader = @Sendable (String) throws -> String

    private var cache: [String: LoadedDocument] = [:]
    private var inFlight: [String: Task<LoadedDocument, Error>] = [:]
    private let fileReader: FileReader

    init(fileReader: @escaping FileReader = { path in
        try String(contentsOfFile: path, encoding: .utf8)
    }) {
        self.fileReader = fileReader
    }

    func document(for descriptor: MainViewModel.DocumentDescriptor) async throws -> LoadedDocument {
        if let cached = cache[descriptor.id] { return cached }
        if let task = inFlight[descriptor.id] { return try await task.value }

        let task = Task { [fileReader] in
            let raw = try fileReader(descriptor.path)
            let parsed = MainViewModel.parseDetailDocument(raw)
            return LoadedDocument(
                id: descriptor.id,
                metadata: parsed.metadata,
                content: parsed.body,
                renderCacheKey: descriptor.renderCacheKey
            )
        }
        inFlight[descriptor.id] = task
        let loaded = try await task.value
        cache[descriptor.id] = loaded
        inFlight[descriptor.id] = nil
        return loaded
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/desktop-mac && swift test --filter DetailDocumentStoreTests
cd apps/desktop-mac && swift test --filter MainViewModelSelectionTests
```

Expected: PASS with document bodies loaded only on demand and detail snapshot generation no longer depending on eager markdown reads.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailDocumentStore.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailDocumentStoreTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "refactor: lazy load group detail documents"
```

### Task 3: Rewire Detail UI To Render From Descriptors And Async Content

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
func testLocalizedDocumentTitleStillUsesDescriptorTitle() {
    let markdownDocument = MainViewModel.DocumentDescriptor(
        id: "group:/tmp/README.md",
        title: "README.md",
        path: "/tmp/README.md",
        metadata: [],
        renderCacheKey: "readme:rev-1",
        externalURL: nil
    )

    XCTAssertEqual(
        DetailScreen.localizedDocumentTitle(markdownDocument, locale: Locale(identifier: "zh-Hans")),
        "README.md"
    )
}

@MainActor
func testMarkdownViewEqualityIgnoresUnloadedBodyState() {
    let descriptor = MainViewModel.DocumentDescriptor(
        id: "group:/tmp/README.md",
        title: "README.md",
        path: "/tmp/README.md",
        metadata: [],
        renderCacheKey: "readme:rev-1",
        externalURL: nil
    )

    XCTAssertEqual(
        MarkdownDocumentView.Model(descriptor: descriptor, content: nil, metadata: []),
        MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
    )
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests
cd apps/desktop-mac && swift test --filter DetailScreenContainerTests
```

Expected: FAIL because `localizedDocumentTitle` and markdown rendering still depend on `DocumentTab`.

- [ ] **Step 3: Write minimal implementation**

```swift
extension DetailScreen {
    static func localizedDocumentTitle(_ document: MainViewModel.DocumentDescriptor, locale: Locale) -> String {
        if document.id == "group:filetree" {
            return L10n.string("detail.document.file_tree", locale: locale)
        }
        return document.title
    }
}

struct MarkdownDocumentView: View, Equatable {
    struct Model: Equatable {
        let descriptor: MainViewModel.DocumentDescriptor
        let content: String?
        let metadata: [MainViewModel.MetadataEntry]

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.descriptor.renderCacheKey == rhs.descriptor.renderCacheKey &&
            lhs.metadata == rhs.metadata
        }
    }

    let model: Model
    let theme: DesktopThemeMode
    // resolve rendered markdown from model.content when available
}

@MainActor
func loadedDocument(for descriptor: MainViewModel.DocumentDescriptor) async -> DetailDocumentStore.LoadedDocument? {
    try? await detailDocumentStore.document(for: descriptor)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests
cd apps/desktop-mac && swift test --filter DetailScreenContainerTests
```

Expected: PASS with descriptor-based tabs and responsive loading placeholders during document switches.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift
git commit -m "refactor: render group detail documents lazily"
```

### Task 4: Lock Down Markdown Render Caching And Run Full Regression

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentRenderer.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MarkdownDocumentRendererTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
@MainActor
func testRendererResetsWithoutTouchingOtherCacheKeys() async {
    let renderer = MarkdownDocumentRenderer { tab in
        AttributedString(tab.content ?? "")
    }

    let first = MainViewModel.RenderableDocument(
        id: "a",
        content: "# A",
        renderCacheKey: "doc-a"
    )
    let second = MainViewModel.RenderableDocument(
        id: "b",
        content: "# B",
        renderCacheKey: "doc-b"
    )

    _ = await renderer.renderedContent(for: first)
    _ = await renderer.renderedContent(for: second)
    renderer.reset(renderCacheKey: "doc-a")

    XCTAssertNil(renderer.cachedContent(for: "doc-a"))
    XCTAssertNotNil(renderer.cachedContent(for: "doc-b"))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac && swift test --filter MarkdownDocumentRendererTests
```

Expected: FAIL because the renderer has no targeted reset API and still accepts only eager `DocumentTab`.

- [ ] **Step 3: Write minimal implementation**

```swift
protocol RenderableMarkdownDocument {
    var renderCacheKey: String { get }
    var content: String? { get }
}

extension MarkdownDocumentRenderer {
    func reset(renderCacheKey: String) {
        cache[renderCacheKey] = nil
        inFlightTasks[renderCacheKey]?.cancel()
        inFlightTasks[renderCacheKey] = nil
    }
}

private static func defaultRenderAction(document: some RenderableMarkdownDocument) async -> AttributedString {
    let markdown = document.content ?? ""
    return await Task.detached(priority: .userInitiated) {
        (try? AttributedString(markdown: markdown, including: \.textual)) ?? AttributedString()
    }.value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/desktop-mac && swift test --filter MarkdownDocumentRendererTests
cd apps/desktop-mac && swift test --filter WorkflowCoverageTests
cd apps/desktop-mac && swift test
```

Expected: PASS for markdown cache behavior, detail route coverage, and the full desktop package test suite.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentRenderer.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MarkdownDocumentRendererTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift
git commit -m "test: lock down group detail markdown performance path"
```

## Architecture Notes

- The current `DetailViewModel.Snapshot` is overloaded: it mixes stable route identity, visible selection state, file tree manifest, and heavyweight document bodies. This is the direct cause of deep comparisons on large markdown payloads.
- The redesigned page should have three layers only:
  - `MainViewModel` publishes a lightweight `DetailManifest` for the selected source: header data, target list, skill list, file tree, and document descriptors.
  - `DetailScreenContainer` owns UI selection state and a `DetailDocumentStore` that resolves the currently selected document body on demand.
  - `MarkdownDocumentRenderer` only knows how to turn one resolved markdown string into an attributed string, keyed by `renderCacheKey`.
- Group root documents and skill documents should use the same document pipeline. The only difference should be the descriptor source, not a different rendering contract.
- Entering Group Detail should load the manifest and first-selected descriptor only. It should not read every `README.md`, every `references/*.md`, and every skill markdown body just to open the route.

## Why This Is A Staged Refactor Instead Of A Full Rewrite

- A full rewrite of `DetailScreen.swift` is technically possible, but it is not the shortest path to fixing the current bottlenecks.
- The view hierarchy is large, but the highest-cost defects are concentrated in the data contract and caching boundary, not in the presence of many SwiftUI subviews.
- Rebuilding the page wholesale would increase regression risk across localization, selection persistence, file-tree navigation, tag editing, target toggles, and update flows without solving the bottleneck more directly than a staged boundary refactor.
- The right move is to fully rebuild the data architecture while keeping the user-facing layout and interaction model intact. After that lands and measurements are clean, a second-pass visual or structural cleanup becomes optional instead of mandatory.
