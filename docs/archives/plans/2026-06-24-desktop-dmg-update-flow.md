# Desktop DMG Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a semi-automatic macOS desktop update flow: Settings checks GitHub Releases, downloads the matching DMG, opens it, and tells the user to quit Skill Flow and drag the new app into Applications.

**Architecture:** Keep update logic local to the existing desktop Settings flow. `DesktopGitHubUpdateChecker` discovers release metadata and the preferred DMG asset; `SettingsViewModel` owns the update state machine; `DesktopUpdateInstaller` downloads the DMG to Downloads and opens it with macOS. Do not auto-replace `/Applications/Skill Flow.app`.

**Tech Stack:** SwiftUI, Observation, Foundation `URLSession`, AppKit `NSWorkspace`, existing Swift XCTest tests, existing GitHub Releases assets.

## Global Constraints

- No Apple Developer, Developer ID signing, notarization, Sparkle, launchd watcher, or automatic `.app` replacement in this plan.
- The Settings row button labeled `Check` triggers release lookup; when `.updateAvailable`, the same button becomes `Install` and triggers DMG download/open.
- The `Open` button in `Open releases` remains a browser fallback and must not download anything.
- Prefer the current architecture-specific DMG asset, then `universal`, then the first HTTP(S) DMG.
- Keep changes inside `apps/desktop-mac` unless tests prove a release script change is required.
- Preserve unrelated dirty files and do not rewrite adjacent Settings UI.

---

## File Structure

- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift`
  - Responsibility: parse GitHub latest release and choose a safe DMG asset.
- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateInstaller.swift`
  - Responsibility: download the selected DMG to a local file and open it.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
  - Responsibility: Settings update state machine and button actions.
- Modify `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
  - Responsibility: show the update rows, button state, and installation guidance text.
- Modify localization files:
  - `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
  - `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
  - `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Modify tests:
  - `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateCheckerTests.swift`
  - `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateInstallerTests.swift`
  - `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`
  - `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`

---

### Task 1: Lock The Release Discovery Contract

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateCheckerTests.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift`

**Interfaces:**
- Consumes: GitHub latest release JSON with `tag_name`, `html_url`, and `assets`.
- Produces: `DesktopReleaseInfo(version: String, releaseURL: URL, installerURL: URL?)`.

- [ ] **Step 1: Write the failing tests**

Add tests that prove the checker selects a DMG and ignores unsafe URLs:

```swift
func testFetchLatestReleaseSelectsPreferredDMGAsset() async throws {
    let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.4.10")!
    let universalURL = "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.dmg"
    MockURLProtocol.requestHandler = { request in
        XCTAssertEqual(request.url?.absoluteString, "https://api.github.com/repos/VintLin/skill-flow/releases/latest")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        let body = """
        {
          "tag_name": "v1.4.10",
          "html_url": "\(releaseURL.absoluteString)",
          "assets": [
            {
              "name": "Skill-Flow-universal.zip",
              "browser_download_url": "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.zip"
            },
            {
              "name": "Skill-Flow-universal.dmg",
              "browser_download_url": "\(universalURL)"
            }
          ]
        }
        """
        return (response, Data(body.utf8))
    }

    let release = try await DesktopGitHubUpdateChecker(session: Self.mockSession()).fetchLatestRelease()

    XCTAssertEqual(release.version, "1.4.10")
    XCTAssertEqual(release.releaseURL, releaseURL)
    XCTAssertEqual(release.installerURL?.absoluteString, universalURL)
}

func testPreferredInstallerURLRejectsNonHTTPDMGAsset() {
    let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
        GitHubReleaseAsset(
            name: "Skill-Flow-universal.dmg",
            browserDownloadURL: "file:///tmp/Skill-Flow-universal.dmg"
        )
    ])

    XCTAssertNil(installerURL)
}
```

- [ ] **Step 2: Run tests to verify failure or current coverage**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopUpdateCheckerTests
```

Expected before implementation if behavior is missing: FAIL on DMG selection or unsafe URL rejection. If current code already passes, keep the tests as regression coverage.

- [ ] **Step 3: Implement minimal checker behavior**

Ensure `DesktopGitHubUpdateChecker` has this shape:

