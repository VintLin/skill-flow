import Foundation

/// Decodes dynamic bridge payloads into the UI-facing value types.
///
/// The bridge protocol intentionally transports arbitrary JSON. Keeping the
/// casts here gives ViewModels one typed interface for each decoded shape.
enum BridgePayloadDecoder {
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
}
