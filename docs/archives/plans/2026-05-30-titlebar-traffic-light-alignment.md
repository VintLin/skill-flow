# Titlebar Traffic Light Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align native macOS traffic-light window controls with the app's home header controls without changing the SwiftUI header layout.

**Architecture:** Keep titlebar behavior centralized in `WindowTitlebarConfigurator`. The configurator owns both NSWindow titlebar configuration and traffic-light positioning, using constants that mirror the existing home header top padding and icon button size.

**Tech Stack:** SwiftUI, AppKit `NSWindow`, XCTest source-level regression tests, Swift Package Manager.

---

### Task 1: Add Regression Coverage For Traffic-Light Alignment

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Write the failing test**

Add this test after `testMainWindowUsesFullSizeContentViewForClickableTitlebarControls`:

```swift
func testMainWindowAlignsTrafficLightsWithHomeHeaderControls() throws {
    let source = try sourceText(at: "Sources/DesktopApp/App/SkillFlowDesktopApp.swift")

    XCTAssertTrue(source.contains("private static let titlebarHeaderControlTopPadding: CGFloat = 8"))
    XCTAssertTrue(source.contains("private static let titlebarHeaderControlSize: CGFloat = 34"))
    XCTAssertTrue(source.contains("private static var titlebarTrafficLightCenterY: CGFloat"))
    XCTAssertTrue(source.contains("alignTrafficLightButtons(in: window)"))
    XCTAssertTrue(source.contains("window.standardWindowButton(.closeButton)"))
    XCTAssertTrue(source.contains("window.standardWindowButton(.miniaturizeButton)"))
    XCTAssertTrue(source.contains("window.standardWindowButton(.zoomButton)"))
    XCTAssertTrue(source.contains("Self.titlebarTrafficLightCenterY - (button.frame.height / 2)"))
    XCTAssertTrue(source.contains("button.setFrameOrigin(NSPoint(x: button.frame.origin.x, y: alignedOriginY))"))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testMainWindowAlignsTrafficLightsWithHomeHeaderControls
```

Expected: FAIL because `WindowTitlebarConfigurator` does not yet define the alignment constants or call `alignTrafficLightButtons(in:)`.

- [ ] **Step 3: Commit is not required for red state**

Do not commit the failing test alone. Continue to Task 2.

### Task 2: Implement AppKit Traffic-Light Alignment

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/App/SkillFlowDesktopApp.swift`

- [ ] **Step 1: Add constants and call alignment from window update**

Update `WindowTitlebarConfigurator` to keep the existing titlebar setup and call alignment:

```swift
private struct WindowTitlebarConfigurator: NSViewRepresentable {
    private static let titlebarHeaderControlTopPadding: CGFloat = 8
    private static let titlebarHeaderControlSize: CGFloat = 34

    private static var titlebarTrafficLightCenterY: CGFloat {
        titlebarHeaderControlTopPadding + (titlebarHeaderControlSize / 2)
    }

    func makeNSView(context _: Context) -> NSView {
        NSView(frame: .zero)
    }

    func updateNSView(_ nsView: NSView, context _: Context) {
        DispatchQueue.main.async {
            guard let window = nsView.window else {
                return
            }

            window.styleMask.insert(.fullSizeContentView)
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.titlebarSeparatorStyle = .none
            window.isMovableByWindowBackground = false
            Self.alignTrafficLightButtons(in: window)
        }
    }

    private static func alignTrafficLightButtons(in window: NSWindow) {
        let buttons = [
            window.standardWindowButton(.closeButton),
            window.standardWindowButton(.miniaturizeButton),
            window.standardWindowButton(.zoomButton)
        ]

        for button in buttons.compactMap({ $0 }) {
            let alignedOriginY = Self.titlebarTrafficLightCenterY - (button.frame.height / 2)
            button.setFrameOrigin(NSPoint(x: button.frame.origin.x, y: alignedOriginY))
        }
    }
}
```

- [ ] **Step 2: Run focused test**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testMainWindowAlignsTrafficLightsWithHomeHeaderControls
```

Expected: PASS.

- [ ] **Step 3: Run titlebar-related tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter 'DesktopInteractionRegressionTests/test(MainWindowUsesFullSizeContentViewForClickableTitlebarControls|MainWindowAlignsTrafficLightsWithHomeHeaderControls|HomeHeadersAlignControlsWithNativeTrafficLights)'
```

Expected: 3 tests pass, 0 failures.

### Task 3: Verify Full Desktop Surface

**Files:**
- No source changes.

- [ ] **Step 1: Run desktop regression tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
```

Expected: all `DesktopInteractionRegressionTests` pass.

- [ ] **Step 2: Run Swift build**

Run:

```bash
cd apps/desktop-mac
swift build
```

Expected: build completes with exit code 0.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff -- apps/desktop-mac/Sources/DesktopApp/App/SkillFlowDesktopApp.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
```

Expected: diff only adds traffic-light alignment and regression coverage for it.

### Task 4: Package Dev Build

**Files:**
- No source changes expected.

- [ ] **Step 1: Build dev DMG**

Run:

```bash
scripts/release/package-desktop-mac.sh --arch arm64 --output dist/desktop-mac --dev --skip-js-build
```

Expected output includes:

```text
DMG: dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
Bundled Node.js: v22.22.2
```

- [ ] **Step 2: Verify DMG**

Run:

```bash
hdiutil verify dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

Expected: `hdiutil: verify: checksum of "dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg" is VALID`.

- [ ] **Step 3: Report result**

Report:

```text
/Users/Vint/.codex/worktrees/7df8/01_skill-flow/dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

Also report whether the package was created using the installed-app Node runtime fallback.
