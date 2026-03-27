import Foundation

enum DesktopLanguage: String, CaseIterable, Identifiable {
    case system
    case zhHans = "zh-Hans"
    case en
    case ja

    static let storageKey = "desktop.language"
    static let fallback = DesktopLanguage.en

    var id: String { rawValue }

    init(storageValue: String) {
        self = DesktopLanguage(rawValue: storageValue) ?? .system
    }

    var localeIdentifier: String {
        switch self {
        case .system:
            return Self.resolveSupportedIdentifier(preferredLanguages: Locale.preferredLanguages)
        case .zhHans:
            return "zh-Hans"
        case .en:
            return "en"
        case .ja:
            return "ja"
        }
    }

    var locale: Locale {
        Locale(identifier: localeIdentifier)
    }

    static func resolveSupportedIdentifier(preferredLanguages: [String]) -> String {
        for identifier in preferredLanguages {
            if let supportedIdentifier = supportedIdentifier(for: identifier) {
                return supportedIdentifier
            }
        }
        return fallback.localeIdentifier
    }

    static func supportedIdentifier(for identifier: String) -> String? {
        let normalized = identifier
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()

        if normalized == "en" || normalized.hasPrefix("en-") {
            return DesktopLanguage.en.rawValue
        }
        if normalized == "ja" || normalized.hasPrefix("ja-") {
            return DesktopLanguage.ja.rawValue
        }
        if normalized == "zh-hans"
            || normalized.hasPrefix("zh-hans-")
            || normalized.hasPrefix("zh-cn")
            || normalized.hasPrefix("zh-sg")
        {
            return DesktopLanguage.zhHans.rawValue
        }
        return nil
    }
}