```swift
struct DesktopReleaseInfo: Equatable {
    let version: String
    let releaseURL: URL
    let installerURL: URL?
}

struct DesktopGitHubUpdateChecker: DesktopUpdateChecking {
    private let latestReleaseAPIURL = URL(string: "https://api.github.com/repos/VintLin/skill-flow/releases/latest")!
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        var request = URLRequest(url: latestReleaseAPIURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateCheckError.invalidResponse
        }

        let payload = try JSONDecoder().decode(GitHubReleasePayload.self, from: data)
        guard let releaseURL = URL(string: payload.htmlURL),
              ["http", "https"].contains(releaseURL.scheme?.lowercased()),
              releaseURL.host != nil else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        return DesktopReleaseInfo(
            version: Self.normalizedVersion(payload.tagName),
            releaseURL: releaseURL,
            installerURL: Self.preferredInstallerURL(from: payload.assets)
        )
    }

    static func preferredInstallerURL(from assets: [GitHubReleaseAsset]) -> URL? {
        let dmgAssets = assets.filter { $0.name.lowercased().hasSuffix(".dmg") }
        let preferredArch = currentArchitectureAssetToken()
        let preferredAsset = dmgAssets.first { $0.name.localizedCaseInsensitiveContains(preferredArch) }
            ?? dmgAssets.first { $0.name.localizedCaseInsensitiveContains("universal") }
            ?? dmgAssets.first
        guard let installerURL = preferredAsset.flatMap({ URL(string: $0.browserDownloadURL) }),
              ["http", "https"].contains(installerURL.scheme?.lowercased()),
              installerURL.host != nil else {
            return nil
        }
        return installerURL
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopUpdateCheckerTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateCheckerTests.swift
git commit -m "test: cover desktop release installer discovery"
```

---

### Task 2: Download The DMG And Open It

**Files:**
- Modify or Create: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateInstaller.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateInstallerTests.swift`

**Interfaces:**
- Consumes: `DesktopUpdateInstaller.install(from:session:downloadsDirectory:opener:)`.
- Produces: A local DMG file in Downloads and an `NSWorkspace.open` call for that local file.

- [ ] **Step 1: Write the failing tests**

Add tests for successful download/open and failed HTTP status:

```swift
@MainActor
func testInstallDownloadsDMGAndOpensLocalFile() async throws {
    let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.dmg")!
    let downloadsDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: downloadsDirectory) }

    InstallerMockURLProtocol.requestHandler = { request in
        XCTAssertEqual(request.url, installerURL)
        let response = HTTPURLResponse(url: installerURL, statusCode: 200, httpVersion: nil, headerFields: nil)!
        return (response, Data("dmg".utf8))
    }

    var openedURL: URL?
    try await DesktopUpdateInstaller.install(
        from: installerURL,
        session: Self.mockSession(),
        downloadsDirectory: downloadsDirectory,
        opener: { url in
            openedURL = url
            return true
        }
    )

    let expectedURL = downloadsDirectory.appendingPathComponent("Skill-Flow-universal.dmg")
    XCTAssertEqual(openedURL, expectedURL)
    XCTAssertEqual(try Data(contentsOf: expectedURL), Data("dmg".utf8))
}

@MainActor
func testInstallFailsOnNonSuccessHTTPStatus() async {
    let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.dmg")!
    let downloadsDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try? FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: downloadsDirectory) }

    InstallerMockURLProtocol.requestHandler = { request in
        let response = HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!
        return (response, Data())
    }

    do {
        try await DesktopUpdateInstaller.install(
            from: installerURL,
            session: Self.mockSession(),
            downloadsDirectory: downloadsDirectory,
            opener: { _ in true }
        )
        XCTFail("Expected install to fail.")
    } catch let error as DesktopUpdateInstallError {
        XCTAssertEqual(error, .invalidResponse)
    } catch {
        XCTFail("Unexpected error: \(error)")
    }
}
```

- [ ] **Step 2: Run tests to verify failure or current coverage**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopUpdateInstallerTests
```

Expected before implementation if behavior is missing: FAIL on missing installer or HTTP error handling. If current code already passes, keep the tests as regression coverage.

- [ ] **Step 3: Implement minimal installer**

Use this implementation, with no checksum or auto-replacement layer:

```swift
import AppKit
import Foundation

struct DesktopUpdateInstaller {
    static func install(
        from installerURL: URL,
        session: URLSession = .shared,
        downloadsDirectory: URL? = nil,
        opener: @escaping @MainActor (URL) -> Bool = { NSWorkspace.shared.open($0) }
    ) async throws {
        let (temporaryURL, response) = try await session.download(from: installerURL)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateInstallError.invalidResponse
        }

        let downloadsDirectory = downloadsDirectory
            ?? FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        let filename = installerURL.lastPathComponent.isEmpty ? "Skill-Flow.dmg" : installerURL.lastPathComponent
        let destinationURL = downloadsDirectory.appendingPathComponent(filename)

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.moveItem(at: temporaryURL, to: destinationURL)

        _ = await MainActor.run {
            opener(destinationURL)
        }
    }
}

enum DesktopUpdateInstallError: LocalizedError, Equatable {
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Update installer download failed."
        }
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopUpdateInstallerTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateInstaller.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopUpdateInstallerTests.swift
git commit -m "feat: download and open desktop update installer"
```

