import Foundation

enum L10n {
    private static let table = "Localizable"

    static func string(_ key: String, locale: Locale? = nil, arguments: [CVarArg] = []) -> String {
        let localizedFormat = localizedBundle(for: locale).localizedString(forKey: key, value: key, table: table)
        let format = localizedFormat == key
            ? fallbackBundle.localizedString(forKey: key, value: key, table: table)
            : localizedFormat
        guard !arguments.isEmpty else {
            return format
        }
        return String(format: format, locale: locale ?? Locale(identifier: DesktopLanguage.fallback.localeIdentifier), arguments: arguments)
    }

    private static func localizedBundle(for locale: Locale?) -> Bundle {
        guard
            let locale,
            let identifier = DesktopLanguage.supportedIdentifier(for: locale.identifier),
            let bundle = bundle(forLocalizationIdentifier: identifier)
        else {
            return resourceBundle
        }
        return bundle
    }

    private static var fallbackBundle: Bundle {
        bundle(forLocalizationIdentifier: DesktopLanguage.fallback.localeIdentifier) ?? resourceBundle
    }

    private static func bundle(forLocalizationIdentifier identifier: String) -> Bundle? {
        let candidates = [identifier, identifier.lowercased()]
        for candidate in candidates {
            guard let path = resourceBundle.path(forResource: candidate, ofType: "lproj") else {
                continue
            }
            if let bundle = Bundle(path: path) {
                return bundle
            }
        }
        return nil
    }

    private static var resourceBundle: Bundle {
        DesktopResourceLocator.runtimeResourceBundle() ?? Bundle.main
    }
}
