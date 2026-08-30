import Foundation

/// Decodes dynamic bridge payloads into the UI-facing value types.
///
/// The bridge protocol intentionally transports arbitrary JSON. Keeping the
/// casts here gives ViewModels one typed interface for each decoded shape.
enum BridgePayloadDecoder {
    static func usageSnapshot(from payload: [String: Any]?) -> UsageSnapshotViewData? {
        guard let payload else { return nil }

        let range = object(payload["range"])
        let kpis = object(payload["kpis"])
        let truncation = object(payload["truncation"])
        let rangePreset = UsageRangePresetViewData(rawValue: string(range["preset"]) ?? "30d") ?? .thirtyDays
        return UsageSnapshotViewData(
            generatedAt: string(payload["generatedAt"]) ?? "",
            rangeLabel: usageRangeLabel(range),
            rangePreset: rangePreset,
            kpis: UsageKpisViewData(
                observedUses: integer(kpis["observedUses"]) ?? 0,
                activeSkills: integer(kpis["activeSkills"]) ?? 0,
                activeAgents: integer(kpis["activeAgents"]) ?? 0,
                activeProjects: integer(kpis["activeProjects"]) ?? 0,
                lastObservedAt: string(kpis["lastObservedAt"]),
                inferredSignals: integer(kpis["inferredSignals"]) ?? 0,
                totalSkills: integer(kpis["totalSkills"]) ?? 0,
                usedSkills: integer(kpis["usedSkills"]) ?? integer(kpis["activeSkills"]) ?? 0,
                skillRuns: integer(kpis["skillRuns"]) ?? integer(kpis["observedUses"]) ?? 0,
                chatRecords: integer(kpis["chatRecords"]) ?? integer(kpis["observedUses"]) ?? 0
            ),
            topSkills: objects(payload["topSkills"]).enumerated().map { index, item in
                let skillKey = string(item["key"]) ?? string(item["skillRef"]) ?? "unmatched-\(index)"
                let projects = objects(item["projects"])
                let agents = strings(item["agents"])
                return UsageTopSkillViewData(
                    id: skillKey,
                    skillLabel: string(item["skillLabel"]) ?? localizedUsageFallback("usage.fallback.unmatched_skill"),
                    observedUses: integer(item["observedUses"]) ?? 0,
                    activeAgentCount: agents.count,
                    activeProjectCount: projects.count,
                    lastObservedAt: string(item["lastObservedAt"]),
                    inventoryStatus: string(item["inventoryStatus"]) ?? "unknown"
                )
            },
            topAgents: objects(payload["topAgents"]).enumerated().map { index, item in
                let agentID = string(item["agent"]) ?? "unknown-\(index)"
                return UsageTopAgentViewData(
                    id: agentID,
                    agent: string(item["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                    observedUses: integer(item["observedUses"]) ?? 0,
                    activeSkills: integer(item["activeSkills"]) ?? 0,
                    activeProjects: integer(item["activeProjects"]) ?? 0,
                    lastObservedAt: string(item["lastObservedAt"])
                )
            },
            dailySeries: objects(payload["dailySeries"]).map { item in
                UsageDailyActivityViewData(
                    date: string(item["date"]) ?? "",
                    observedUses: integer(item["observedUses"]) ?? 0
                )
            }.filter { !$0.date.isEmpty },
            timeBuckets: objects(payload["timeBuckets"]).enumerated().map { index, item in
                let bucketKey = string(item["key"]) ?? "bucket-\(index)"
                return UsageTimeBucketViewData(
                    id: bucketKey,
                    label: string(item["label"]) ?? bucketKey,
                    startAt: string(item["startAt"]) ?? "",
                    endAt: string(item["endAt"]) ?? "",
                    observedUses: integer(item["observedUses"]) ?? 0,
                    bySkill: objects(item["bySkill"]).map { series in
                        UsageSkillSeriesViewData(
                            id: string(series["key"]) ?? "unknown",
                            skillLabel: string(series["skillLabel"]) ?? localizedUsageFallback("usage.fallback.unmatched_skill"),
                            observedUses: integer(series["observedUses"]) ?? 0
                        )
                    },
                    byAgent: objects(item["byAgent"]).map { series in
                        let agentID = string(series["agent"]) ?? "unknown"
                        return UsageAgentSeriesViewData(
                            id: agentID,
                            agent: string(series["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                            observedUses: integer(series["observedUses"]) ?? 0
                        )
                    },
                    bySkillAgent: objects(item["bySkillAgent"]).map { series in
                        UsageSkillAgentSeriesViewData(
                            skillKey: string(series["skillKey"]) ?? "unknown",
                            agent: string(series["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                            observedUses: integer(series["observedUses"]) ?? 0
                        )
                    }
                )
            },
            hourlyActivity: objects(payload["hourlyActivity"]).map { item in
                UsageHourlyActivityViewData(
                    weekday: integer(item["weekday"]) ?? 0,
                    hour: integer(item["hour"]) ?? 0,
                    observedUses: integer(item["observedUses"]) ?? 0
                )
            },
            skillAgentMatrix: objects(payload["skillAgentMatrix"]).map { item in
                UsageSkillAgentMatrixViewData(
                    skillKey: string(item["skillKey"]) ?? "unknown",
                    skillRef: string(item["skillRef"]),
                    skillLabel: string(item["skillLabel"]) ?? localizedUsageFallback("usage.fallback.unmatched_skill"),
                    agent: string(item["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                    observedUses: integer(item["observedUses"]) ?? 0
                )
            },
            recentObservations: objects(payload["recentObservations"]).enumerated().map { index, item in
                UsageRecentObservationViewData(
                    id: "\(string(item["observedAt"]) ?? "\(index)"):\(string(item["agent"]) ?? "unknown"):\(string(item["skillLabel"]) ?? "skill")",
                    observedAt: string(item["observedAt"]) ?? "",
                    agent: string(item["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                    skillLabel: string(item["skillLabel"]) ?? localizedUsageFallback("usage.fallback.unmatched_skill"),
                    projectLabel: string(item["projectLabel"]) ?? localizedUsageFallback("usage.fallback.unknown_project"),
                    evidenceKind: string(item["evidenceKind"]) ?? "unknown",
                    confidence: string(item["confidence"]) ?? "observed"
                )
            },
            agentCoverage: objects(payload["agentCoverage"]).map { item in
                let agentID = string(item["agent"]) ?? "unknown"
                return UsageAgentCoverageViewData(
                    id: agentID,
                    agent: string(item["agent"]) ?? localizedUsageFallback("usage.fallback.unknown_agent"),
                    status: string(item["status"]) ?? "unknown",
                    sourceKind: string(item["sourceKind"]),
                    parserRevision: string(item["parserRevision"]),
                    observedUses: integer(item["observedUses"]) ?? 0,
                    inferredSignals: integer(item["inferredSignals"]) ?? 0,
                    lastScannedAt: string(item["lastScannedAt"]),
                    coverageFrom: string(item["coverageFrom"]),
                    coverageTo: string(item["coverageTo"]),
                    diagnosticsCount: integer(item["diagnosticsCount"]) ?? 0,
                    sourcesFound: integer(item["sourcesFound"]),
                    sourceFilesScanned: integer(item["sourceFilesScanned"]),
                    sourceBytesScanned: integer(item["sourceBytesScanned"])
                )
            },
            chartSkillsTruncated: boolean(truncation["chartSkillsTruncated"]),
            matrixTruncated: boolean(truncation["matrixTruncated"])
        )
    }

    static func sourceSnapshot(from payload: [String: Any]?) -> SourceSnapshotData? {
        guard let payload else { return nil }

        let ownerPayload = object(payload["owner"])
        let owner = SnapshotOwner(
            slug: string(ownerPayload["slug"]) ?? "",
            sourceURL: string(ownerPayload["sourceUrl"]) ?? string(ownerPayload["sourceURL"]) ?? "",
            githubURL: string(ownerPayload["githubUrl"]) ?? string(ownerPayload["githubURL"]),
            sourceCount: integer(ownerPayload["sourceCount"]),
            skillCount: integer(ownerPayload["skillCount"]),
            totalInstalls: integer(ownerPayload["totalInstalls"])
        )

        let trustPayload = object(payload["trust"])
        let trust = SnapshotTrust(
            official: boolean(trustPayload["official"]),
            trending: boolean(trustPayload["trending"]),
            hot: boolean(trustPayload["hot"]),
            audited: boolean(trustPayload["audited"])
        )

        return SourceSnapshotData(
            canonicalRepo: string(payload["canonicalRepo"]) ?? "",
            title: string(payload["title"]) ?? "",
            provider: string(payload["provider"]) ?? "",
            sourceURL: string(payload["sourceUrl"]) ?? string(payload["sourceURL"]) ?? "",
            repoURL: string(payload["repoUrl"]) ?? string(payload["repoURL"]) ?? "",
            repoLabel: string(payload["repoLabel"]) ?? "",
            totalInstalls: integer(payload["totalInstalls"]),
            skillCount: integer(payload["skillCount"]),
            repoStars: integer(payload["repoStars"]),
            forkCount: integer(payload["forkCount"]),
            description: string(payload["description"]) ?? "",
            topics: strings(payload["topics"]),
            language: string(payload["language"]),
            defaultBranch: string(payload["defaultBranch"]),
            pushedAt: string(payload["pushedAt"]),
            owner: owner,
            skills: sourceSkills(from: payload["skills"]),
            trust: trust
        )
    }

    private static func sourceSkills(from value: Any?) -> [SnapshotSkill] {
        objects(value).compactMap { payload in
            guard let skillId = string(payload["skillId"]) else { return nil }

            let installs = object(payload["installs"])
            let auditsPayload = object(payload["audits"])
            return SnapshotSkill(
                skillId: skillId,
                title: string(payload["title"]) ?? "",
                installs: integer(installs["total"]) ?? integer(payload["installs"]),
                weeklyInstalls: integer(installs["weekly"]) ?? integer(payload["weeklyInstalls"]),
                firstSeen: string(payload["firstSeen"]),
                summary: string(payload["summary"]) ?? "",
                installedOn: objects(payload["installedOn"]).compactMap { item in
                    guard let agent = string(item["agent"]) else { return nil }
                    return SnapshotInstalledOn(agent: agent, installs: integer(item["installs"]))
                },
                audits: SnapshotAudits(
                    gen: string(auditsPayload["gen"]),
                    socket: string(auditsPayload["socket"]),
                    snyk: string(auditsPayload["snyk"]),
                    riskLevel: string(auditsPayload["riskLevel"])
                )
            )
        }
    }

    private static func object(_ value: Any?) -> [String: Any] {
        value as? [String: Any] ?? [:]
    }

    private static func objects(_ value: Any?) -> [[String: Any]] {
        value as? [[String: Any]] ?? []
    }

    private static func strings(_ value: Any?) -> [String] {
        value as? [String] ?? []
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : value
    }

    private static func integer(_ value: Any?) -> Int? {
        value as? Int
    }

    private static func boolean(_ value: Any?) -> Bool {
        value as? Bool ?? false
    }

    private static func usageRangeLabel(_ range: [String: Any]) -> String {
        let from = string(range["from"]) ?? localizedUsageFallback("usage.fallback.unknown_range")
        let to = string(range["to"]) ?? localizedUsageFallback("usage.fallback.unknown_range")
        let preset = string(range["preset"])
        if let preset, preset != "custom" {
            return "\(preset) · \(from) → \(to)"
        }
        return "\(from) → \(to)"
    }

    private static func localizedUsageFallback(_ key: String) -> String {
        PresentationText.localized(key).resolve(locale: PresentationText.presentationLocale)
    }
}
