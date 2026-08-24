import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopResourceLocatorTests: XCTestCase {
    func testResourceLocatorFindsActionIconsInsideDesktopResourceBundle() throws {
        let directories = DesktopResourceLocator.resourceDirectories(
            subdirectory: "ActionIcons",
            bundle: try desktopResourceBundle(),
            sourceRoot: nil
        )

        XCTAssertFalse(directories.isEmpty)
        XCTAssertTrue(
            directories.contains { directory in
                FileManager.default.fileExists(
                    atPath: directory.appendingPathComponent("back.svg").path
                )
            }
        )
        XCTAssertTrue(
            directories.contains { directory in
                guard let svg = try? String(
                    contentsOf: directory.appendingPathComponent("usage.svg"),
                    encoding: .utf8
                ) else { return false }
                return svg.contains("lucide-chart-spline")
                    && svg.contains("M7 16c.5-2 1.5-7 4-7")
            }
        )
    }

    func testResourceLocatorFindsMenuBarAssetsInsideDesktopResourceBundle() throws {
        let directories = DesktopResourceLocator.resourceDirectories(
            subdirectory: "MenuBar",
            bundle: try desktopResourceBundle(),
            sourceRoot: nil
        )

        XCTAssertFalse(directories.isEmpty)
        XCTAssertTrue(
            directories.contains { directory in
                FileManager.default.fileExists(
                    atPath: directory.appendingPathComponent("menu_icon.svg").path
                )
            }
        )
    }

    private func desktopResourceBundle() throws -> Bundle {
        if let bundle = DesktopResourceLocator.runtimeResourceBundle() {
            return bundle
        }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let debugBuildRoot = packageRoot
            .appendingPathComponent(".build")
            .appendingPathComponent("arm64-apple-macosx")
            .appendingPathComponent("debug")
        let bundleURL = debugBuildRoot.appendingPathComponent("SkillFlowDesktop_SkillFlowDesktop.bundle")

        guard let bundle = Bundle(url: bundleURL) else {
            throw XCTSkip("Desktop resource bundle not available at \(bundleURL.path)")
        }

        return bundle
    }
}
