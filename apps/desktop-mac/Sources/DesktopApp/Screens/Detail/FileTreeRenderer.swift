enum FileTreeRenderer {
    static func render(_ items: [FileTreeItem]) -> String {
        var lines: [String] = []
        for (index, item) in items.enumerated() {
            lines.append(item.title)
            append(
                item.children,
                ancestry: [index == items.count - 1],
                to: &lines
            )
        }
        return lines.joined(separator: "\n")
    }

    private static func append(
        _ items: [FileTreeItem],
        ancestry: [Bool],
        to lines: inout [String]
    ) {
        for (index, item) in items.enumerated() {
            let isLast = index == items.count - 1
            let indentation = ancestry.dropLast().map { $0 ? "    " : "|   " }.joined()
            lines.append(indentation + (isLast ? "`-- " : "|-- ") + item.title)
            append(item.children, ancestry: ancestry + [isLast], to: &lines)
        }
    }
}
