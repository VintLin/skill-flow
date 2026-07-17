import XCTest

@testable import SkillFlowDesktop

final class BridgePayloadDecoderTests: XCTestCase {
    func testSourceSnapshotDecodesBridgeCamelCasePayload() {
        let snapshot = BridgePayloadDecoder.sourceSnapshot(from: [
            "canonicalRepo": "anthropics/skills",
            "title": "Anthropic Skills",
            "provider": "skills.sh",
            "sourceUrl": "https://skills.sh/anthropics/skills",
            "repoUrl": "https://github.com/anthropics/skills",
            "repoLabel": "anthropics/skills",
            "totalInstalls": 120,
            "topics": ["agents", "tools"],
            "owner": [
                "slug": "anthropics",
                "sourceUrl": "https://skills.sh/anthropics",
                "githubUrl": "https://github.com/anthropics",
            ],
            "trust": ["official": true, "trending": true],
            "skills": [[
                "skillId": "review",
                "title": "Review",
                "installs": ["total": 80, "weekly": 12],
                "installedOn": [["agent": "codex", "installs": 7]],
                "audits": ["riskLevel": "low"],
            ]],
        ])

        XCTAssertEqual(snapshot?.canonicalRepo, "anthropics/skills")
        XCTAssertEqual(snapshot?.sourceURL, "https://skills.sh/anthropics/skills")
        XCTAssertEqual(snapshot?.repoURL, "https://github.com/anthropics/skills")
        XCTAssertEqual(snapshot?.owner, SnapshotOwner(
            slug: "anthropics",
            sourceURL: "https://skills.sh/anthropics",
            githubURL: "https://github.com/anthropics",
            sourceCount: nil,
            skillCount: nil,
            totalInstalls: nil
        ))
        XCTAssertEqual(snapshot?.trust?.labels, ["Official", "Trending"])
        XCTAssertEqual(snapshot?.skills, [SnapshotSkill(
            skillId: "review",
            title: "Review",
            installs: 80,
            weeklyInstalls: 12,
            firstSeen: nil,
            summary: "",
            installedOn: [SnapshotInstalledOn(agent: "codex", installs: 7)],
            audits: SnapshotAudits(gen: nil, socket: nil, snyk: nil, riskLevel: "low")
        )])
    }

    func testSourceSnapshotAcceptsLegacyURLKeysAndSkipsMalformedSkills() {
        let snapshot = BridgePayloadDecoder.sourceSnapshot(from: [
            "sourceURL": "https://legacy.example/source",
            "repoURL": "https://legacy.example/repo",
            "owner": ["sourceURL": "https://legacy.example/owner"],
            "skills": [["title": "Missing identifier"], ["skillId": "valid"]],
        ])

        XCTAssertEqual(snapshot?.sourceURL, "https://legacy.example/source")
        XCTAssertEqual(snapshot?.repoURL, "https://legacy.example/repo")
        XCTAssertEqual(snapshot?.owner.sourceURL, "https://legacy.example/owner")
        XCTAssertEqual(snapshot?.skills.map(\.skillId), ["valid"])
    }

    func testSourceSnapshotReturnsNilForAbsentPayload() {
        XCTAssertNil(BridgePayloadDecoder.sourceSnapshot(from: nil))
    }
}
