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
    static func load(bundle: Bundle = .module) -> [ImportRecommendationEntry] {
        guard let url =
            bundle.url(
                forResource: "recommendations",
                withExtension: "json",
                subdirectory: "ImportRecommendations"
            )
            ?? bundle.url(forResource: "recommendations", withExtension: "json")
        else {
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
