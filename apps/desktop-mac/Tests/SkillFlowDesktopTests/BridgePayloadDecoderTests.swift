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

    func testUsageSnapshotDecodesAgentCoverageScanDetails() {
        let snapshot = BridgePayloadDecoder.usageSnapshot(from: [
            "generatedAt": "2026-08-24T03:00:00.000Z",
            "range": ["preset": "30d", "from": "2026-07-26", "to": "2026-08-24"],
            "kpis": [
                "observedUses": 341,
                "activeSkills": 21,
                "activeAgents": 1,
                "activeProjects": 9,
                "inferredSignals": 0,
                "totalSkills": 57,
                "usedSkills": 21,
                "skillRuns": 341,
                "chatRecords": 341,
            ],
            "topSkills": [[
                "key": "ref:leaf-wayfinder",
                "skillRef": "leaf-wayfinder",
                "skillLabel": "Wayfinder",
                "inventoryStatus": "installed",
                "observedUses": 12,
                "agents": ["codex"],
                "projects": [],
            ]],
            "topAgents": [[
                "agent": "codex",
                "observedUses": 12,
                "activeSkills": 1,
                "activeProjects": 1,
            ]],
            "dailySeries": [["date": "2026-08-24", "observedUses": 12]],
            "timeBuckets": [[
                "key": "2026-08-24",
                "label": "8/24",
                "startAt": "2026-08-24T00:00:00.000Z",
                "endAt": "2026-08-24T23:59:59.999Z",
                "observedUses": 12,
                "bySkill": [["key": "ref:leaf-wayfinder", "skillLabel": "Wayfinder", "observedUses": 12]],
                "byAgent": [["agent": "codex", "observedUses": 12]],
                "bySkillAgent": [["skillKey": "ref:leaf-wayfinder", "agent": "codex", "observedUses": 12]],
            ]],
            "hourlyActivity": [["weekday": 1, "hour": 9, "observedUses": 12]],
            "skillAgentMatrix": [[
                "skillKey": "ref:leaf-wayfinder",
                "skillRef": "leaf-wayfinder",
                "skillLabel": "Wayfinder",
                "agent": "codex",
                "observedUses": 12,
            ]],
            "recentObservations": [],
            "agentCoverage": [[
                "agent": "codex",
                "status": "scanned",
                "sourceKind": "local-session",
                "parserRevision": "codex-session@1",
                "observedUses": 367,
                "inferredSignals": 0,
                "lastScannedAt": "2026-08-24T03:00:00.000Z",
                "coverageFrom": "2026-07-19T14:25:00.240Z",
                "coverageTo": "2026-08-24T02:59:16.545Z",
                "diagnosticsCount": 0,
                "sourcesFound": 2,
                "sourceFilesScanned": 272,
                "sourceBytesScanned": 3970587501,
            ]],
            "truncation": ["chartSkillsTruncated": true, "matrixTruncated": true],
        ])

        XCTAssertEqual(snapshot?.agentCoverage, [UsageAgentCoverageViewData(
            id: "codex",
            agent: "codex",
            status: "scanned",
            sourceKind: "local-session",
            parserRevision: "codex-session@1",
            observedUses: 367,
            inferredSignals: 0,
            lastScannedAt: "2026-08-24T03:00:00.000Z",
            coverageFrom: "2026-07-19T14:25:00.240Z",
            coverageTo: "2026-08-24T02:59:16.545Z",
            diagnosticsCount: 0,
            sourcesFound: 2,
            sourceFilesScanned: 272,
            sourceBytesScanned: 3970587501
        )])
        XCTAssertEqual(snapshot?.kpis.totalSkills, 57)
        XCTAssertEqual(snapshot?.kpis.skillRuns, 341)
        XCTAssertEqual(snapshot?.topAgents.first?.observedUses, 12)
        XCTAssertEqual(snapshot?.dailySeries, [UsageDailyActivityViewData(date: "2026-08-24", observedUses: 12)])
        XCTAssertEqual(snapshot?.timeBuckets.first?.bySkill.first?.observedUses, 12)
        XCTAssertEqual(snapshot?.skillAgentMatrix.first?.skillKey, "ref:leaf-wayfinder")
        XCTAssertEqual(snapshot?.chartSkillsTruncated, true)
        XCTAssertEqual(snapshot?.matrixTruncated, true)

        let skillChart = snapshot?.chartData(for: .skill("ref:leaf-wayfinder"))
        XCTAssertEqual(skillChart?.series.map(\.id), ["codex"])
        XCTAssertEqual(skillChart?.series.first?.values, [12])
        XCTAssertEqual(snapshot?.agentRows(for: "ref:leaf-wayfinder").first?.observedUses, 12)

        let agentChart = snapshot?.chartData(for: .agent("codex"))
        XCTAssertEqual(agentChart?.series.map(\.id), ["ref:leaf-wayfinder"])
        XCTAssertEqual(agentChart?.series.first?.values, [12])
        XCTAssertEqual(snapshot?.skillRows(for: "codex").first?.observedUses, 12)
    }
}
