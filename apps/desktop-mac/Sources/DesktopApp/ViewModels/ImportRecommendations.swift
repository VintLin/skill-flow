import Foundation

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
            return try JSONDecoder().decode([ImportRecommendationEntry].self, from: data)
        } catch {
            return []
        }
    }
}
