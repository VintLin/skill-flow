import Foundation

struct DesktopGroupTagStore {
    static let tagCollectionKey = DesktopWorkspaceMemoryStore.tagCollectionKey

    let workspaceMemory: DesktopWorkspaceMemoryStore

    /// - Parameters:
    ///   - userDefaults: When using the production default (`.standard`), tags go to the shared suite.
    ///     Injected suites are used as-is for test isolation (no multi-domain migration).
    ///   - workspaceMemory: Explicit shared-suite store; overrides `userDefaults` when provided.
    init(
        userDefaults: UserDefaults = .standard,
        workspaceMemory: DesktopWorkspaceMemoryStore? = nil
    ) {
        if let workspaceMemory {
            self.workspaceMemory = workspaceMemory
        } else if userDefaults === UserDefaults.standard {
            self.workspaceMemory = .makeShared()
        } else {
            self.workspaceMemory = DesktopWorkspaceMemoryStore(
                userDefaults: userDefaults,
                legacyDomainNames: []
            )
        }
    }

    var userDefaults: UserDefaults {
        workspaceMemory.userDefaults
    }

    func loadTagCollection() -> GroupTagCollection {
        workspaceMemory.loadTagCollection()
    }

    func saveTagCollection(_ tagCollection: GroupTagCollection) {
        workspaceMemory.saveTagCollection(tagCollection)
    }
}
