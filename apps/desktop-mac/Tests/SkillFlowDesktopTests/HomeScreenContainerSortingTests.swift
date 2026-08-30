import XCTest
@testable import SkillFlowDesktop

@MainActor
final class HomeScreenContainerSortingTests: XCTestCase {
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

    func testSortKeyProjectionNormalizesEachCardNameOnce() {
        let snapshot = GroupTagController.HomeSnapshot(
            availableTags: [],
            tagCountsByID: [:],
            selectedKey: nil,
            visibleSourceIDs: ["a", "b", "c"],
            tagsBySourceID: [:],
            suggestionsBySourceID: [:],
            tagRankByID: [:],
            visibleSourceIDSet: ["a", "b", "c"]
        )
        let cards = [
            card(id: "a", title: "甲", isPinned: false),
            card(id: "b", title: "乙", isPinned: false),
            card(id: "c", title: "丙", isPinned: false),
        ]
        var normalizationCount = 0

        _ = HomeScreenContainer.makeHomeSortKeys(
            for: cards,
            snapshot: snapshot,
            pinnedSourceIds: [],
            nameKey: { title in
                normalizationCount += 1
                return title
            }
        )

        XCTAssertEqual(normalizationCount, cards.count)
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

}
