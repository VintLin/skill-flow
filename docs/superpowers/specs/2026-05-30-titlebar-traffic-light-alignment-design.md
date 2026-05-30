# Titlebar Traffic Light Alignment Design

## Goal

Align the native macOS traffic-light window controls with the app's home header controls while keeping the existing home header layout unchanged.

## Current Context

The desktop app uses a hidden title bar with `fullSizeContentView`, transparent titlebar appearance, hidden title text, and no titlebar separator. The home shell extends into the top safe area so the sidebar/header visually occupy the titlebar area. App header controls are laid out by SwiftUI with a 52pt header, 8pt top padding, and 34pt icon buttons.

The native traffic-light buttons remain positioned by AppKit. They sit higher than the app header controls, which makes the titlebar feel visually misaligned even after click handling and safe-area behavior were corrected.

## Chosen Approach

Use AppKit to reposition the native traffic-light buttons through `NSWindow.standardWindowButton(_:)`.

The app header remains the visual baseline. The configurator computes the desired button center from shared constants:

- app header top inset: 8pt
- app header control size: 34pt
- desired center Y: `8 + 34 / 2 = 25pt`

Each native button uses its actual AppKit `frame.height`. The configurator sets the button `frame.origin.y` so the native button center matches the app header control center. It does not hard-code a traffic-light button height.

## Implementation Boundaries

- Modify `apps/desktop-mac/Sources/DesktopApp/App/SkillFlowDesktopApp.swift`.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`.
- Do not change `MainView` header dimensions, spacing, or padding for this alignment task.
- Keep the existing titlebar window configuration:
  - `.fullSizeContentView`
  - `titlebarAppearsTransparent = true`
  - `titleVisibility = .hidden`
  - `titlebarSeparatorStyle = .none`
  - `isMovableByWindowBackground = false`
- The adjustment must be idempotent because SwiftUI can call `updateNSView` multiple times.
- If AppKit does not return one of the standard buttons, skip it without failing window setup.

## Risks

Native traffic-light positioning is AppKit-owned and can vary by macOS version. The safest implementation is a small centralized adjustment after the window is available, with a constant that is easy to tune if visual verification shows a small offset remains.

## Testing

Add a source-level regression test that requires `WindowTitlebarConfigurator` to:

- call `alignTrafficLightButtons(in: window)`
- query `.closeButton`, `.miniaturizeButton`, and `.zoomButton`
- compute position from `titlebarTrafficLightCenterY`
- use each button's actual `frame.height`

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
swift build
```

After implementation, package the app and verify the DMG if packaging is requested.
