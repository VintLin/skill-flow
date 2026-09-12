import CryptoKit
import Foundation

struct DetailContentFileEntry: Equatable, Sendable {
    let name: String
    let path: String
    let isDirectory: Bool
    let isRegularFile: Bool
}

protocol DetailContentFiles: Sendable {
    func entries(at path: String, includingHidden: Bool) -> [DetailContentFileEntry]?
    func fileInfo(at path: String) -> DetailContentFileEntry?
    func renderCacheKey(for path: String) -> String
}

struct LocalDetailContentFiles: DetailContentFiles {
    func entries(at path: String, includingHidden: Bool) -> [DetailContentFileEntry]? {
        let options: FileManager.DirectoryEnumerationOptions = includingHidden ? [] : [.skipsHiddenFiles]
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: URL(fileURLWithPath: path),
            includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey],
            options: options
        )
        else {
            return nil
        }

        return urls.map { url in
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isRegularFileKey])
            return DetailContentFileEntry(
                name: url.lastPathComponent,
                path: url.path,
                isDirectory: values?.isDirectory ?? false,
                isRegularFile: values?.isRegularFile ?? false
            )
        }
    }

    func fileInfo(at path: String) -> DetailContentFileEntry? {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isRegularFileKey])
        return DetailContentFileEntry(
            name: url.lastPathComponent,
            path: url.path,
            isDirectory: values?.isDirectory ?? false,
            isRegularFile: values?.isRegularFile ?? false
        )
    }

    func renderCacheKey(for path: String) -> String {
        var data = Data(path.utf8)
        if let content = try? Data(contentsOf: URL(fileURLWithPath: path)) {
            data.append(content)
        }
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}

struct DetailContentCatalog: Sendable {
    struct GitHubRepo: Equatable, Sendable {
        let owner: String
        let repo: String
        let revision: String
    }

    struct SkillContext: Equatable, Sendable {
        let id: String
        let linkName: String
        let name: String
        let title: String?
        let description: String
        let skillFilePath: String?
        let absolutePath: String?
        let relativePath: String?
        let projectedName: String?
    }

    struct Context: Equatable, Sendable {
        let sourceId: String
        let groupPath: String?
        let fileTreeTitle: String
        let skills: [SkillContext]
        let gitHubRepo: GitHubRepo?

        init(
            sourceId: String,
            groupPath: String?,
            fileTreeTitle: String,
            skills: [SkillContext],
            gitHubRepo: GitHubRepo?
        ) {
            self.sourceId = sourceId
            self.groupPath = groupPath
            self.fileTreeTitle = fileTreeTitle
            self.skills = skills
            self.gitHubRepo = gitHubRepo
        }
    }

    struct SkillContent: Equatable, Sendable {
        let id: String
        let title: String
        let folderPath: String?
        let relativeFolderPath: String?
        let documents: [DocumentTab]
    }

