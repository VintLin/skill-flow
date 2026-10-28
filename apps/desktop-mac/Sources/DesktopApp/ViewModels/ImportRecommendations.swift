import Foundation

private struct BuiltinSourceRecommendation: Codable, Equatable, Sendable {
    let categoryId: String
    let primaryTagId: String
    let secondaryTagIds: [String]
    let descriptionKey: String
    let sortOrder: Int
}

private struct BuiltinSourceRecord: Codable, Equatable, Sendable {
    let canonicalRepo: String
    let locator: String
    let branch: String
    let path: String?
    let recommendation: BuiltinSourceRecommendation?
}

struct ImportRecommendationEntry: Codable, Equatable, Sendable {
    let canonicalRepo: String
    let locator: String
    let categoryId: String
    let primaryTagId: String
    let secondaryTagIds: [String]
    let descriptionKey: String
    let sortOrder: Int
}

enum ImportRecommendationLoader {
    static func load(bundle: Bundle? = nil) -> [ImportRecommendationEntry] {
        let bundleCandidates = [
            bundle,
            DesktopResourceLocator.runtimeResourceBundle(),
            Bundle.main,
        ].compactMap { $0 }

        let url = bundleCandidates.lazy.compactMap { candidateBundle in
            candidateBundle.url(
                forResource: "recommendations",
                withExtension: "json",
                subdirectory: "ImportRecommendations"
            ) ?? candidateBundle.url(forResource: "recommendations", withExtension: "json")
        }.first

        guard let url else {
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let sources = try JSONDecoder().decode([BuiltinSourceRecord].self, from: data)
            return sources.compactMap { source in
                guard let recommendation = source.recommendation else {
                    return nil
                }
                return ImportRecommendationEntry(
                    canonicalRepo: source.canonicalRepo,
                    locator: source.locator,
                    categoryId: recommendation.categoryId,
                    primaryTagId: recommendation.primaryTagId,
                    secondaryTagIds: recommendation.secondaryTagIds,
                    descriptionKey: recommendation.descriptionKey,
                    sortOrder: recommendation.sortOrder
                )
            }
        } catch {
            return []
        }
    }
}
