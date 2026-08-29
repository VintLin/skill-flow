enum DetailPayloadOverlay {
    static func merge(_ base: [String: Any], with incoming: [String: Any]) -> [String: Any] {
        var merged = base
        for (key, value) in incoming {
            if let baseObject = merged[key] as? [String: Any],
               let incomingObject = value as? [String: Any] {
                merged[key] = merge(baseObject, with: incomingObject)
            } else {
                merged[key] = value
            }
        }
        return merged
    }
}
