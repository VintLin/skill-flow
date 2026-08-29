import Foundation
import Yams

enum DetailDocumentParser {
    static func parse(_ content: String) -> (metadata: [MetadataEntry], body: String) {
        let lines = content.components(separatedBy: .newlines)
        guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else {
            return ([], content.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        guard let closingIndex = lines.dropFirst().firstIndex(where: {
            $0.trimmingCharacters(in: .whitespacesAndNewlines) == "---"
        }) else {
            return ([], content.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        let frontMatterText = Array(lines[1..<closingIndex]).joined(separator: "\n")
        let bodyLines = closingIndex + 1 < lines.count ? Array(lines[(closingIndex + 1)...]) : []
        return (
            parseFrontmatterEntries(frontMatterText),
            bodyLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    private static func parseFrontmatterEntries(_ frontMatterText: String) -> [MetadataEntry] {
        guard let dictionary = (try? Yams.load(yaml: frontMatterText)) as? [String: Any] else {
            return []
        }
        return dictionary.keys.sorted().compactMap { key in
            guard let value = dictionary[key] else { return nil }
            let renderedValue = stringifyMetadataValue(value)
            return MetadataEntry(id: "\(key):\(renderedValue)", key: key, value: renderedValue)
        }
    }

    private static func stringifyMetadataValue(_ value: Any) -> String {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        case let values as [Any]:
            return values.map(stringifyMetadataValue).joined(separator: ", ")
        case let dictionary as [String: Any]:
            return dictionary.keys.sorted()
                .map { "\($0): \(stringifyMetadataValue(dictionary[$0] as Any))" }
                .joined(separator: ", ")
        default:
            return String(describing: value)
        }
    }
}
