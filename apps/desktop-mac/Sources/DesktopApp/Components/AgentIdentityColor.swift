import Foundation
import SwiftUI

struct AgentIdentitySwatch: Equatable {
    let lightRGB: UInt32
    let darkRGB: UInt32

    func hex(for theme: DesktopThemeMode) -> String {
        String(format: "#%06X", rgb(for: theme))
    }

    func color(for theme: DesktopThemeMode) -> Color {
        let value = rgb(for: theme)
        return Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    private func rgb(for theme: DesktopThemeMode) -> UInt32 {
        theme == .dark ? darkRGB : lightRGB
    }
}

enum AgentIdentityColorCatalog {
    private static let swatches: [String: AgentIdentitySwatch] = [
        "claude-code": .init(lightRGB: 0xC96443, darkRGB: 0xE89B7E),
        "codex": .init(lightRGB: 0x2563EB, darkRGB: 0x60A5FA),
        "zcode": .init(lightRGB: 0x0284C7, darkRGB: 0x38BDF8),
        "cursor": .init(lightRGB: 0x14120B, darkRGB: 0xF7F7F4),
        "grok-build": .init(lightRGB: 0x334155, darkRGB: 0xCBD5E1),
        "pi": .init(lightRGB: 0xC2410C, darkRGB: 0xFB923C),
        "workbuddy": .init(lightRGB: 0x07856F, darkRGB: 0x0EC8A9),
        "codebuddy": .init(lightRGB: 0x6C4DFF, darkRGB: 0xA694FF),
        "trae": .init(lightRGB: 0x4F46E5, darkRGB: 0x818CF8),
        "trae-cn": .init(lightRGB: 0x1D4ED8, darkRGB: 0x93C5FD),
        "kimi-code": .init(lightRGB: 0x007CFF, darkRGB: 0x66B5FF),
        "opencode": .init(lightRGB: 0x4B4646, darkRGB: 0xF1ECEC),
        "minimax-code": .init(lightRGB: 0x3977A8, darkRGB: 0x7DC6FF),
        "hermes-agent": .init(lightRGB: 0x0000F2, darkRGB: 0x7B7BFF),
        "openclaw": .init(lightRGB: 0xD14A22, darkRGB: 0xFF7A3D),
        "github-copilot": .init(lightRGB: 0x8534F3, darkRGB: 0xC898FD),
        "gemini-cli": .init(lightRGB: 0x1A73E8, darkRGB: 0x8AB4F8),
        "windsurf": .init(lightRGB: 0x008F83, darkRGB: 0x5EEAD4),
        "amp": .init(lightRGB: 0xC65A18, darkRGB: 0xF6833B),
        "kiro": .init(lightRGB: 0x7E22CE, darkRGB: 0xC084FC),
        "roo-code": .init(lightRGB: 0x0F766E, darkRGB: 0x5EEAD4),
        "cline": .init(lightRGB: 0x0369A1, darkRGB: 0x7DD3FC),
    ]

    static var targetIds: [String] {
        swatches.keys.sorted()
    }

    static func swatch(for targetId: String) -> AgentIdentitySwatch? {
        swatches[targetId.lowercased()]
    }

    static func color(for targetId: String, theme: DesktopThemeMode) -> Color? {
        swatch(for: targetId)?.color(for: theme)
    }
}