---

### Task 3: Wire Settings View Model State

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

**Interfaces:**
- Consumes: `DesktopUpdateChecking.fetchLatestRelease()` and `DesktopUpdateInstaller.install(from:)`.
- Produces: `checkForUpdates()`, `installUpdate()`, `openReleasePage()`, and `UpdateStatus`.

- [ ] **Step 1: Write the failing tests**

Add or keep these state-machine tests:

```swift
@MainActor
func testCheckForUpdatesMarksUpdateAvailableWhenLatestVersionIsNewer() async {
    let defaults = UserDefaults(suiteName: suiteName)!
    let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.4.10")!
    let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.dmg")!
    let viewModel = SettingsViewModel(
        state: DesktopAppState(),
        store: DesktopSettingsStore(userDefaults: defaults),
        updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.4.10", releaseURL: releaseURL, installerURL: installerURL))),
        currentVersionProvider: { "1.4.9" }
    )

    await viewModel.checkForUpdates()

    XCTAssertEqual(viewModel.currentVersion, "1.4.9")
    XCTAssertEqual(viewModel.latestVersion, "1.4.10")
    XCTAssertEqual(viewModel.updateStatus, .updateAvailable)
    XCTAssertEqual(viewModel.releaseURL, releaseURL)
    XCTAssertEqual(viewModel.installerURL, installerURL)
}

@MainActor
func testInstallUpdateUsesInstallerURLWhenAvailable() async {
    let defaults = UserDefaults(suiteName: suiteName)!
    let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.4.10/Skill-Flow-universal.dmg")!
    var installedURL: URL?
    let viewModel = SettingsViewModel(
        state: DesktopAppState(),
        store: DesktopSettingsStore(userDefaults: defaults),
        currentVersionProvider: { "1.4.9" },
        updateInstaller: { url in installedURL = url }
    )

    viewModel.installerURL = installerURL
    await viewModel.installUpdate()

    XCTAssertEqual(installedURL, installerURL)
    XCTAssertEqual(viewModel.updateStatus, .installerOpened)
}

@MainActor
func testInstallUpdateFallsBackToReleasePageWhenInstallerURLIsMissing() async {
    let defaults = UserDefaults(suiteName: suiteName)!
    let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.4.10")!
    var openedURL: URL?
    let viewModel = SettingsViewModel(
        state: DesktopAppState(),
        store: DesktopSettingsStore(userDefaults: defaults),
        currentVersionProvider: { "1.4.9" },
        releaseURLOpener: { openedURL = $0 },
        updateInstaller: { _ in XCTFail("Installer should not run without an installer URL.") }
    )

    viewModel.releaseURL = releaseURL
    await viewModel.installUpdate()

    XCTAssertEqual(openedURL, releaseURL)
}
```

- [ ] **Step 2: Run tests to verify failure or current coverage**

Run:

```bash
swift test --package-path apps/desktop-mac --filter SettingsViewModelTests
```

Expected before implementation if behavior is missing: FAIL on `installerURL`, `.installing`, or `.installerOpened` behavior. If current code already passes, keep the tests as regression coverage.

- [ ] **Step 3: Implement minimal state machine**

Ensure the view model includes these pieces:

```swift
enum UpdateStatus: Equatable {
    case idle
    case checking
    case installing
    case installerOpened
    case upToDate
    case updateAvailable
    case runningNewerBuild
    case failed
}

var releaseURL: URL?
var installerURL: URL?

func checkForUpdates() async {
    updateStatus = .checking
    currentVersion = currentVersionProvider()

    do {
        let release = try await updateChecker.fetchLatestRelease()
        latestVersion = release.version
        releaseURL = release.releaseURL
        installerURL = release.installerURL
        if Self.isVersion(release.version, newerThan: currentVersion) {
            updateStatus = .updateAvailable
        } else if Self.isVersion(currentVersion, newerThan: release.version) {
            updateStatus = .runningNewerBuild
        } else {
            updateStatus = .upToDate
        }
    } catch {
        latestVersion = nil
        releaseURL = nil
        installerURL = nil
        updateStatus = .failed
    }
}

func openReleasePage() {
    releaseURLOpener(releaseURL ?? Self.latestReleasesURL)
}

func installUpdate() async {
    guard let installerURL else {
        openReleasePage()
        return
    }

    updateStatus = .installing
    do {
        try await updateInstaller(installerURL)
        updateStatus = .installerOpened
    } catch {
        updateStatus = .failed
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter SettingsViewModelTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift
git commit -m "feat: wire desktop update state"
```

---

