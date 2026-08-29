import XCTest
@testable import SkillFlowDesktop

@MainActor
final class HomeScreenContainerSortingTests: XCTestCase {
    func testHomeRenderBuildsGroupCardsOnceAndPassesTheProjectionDownstream() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertEqual(source.components(separatedBy: "viewModel.groupCards").count - 1, 1)
    }

    func testSortsByPinnedFirstThenFirstTagRankThenNameKey() {
        let snapshot = GroupTagController.HomeSnapshot(
            availableTags: [],
            tagCountsByID: [:],
            selectedKey: nil,
            visibleSourceIDs: ["alpha", "beta", "gamma", "delta"],
            tagsBySourceID: [
                "alpha": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "beta": [GroupTagDisplayItem(id: "custom:设计", title: "设计", accent: .pink)],
                "gamma": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "delta": []
            ],
            suggestionsBySourceID: [:],
            tagRankByID: ["custom:设计": 0, "custom:研究": 1],
            visibleSourceIDSet: Set(["alpha", "beta", "gamma", "delta"])
        )
        let cards = [
            card(id: "alpha", title: "Research", isPinned: false),
            card(id: "beta", title: "设计工具", isPinned: false),
            card(id: "gamma", title: "Gamma", isPinned: true),
            card(id: "delta", title: "No Tags", isPinned: false)
        ]

        let sorted = HomeScreenContainer.sortedHomeGroupCards(cards, snapshot: snapshot, pinnedSourceIds: ["gamma"])

        XCTAssertEqual(sorted.map(\.id), ["gamma", "beta", "alpha", "delta"])
    }

    func testSortsChineseNamesByPinyinWhenTagRankMatches() {
        let snapshot = GroupTagController.HomeSnapshot(
            availableTags: [],
            tagCountsByID: [:],
            selectedKey: nil,
            visibleSourceIDs: ["shu", "she", "zi"],
            tagsBySourceID: [
                "shu": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "she": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "zi": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)]
            ],
            suggestionsBySourceID: [:],
            tagRankByID: ["custom:研究": 0],
            visibleSourceIDSet: Set(["shu", "she", "zi"])
        )
        let cards = [
            card(id: "shu", title: "数据助手", isPinned: false),
            card(id: "she", title: "设计工具", isPinned: false),
            card(id: "zi", title: "自动化", isPinned: false)
        ]

        let sorted = HomeScreenContainer.sortedHomeGroupCards(cards, snapshot: snapshot, pinnedSourceIds: [])

        XCTAssertEqual(sorted.map(\.id), ["she", "shu", "zi"])
    }

    private func card(id: String, title: String, isPinned: Bool) -> GroupCardModel {
        GroupCardModel(
            id: id,
            title: title,
            byline: nil,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://example.com/\(id)",
            isPinned: isPinned,
            health: "HEALTHY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: GroupCardStats(
                downloadCount: nil,
                starCount: nil,
                githubURL: nil,
                localPath: nil
            ),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: SaveState(phase: .idle, detail: nil)
        )
    }

    private func sourceText(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
