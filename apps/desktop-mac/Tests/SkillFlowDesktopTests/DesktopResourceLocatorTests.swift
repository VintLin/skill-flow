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

        XCTAssertEqual(directories.count, 1)
        let directory = try XCTUnwrap(directories.first)
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: directory.appendingPathComponent("back.svg").path
            )
        )
    }

    func testResourceLocatorFindsMenuBarAssetsInsideDesktopResourceBundle() throws {
        let directories = DesktopResourceLocator.resourceDirectories(
            subdirectory: "MenuBar",
            bundle: try desktopResourceBundle(),
            sourceRoot: nil
        )

        XCTAssertEqual(directories.count, 1)
        let directory = try XCTUnwrap(directories.first)
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: directory.appendingPathComponent("menu_icon.svg").path
            )
        )
    }

    private func desktopResourceBundle() throws -> Bundle {
        let testsBundleURL = Bundle(for: Self.self).bundleURL
        let bundleURL = testsBundleURL
            .deletingLastPathComponent()
            .appendingPathComponent("SkillFlowDesktop_SkillFlowDesktop.bundle")

        guard let bundle = Bundle(url: bundleURL) else {
            throw XCTSkip("Desktop resource bundle not available at \(bundleURL.path)")
        }

        return bundle
    }
}
