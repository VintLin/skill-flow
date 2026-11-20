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
        "deepseek-harness": .init(lightRGB: 0x3B5BDB, darkRGB: 0x8FA3FF),
        "antigravity": .init(lightRGB: 0x2B59C3, darkRGB: 0x7AA2FF),
        "junie": .init(lightRGB: 0x1E7E34, darkRGB: 0x4ADE80),
        "mistral-vibe": .init(lightRGB: 0xB45309, darkRGB: 0xFBBF24),
        "openhands": .init(lightRGB: 0x9A6700, darkRGB: 0xFACC15),
        "qoder": .init(lightRGB: 0x047857, darkRGB: 0x34D399),
        "qwen-code": .init(lightRGB: 0x5B21B6, darkRGB: 0xA78BFA),
        "zencoder": .init(lightRGB: 0xBE185D, darkRGB: 0xF472B6),
        "kilo-code": .init(lightRGB: 0xB91C1C, darkRGB: 0xF87171),
        "goose": .init(lightRGB: 0x3F3F46, darkRGB: 0xD4D4D8),
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