### Task 4: Make Settings Copy Match The Actual Flow

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`

**Interfaces:**
- Consumes: `viewModel.updateStatus`, `viewModel.checkForUpdates()`, `viewModel.installUpdate()`.
- Produces: Settings UI where `Check` checks releases, `Install` downloads/opens DMG, and post-download text tells the user what to do.

- [ ] **Step 1: Write the failing UI text tests**

Add focused tests that assert the update status copy exists. If `SettingsViewTests` already snapshots the full view, add direct localization assertions instead of broad snapshots:

```swift
func testUpdateInstallCopyDescribesManualDMGInstall() {
    let locale = Locale(identifier: "en")

    XCTAssertEqual(
        L10n.string("settings.row.check_updates.description.installing", locale: locale),
        "Downloading and opening the installer..."
    )
    XCTAssertEqual(
        L10n.string("settings.row.check_updates.description.installer_opened", locale: locale),
        "The installer has been opened. Quit Skill Flow, then drag the new app into Applications."
    )
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
swift test --package-path apps/desktop-mac --filter SettingsViewTests
```

Expected before copy update: FAIL if the `installer_opened` string still says only "downloaded and opened" without the manual install instruction.

- [ ] **Step 3: Update Settings row behavior only if missing**

Ensure the row keeps this control behavior:

```swift
settingsRow(title: t("settings.row.check_updates.title"), description: updateStatusDescription) {
    if viewModel.updateStatus == .checking || viewModel.updateStatus == .installing {
        settingsActionLoadingIndicator()
    } else {
        settingsActionButton(updateActionTitle) {
            Task {
                if viewModel.updateStatus == .updateAvailable {
                    await viewModel.installUpdate()
                } else {
                    await viewModel.checkForUpdates()
                }
            }
        }
    }
}
```

Keep the title logic:

```swift
private var updateActionTitle: String {
    viewModel.updateStatus == .updateAvailable
        ? t("settings.action.install_update")
        : t("settings.action.check_updates")
}
```

- [ ] **Step 4: Update localization strings**

Use exact copy:

```text
"settings.row.check_updates.description.installing" = "Downloading and opening the installer...";
"settings.row.check_updates.description.installer_opened" = "The installer has been opened. Quit Skill Flow, then drag the new app into Applications.";
"settings.action.check_updates" = "Check";
"settings.action.install_update" = "Install";
```

Chinese:

```text
"settings.row.check_updates.description.installing" = "正在下载安装包并打开...";
"settings.row.check_updates.description.installer_opened" = "安装包已打开。请退出 Skill Flow，然后将新版应用拖入 Applications。";
"settings.action.check_updates" = "检查";
"settings.action.install_update" = "安装";
```

Japanese:

```text
"settings.row.check_updates.description.installing" = "インストーラをダウンロードして開いています...";
"settings.row.check_updates.description.installer_opened" = "インストーラを開きました。Skill Flow を終了し、新しいアプリを Applications にドラッグしてください。";
"settings.action.check_updates" = "確認";
"settings.action.install_update" = "インストール";
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter SettingsViewTests
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift
git commit -m "feat: clarify desktop update install flow"
```

---

### Task 5: End-To-End Verification

**Files:**
- Verify only unless a test exposes a missing edge:
  - `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift`
  - `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateInstaller.swift`
  - `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
  - `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified semi-automatic DMG update flow.

- [ ] **Step 1: Run focused update tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopUpdateCheckerTests
swift test --package-path apps/desktop-mac --filter DesktopUpdateInstallerTests
swift test --package-path apps/desktop-mac --filter SettingsViewModelTests
swift test --package-path apps/desktop-mac --filter SettingsViewTests
```

Expected: all PASS.

- [ ] **Step 2: Run full desktop test suite**

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected: PASS.

- [ ] **Step 3: Run packaging validation only if release artifacts are touched**

If any release script or bundle layout file changed, run:

```bash
scripts/release/package-desktop-mac.sh --arch arm64 --skip-js-build
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
```

Expected: packaging and validation pass. Skip this step if only Settings/update Swift files and localization changed.

- [ ] **Step 4: Final commit if verification-only fixes were needed**

Only commit if Step 1 or Step 2 required an actual code/test/copy fix:

```bash
git add apps/desktop-mac
git commit -m "test: verify desktop update flow"
```

Expected: no commit if verification did not require changes.

---

## Self-Review

- Spec coverage: The plan covers Settings button triggers, GitHub release lookup, DMG asset selection, download/open, manual install copy, fallback release page, and tests.
- Placeholder scan: No placeholder markers remain.
- Type consistency: `DesktopReleaseInfo`, `DesktopGitHubUpdateChecker`, `DesktopUpdateInstaller.install`, `SettingsViewModel.UpdateStatus`, `checkForUpdates`, `installUpdate`, and `openReleasePage` names match existing code.
- Scope check: This is one coherent desktop update UX plan. CLI/source self-update is explicitly out of scope.
