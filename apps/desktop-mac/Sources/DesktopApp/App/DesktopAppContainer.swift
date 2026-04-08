import Foundation

@MainActor
final class DesktopAppContainer {
    struct RouteNavigation {
        let showHome: () -> Void
        let showDetail: (String) -> Void
        let showImportPage: () -> Void
        let showSettings: () -> Void
    }

    let runtime: DesktopRuntime
    let mainViewModel: MainViewModel
    let settingsViewModel: SettingsViewModel
    let groupTagController: GroupTagController
    let menuBarScreenState: MenuBarScreenState
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer
    let homeContainer: HomeScreenContainer
    let navigation: RouteNavigation

    init(
        runtime: DesktopRuntime? = nil,
        bridgeClient: BridgeClient = BridgeClient(),
        queryFacade: (any DesktopQuerying)? = nil,
        commandFacade: (any DesktopCommanding)? = nil
    ) {
        let resolvedQueryFacade = queryFacade ?? DesktopBridgeQueryFacade(bridgeClient: bridgeClient)
        let resolvedCommandFacade = commandFacade ?? DesktopBridgeCommandFacade(bridgeClient: bridgeClient)
        let mutationCoordinator = DesktopMutationCoordinator(commandFacade: resolvedCommandFacade)
        let resolvedRuntime = runtime ?? DesktopRuntime(dependencies: .live(query: resolvedQueryFacade))
        let groupTagStore = DesktopGroupTagStore()
        resolvedRuntime.state.groupTags.customTagsBySourceId = groupTagStore.loadCustomTags()

        self.runtime = resolvedRuntime
        self.mainViewModel = MainViewModel(
            bridgeClient: bridgeClient,
            queryFacade: resolvedQueryFacade,
            commandFacade: resolvedCommandFacade,
            mutationCoordinator: mutationCoordinator
        )
        self.settingsViewModel = SettingsViewModel(state: resolvedRuntime.state, commandFacade: resolvedCommandFacade)
        self.groupTagController = GroupTagController(
            state: resolvedRuntime.state,
            store: groupTagStore,
            sourceCanonicalRepo: { [weak mainViewModel] sourceId in
                mainViewModel?.sourceCanonicalRepo(for: sourceId)
            },
            sourceLocator: { [weak mainViewModel] sourceId in
                mainViewModel?.sourceLocator(for: sourceId)
            }
        )
        self.menuBarScreenState = MenuBarScreenState()
        self.importContainer = ImportScreenContainer(state: resolvedRuntime.state, mainViewModel: mainViewModel)
        self.detailContainer = DetailScreenContainer(
            state: resolvedRuntime.state,
            groupTagController: groupTagController,
            detailSnapshot: { [weak mainViewModel] sourceId in
                mainViewModel?.detailSnapshot(for: sourceId)
            },
            groupDocument: { [weak mainViewModel] sourceId, documentId in
                await mainViewModel?.groupDocument(for: sourceId, documentId: documentId)
            },
            fallbackRow: { [weak mainViewModel] sourceId in
                mainViewModel?.sourceRows.first(where: { $0.id == sourceId })
            },
            toastPresenter: { [weak mainViewModel] style, message in
                mainViewModel?.presentToast(style: style, message: message)
            },
            hasInspectPayload: { [weak mainViewModel] sourceId in
                mainViewModel?.hasInspectPayload(for: sourceId) ?? false
            },
            isInspectRequestInFlight: { [weak mainViewModel] sourceId in
                mainViewModel?.isInspectRequestInFlight(for: sourceId) ?? false
            },
            isUpdatingCurrentGroup: { [weak mainViewModel] in
                mainViewModel?.isUpdatingCurrentGroup ?? false
            },
            selectSource: { [weak mainViewModel] sourceId in
                await mainViewModel?.selectSource(sourceId)
            },
            updateCurrentGroup: { [weak mainViewModel] in
                await mainViewModel?.updateCurrentGroup()
            },
            toggleAllSkills: { [weak mainViewModel] sourceId in
                await mainViewModel?.toggleAllSkills(sourceId: sourceId)
            },
            setSkillEnabled: { [weak mainViewModel] skillId, enabled, sourceId in
                await mainViewModel?.setSkillEnabled(skillId, enabled: enabled, sourceId: sourceId)
            },
            toggleAllTargets: { [weak mainViewModel] sourceId in
                await mainViewModel?.toggleAllTargets(sourceId: sourceId)
            },
            setTargetEnabled: { [weak mainViewModel] targetId, enabled, expectedCurrentEnabled, sourceId in
                await mainViewModel?.setTargetEnabled(
                    targetId,
                    enabled: enabled,
                    sourceId: sourceId,
                    expectedCurrentEnabled: expectedCurrentEnabled
                )
            }
        )
        self.homeContainer = HomeScreenContainer(
            state: resolvedRuntime.state,
            mainViewModel: mainViewModel,
            groupTagController: groupTagController,
            settingsViewModel: settingsViewModel,
            importContainer: importContainer,
            detailContainer: detailContainer
        )
        self.navigation = RouteNavigation(
            showHome: { [weak state = resolvedRuntime.state] in
                state?.view.currentRoute = .home
            },
            showDetail: { [weak state = resolvedRuntime.state, weak mainViewModel] sourceId in
                state?.view.currentRoute = .detail(sourceId: sourceId)
                Task { @MainActor in
                    await mainViewModel?.selectSource(sourceId)
                }
            },
            showImportPage: { [weak state = resolvedRuntime.state] in
                state?.view.currentRoute = .importPage
            },
            showSettings: { [weak state = resolvedRuntime.state] in
                state?.view.currentRoute = .settings
            }
        )
    }
}