    struct Snapshot: Equatable, Sendable {
        let sourceId: String
        let groupPath: String?
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentDescriptor]
        let skillsByLeafId: [String: SkillContent]
    }

    private struct SkillReference: Sendable {
        let skillId: String
        let folderPath: String
        let displayTitle: String
    }

    private struct FileTreeNode: Sendable {
        var name: String
        var isFile: Bool
        var children: [String: FileTreeNode]

        init(name: String, isFile: Bool = false, children: [String: FileTreeNode] = [:]) {
            self.name = name
            self.isFile = isFile
            self.children = children
        }
    }

    private let files: any DetailContentFiles

    init(files: any DetailContentFiles = LocalDetailContentFiles()) {
        self.files = files
    }

    func snapshot(for context: Context) -> Snapshot {
        let skillsByLeafId = context.skills.reduce(into: [String: SkillContent]()) { result, skill in
            result[skill.id] = skillContent(for: skill, context: context)
        }
        let fileTree = buildFileTreeItems(
            groupPath: context.groupPath,
            skills: Array(skillsByLeafId.values)
        )
        let groupDocuments = groupDocumentDescriptors(
            groupPath: context.groupPath,
            fileTreeTitle: context.fileTreeTitle,
            gitHubRepo: context.gitHubRepo
        )
        return Snapshot(
            sourceId: context.sourceId,
            groupPath: context.groupPath,
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            skillsByLeafId: skillsByLeafId
        )
    }

    private func skillContent(for skill: SkillContext, context: Context) -> SkillContent {
        let folderPath = skill.absolutePath
            ?? skill.skillFilePath.flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty }
        let documents = skill.skillFilePath.map { path in
            documentPlaceholderTabs(
                for: path,
                groupPath: context.groupPath,
                gitHubRepo: context.gitHubRepo
            )
        } ?? [
            DocumentTab(
                id: "inline-skill-md:\(skill.id)",
                title: "SKILL.md",
                path: "SKILL.md",
                metadata: [],
                content: skill.description,
                renderCacheKey: "inline-skill-md:\(skill.id):\(skill.description.hashValue)",
                externalURL: nil
            )
        ]
        let title = folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
            ?? skill.title?.nonEmpty
            ?? skill.name.nonEmpty
            ?? skill.linkName
        let relativeFolderPath = context.groupPath.flatMap { basePath in
            folderPath.flatMap { Self.relativePath(from: basePath, to: $0) }
        } ?? skill.relativePath

        return SkillContent(
            id: skill.id,
            title: title,
            folderPath: folderPath,
            relativeFolderPath: Self.projectedRelativeFolderPath(
                relativeFolderPath,
                projectedName: skill.projectedName,
                fallbackName: skill.linkName
            ),
            documents: documents
        )
    }

    private func documentPlaceholderTabs(
        for skillFilePath: String,
        groupPath: String?,
        gitHubRepo: GitHubRepo?
    ) -> [DocumentTab] {
        var tabs: [DocumentTab] = [
            placeholderDocumentTab(
                id: skillFilePath,
                title: "SKILL.md",
                path: skillFilePath,
                groupPath: groupPath,
                gitHubRepo: gitHubRepo
            )
        ]

        let folderPath = (skillFilePath as NSString).deletingLastPathComponent
        let referencesPath = (folderPath as NSString).appendingPathComponent("references")
        if let entries = files.entries(at: referencesPath, includingHidden: true) {
            for entry in entries.sorted(by: { $0.name < $1.name }) where entry.name.lowercased().hasSuffix(".md") {
                let fullPath = entry.path
                tabs.append(
                    placeholderDocumentTab(
                        id: fullPath,
                        title: "references/\(entry.name)",
                        path: fullPath,
                        groupPath: groupPath,
                        gitHubRepo: gitHubRepo
                    )
                )
            }
        }

        let agentsPath = (folderPath as NSString).appendingPathComponent("agents")
        if let entries = files.entries(at: agentsPath, includingHidden: true) {
            for entry in entries.sorted(by: { $0.name < $1.name }) {
                let lowercased = entry.name.lowercased()
                guard (lowercased.hasSuffix(".yaml") || lowercased.hasSuffix(".yml")), entry.isRegularFile else {
                    continue
                }
                tabs.append(
                    placeholderDocumentTab(
                        id: entry.path,
                        title: "agents/\(entry.name)",
                        path: entry.path,
                        groupPath: groupPath,
                        gitHubRepo: gitHubRepo
                    )
                )
            }
        }

        return tabs
    }

    private func placeholderDocumentTab(
        id: String,
        title: String,
        path: String,
        groupPath: String?,
        gitHubRepo: GitHubRepo?
    ) -> DocumentTab {
        DocumentTab(
            id: id,
            title: title,
            path: path,
            metadata: [],
            content: "",
            renderCacheKey: files.renderCacheKey(for: path),
            externalURL: gitHubDocumentURL(path: path, groupPath: groupPath, gitHubRepo: gitHubRepo),
            isLoaded: false
        )
    }

    private func groupDocumentDescriptors(
        groupPath: String?,
        fileTreeTitle: String,
        gitHubRepo: GitHubRepo?
    ) -> [DocumentDescriptor] {
        var descriptors: [DocumentDescriptor] = [
            DocumentDescriptor(
                id: "group:filetree",
                title: fileTreeTitle,
                path: groupPath ?? ".",
                metadata: [],
                renderCacheKey: "group:filetree:\(groupPath ?? ".")",
                externalURL: nil
            )
        ]

        guard let groupPath,
              let entries = files.entries(at: groupPath, includingHidden: true)
        else {
            return descriptors
        }

        let markdownFiles = entries
            .filter { $0.name.lowercased().hasSuffix(".md") }
            .sorted { compareRootDocumentNames($0.name, $1.name) }

        for entry in markdownFiles {
            descriptors.append(
                DocumentDescriptor(
                    id: "group:\(entry.path)",
                    title: entry.name,
                    path: entry.path,
                    metadata: [],
                    renderCacheKey: files.renderCacheKey(for: entry.path),
                    externalURL: gitHubDocumentURL(path: entry.path, groupPath: groupPath, gitHubRepo: gitHubRepo)
                )
            )
        }

        return descriptors
    }

    private func buildFileTreeItems(groupPath: String?, skills: [SkillContent]) -> [FileTreeItem] {
        let rootName = groupPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty } ?? "."
        let skillReferences = fileTreeSkillReferences(skills: skills, groupPath: groupPath)

        guard let groupPath else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        let standardizedRootPath = URL(fileURLWithPath: groupPath).standardizedFileURL.path
        let skillReferencesByPath = Dictionary(uniqueKeysWithValues: skillReferences.map { ($0.folderPath, $0) })
        let skillRootPaths = Set(skillReferencesByPath.keys)
        guard files.fileInfo(at: standardizedRootPath)?.isDirectory == true,
              let rootItem = buildFileTreeItem(
                  at: standardizedRootPath,
                  rootDisplayTitle: rootName,
                  skillReferencesByPath: skillReferencesByPath,
                  skillRootPaths: skillRootPaths
              )
        else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        return [rootItem]
    }

    private func fileTreeSkillReferences(
        skills: [SkillContent],
        groupPath: String?
    ) -> [SkillReference] {
        skills.compactMap { skill in
            let displayTitle = skill.relativeFolderPath?
                .split(separator: "/")
                .last
                .map(String.init)
                ?? skill.folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? skill.title.nonEmpty

            guard let displayTitle else {
                return nil
            }

            let folderPath: String?
            if let absoluteFolderPath = skill.folderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: absoluteFolderPath).standardizedFileURL.path
            } else if let groupPath, let relativeFolderPath = skill.relativeFolderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: groupPath)
                    .appendingPathComponent(relativeFolderPath)
                    .standardizedFileURL
                    .path
            } else {
                folderPath = nil
            }

            guard let folderPath else {
                return nil
            }

            return SkillReference(
                skillId: skill.id,
                folderPath: folderPath,
                displayTitle: displayTitle
            )
        }
    }

    private func buildFileTreeItem(
        at path: String,
        rootDisplayTitle: String? = nil,
        skillReferencesByPath: [String: SkillReference],
        skillRootPaths: Set<String>
    ) -> FileTreeItem? {
        let standardizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        let url = URL(fileURLWithPath: standardizedPath)
        let isDirectory = files.fileInfo(at: standardizedPath)?.isDirectory ?? false
        let skillReference = skillReferencesByPath[standardizedPath]
        let title = rootDisplayTitle
            ?? skillReference?.displayTitle
            ?? url.lastPathComponent.nonEmpty
            ?? standardizedPath

        let children: [FileTreeItem]
        if isDirectory,
           let entries = files.entries(at: standardizedPath, includingHidden: false) {
            children = entries
                .compactMap { entry in
                    if entry.isDirectory,
                       !Self.shouldTraverseFileTreeDirectory(
                           at: entry.path,
                           currentSkillRootPath: skillReference?.folderPath,
                           skillRootPaths: skillRootPaths
                       ) {
                        return nil
                    }
                    return buildFileTreeItem(
                        at: entry.path,
                        skillReferencesByPath: skillReferencesByPath,
                        skillRootPaths: skillRootPaths
                    )
                }
                .filter { item in
                    shouldIncludeFileTreeItem(
                        item,
                        parentPath: standardizedPath,
                        currentSkillReference: skillReference,
                        rootPath: rootDisplayTitle == nil ? nil : standardizedPath,
                        skillRootPaths: skillRootPaths
                    )
                }
                .sorted { lhs, rhs in
                    sortFileTreeItems(lhs, rhs, isRootLevel: rootDisplayTitle != nil)
                }
        } else {
            children = []
        }

        let skillDocumentReference = isDirectory
            ? nil
            : skillReferencesByPath.values.first { reference in
                guard let relativePath = Self.relativePath(from: reference.folderPath, to: standardizedPath) else {
                    return false
                }
                let components = relativePath.split(separator: "/").map(String.init)
                if components == ["SKILL.md"] {
                    return true
                }
                guard components.count == 2 else {
                    return false
                }
                let directoryName = components[0].lowercased()
                let fileName = components[1].lowercased()
                if directoryName == "agents" {
                    return fileName.hasSuffix(".yaml") || fileName.hasSuffix(".yml")
                }
                return directoryName == "references" && fileName.hasSuffix(".md")
            }

        return FileTreeItem(
            id: standardizedPath,
            title: title,
            path: standardizedPath,
            isDirectory: isDirectory,
            isSkillRoot: skillReference != nil,
            isSkillDocument: skillDocumentReference != nil,
            skillId: skillReference?.skillId ?? skillDocumentReference?.skillId,
            children: children
        )
    }

    static func shouldTraverseFileTreeDirectory(
        at path: String,
        currentSkillRootPath: String?,
        skillRootPaths: Set<String>
    ) -> Bool {
        if let currentSkillRootPath {
            let relativePath = Self.relativePath(from: currentSkillRootPath, to: path)
            let directoryName = relativePath?.lowercased()
            return directoryName == "agents" || directoryName == "references"
        }
        return Self.containsSkillRootDescendant(path, skillRootPaths: skillRootPaths)
    }

    private func shouldIncludeFileTreeItem(
        _ item: FileTreeItem,
        parentPath: String,
        currentSkillReference: SkillReference?,
        rootPath: String?,
        skillRootPaths: Set<String>
    ) -> Bool {
        let isRootLevel = rootPath == parentPath

        if item.isDirectory {
            if currentSkillReference != nil {
                let directoryName = item.title.lowercased()
                return directoryName == "agents" || directoryName == "references"
            }
            return Self.containsSkillRootDescendant(item.path, skillRootPaths: skillRootPaths)
        }

        if isRootLevel {
            return item.title.lowercased().hasSuffix(".md")
        }

        if currentSkillReference != nil {
            return true
        }

        let parentURL = URL(fileURLWithPath: parentPath)
        let parentDirectoryName = parentURL.lastPathComponent.lowercased()
        let isSupportedDocumentDirectory = parentDirectoryName == "agents"
            || parentDirectoryName == "references"
        let isInsideSkillRoot = skillRootPaths.contains { skillRootPath in
            let rootURL = URL(fileURLWithPath: skillRootPath).standardizedFileURL
            return parentURL.standardizedFileURL.path.hasPrefix(rootURL.path + "/")
        }
        if isInsideSkillRoot && isSupportedDocumentDirectory {
            let lowercasedTitle = item.title.lowercased()
            if parentDirectoryName == "agents" {
                return lowercasedTitle.hasSuffix(".yaml") || lowercasedTitle.hasSuffix(".yml")
            }
            return lowercasedTitle.hasSuffix(".md")
        }

        return false
    }

    private static func containsSkillRootDescendant(
        _ path: String,
        skillRootPaths: Set<String>
    ) -> Bool {
        let normalizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        if skillRootPaths.contains(normalizedPath) {
            return true
        }
        let prefix = normalizedPath.hasSuffix("/") ? normalizedPath : normalizedPath + "/"
        return skillRootPaths.contains(where: { $0.hasPrefix(prefix) })
    }

    private func buildSyntheticFileTreeItems(
        rootName: String,
        skills: [SkillReference]
    ) -> [FileTreeItem] {
        var root = FileTreeNode(name: rootName)

        for skill in skills {
            let components = skill.displayTitle.split(separator: "/").map(String.init)
            insertFileTreePath(components, into: &root)
        }

        return [fileTreeItems(from: root, parentPath: rootName)]
    }

    private func insertFileTreePath(_ components: [String], into node: inout FileTreeNode) {
        guard let head = components.first else {
            return
        }

        var child = node.children[head] ?? FileTreeNode(name: head)
        child.isFile = components.count == 1
        if components.count > 1 {
            insertFileTreePath(Array(components.dropFirst()), into: &child)
        }
        node.children[head] = child
    }

    private func fileTreeItems(from node: FileTreeNode, parentPath: String) -> FileTreeItem {
        let children = node.children.values
            .sorted { lhs, rhs in
                if lhs.isFile != rhs.isFile {
                    return !lhs.isFile && rhs.isFile
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            .map { child in
                fileTreeItems(from: child, parentPath: "\(parentPath)/\(child.name)")
            }
        return FileTreeItem(
            id: parentPath,
            title: node.name,
            path: parentPath,
            isDirectory: !node.isFile,
            isSkillRoot: false,
            isSkillDocument: false,
            skillId: nil,
            children: children
        )
    }

    private func sortFileTreeItems(_ lhs: FileTreeItem, _ rhs: FileTreeItem, isRootLevel: Bool) -> Bool {
        if lhs.isDirectory != rhs.isDirectory {
            return lhs.isDirectory && !rhs.isDirectory
        }
        if isRootLevel, !lhs.isDirectory, !rhs.isDirectory {
            return compareRootDocumentNames(lhs.title, rhs.title)
        }
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
    }

    private func compareRootDocumentNames(_ lhs: String, _ rhs: String) -> Bool {
        let leftRank = rootDocumentRank(lhs)
        let rightRank = rootDocumentRank(rhs)
        if leftRank != rightRank {
            return leftRank < rightRank
        }
        return lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
    }

    private func rootDocumentRank(_ name: String) -> Int {
        let uppercased = name.uppercased()
        if uppercased == "README.MD" {
            return 0
        }
        if uppercased.contains("README") {
            return 1
        }
        if uppercased.contains("CHANGELOG")
            || uppercased.contains("LICENSE")
            || uppercased.contains("PLAN")
            || uppercased.contains("DESIGN")
            || uppercased.contains("RELEASE")
        {
            return 2
        }
        return 3
    }

    static func relativePath(from basePath: String, to targetPath: String) -> String? {
        let baseComponents = URL(fileURLWithPath: basePath).standardizedFileURL.pathComponents
        let targetComponents = URL(fileURLWithPath: targetPath).standardizedFileURL.pathComponents
        guard targetComponents.starts(with: baseComponents) else {
            return nil
        }
        let relativeComponents = targetComponents.dropFirst(baseComponents.count)
        return relativeComponents.isEmpty ? "." : relativeComponents.joined(separator: "/")
    }

    static func projectedRelativeFolderPath(
        _ relativeFolderPath: String?,
        projectedName: String?,
        fallbackName: String
    ) -> String? {
        guard let relativeFolderPath, let projectedName, projectedName != fallbackName else {
            return relativeFolderPath
        }

        let trimmed = relativeFolderPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty, trimmed != "." else {
            return projectedName
        }

        var components = trimmed.split(separator: "/").map(String.init)
        components[components.count - 1] = projectedName
        return components.joined(separator: "/")
    }

    private func gitHubDocumentURL(
        path: String,
        groupPath: String?,
        gitHubRepo: GitHubRepo?
    ) -> String? {
        guard let groupPath,
              let gitHubRepo,
              let relativePath = Self.relativePath(from: groupPath, to: path),
              relativePath != "."
        else {
            return nil
        }

        let normalizedPath = relativePath
            .split(separator: "/")
            .map(String.init)
            .joined(separator: "/")
        return "https://github.com/\(gitHubRepo.owner)/\(gitHubRepo.repo)/blob/\(gitHubRepo.revision)/\(normalizedPath)"
    }
}
