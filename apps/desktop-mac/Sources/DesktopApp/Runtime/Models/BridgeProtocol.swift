import Foundation

enum BridgeCommand: String, Codable, Sendable {
    case bootstrap
    case list
    case inspect
    case inspectEnrichment = "inspect-enrichment"
    case searchImportGroups = "search-import-groups"
    case previewImportSource = "preview-import-source"
    case importSource = "import-source"
    case togglePin = "toggle-pin"
    case doctor
    case add
    case apply
    case update
    case uninstall
    case saveSettings = "save-settings"
}

struct BridgeRequest: Codable, Sendable {
    let protocolVersion: String
    let requestId: String
    let command: BridgeCommand
    let payload: [String: AnyCodable]?

    init(command: BridgeCommand, requestId: String = UUID().uuidString, payload: [String: AnyCodable]? = nil) {
        self.protocolVersion = "1.0"
        self.requestId = requestId
        self.command = command
        self.payload = payload
    }
}

struct BridgeIssue: Codable, Identifiable, Sendable {
    var id: String { "\(code):\(message)" }
    let code: String
    let message: String
}

struct BridgeResponse: Codable, Sendable {
    let protocolVersion: String
    let requestId: String?
    let command: BridgeCommand
    let ok: Bool
    let data: AnyCodable?
    let warnings: [BridgeIssue]
    let errors: [BridgeIssue]
}

enum ProjectScopeSelection: Hashable, Codable, Sendable {
    case global
    case project(String)

    enum CodingKeys: String, CodingKey {
        case kind
        case projectId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)

        switch kind {
        case "project":
            self = .project(try container.decode(String.self, forKey: .projectId))
        default:
            self = .global
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .global:
            try container.encode("global", forKey: .kind)
        case .project(let projectId):
            try container.encode("project", forKey: .kind)
            try container.encode(projectId, forKey: .projectId)
        }
    }

    var bridgePayload: [String: Any] {
        switch self {
        case .global:
            return ["kind": "global"]
        case .project(let projectId):
            return ["kind": "project", "projectId": projectId]
        }
    }
}

struct AnyCodable: Codable, @unchecked Sendable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let arrayValue = try? container.decode([AnyCodable].self) {
            value = arrayValue.map(\.value)
        } else if let dictValue = try? container.decode([String: AnyCodable].self) {
            value = dictValue.mapValues(\.value)
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intValue as Int:
            try container.encode(intValue)
        case let doubleValue as Double:
            try container.encode(doubleValue)
        case let boolValue as Bool:
            try container.encode(boolValue)
        case let stringValue as String:
            try container.encode(stringValue)
        case let arrayValue as [Any]:
            try container.encode(arrayValue.map(AnyCodable.init))
        case let dictValue as [String: Any]:
            try container.encode(dictValue.mapValues(AnyCodable.init))
        default:
            try container.encodeNil()
        }
    }
}
