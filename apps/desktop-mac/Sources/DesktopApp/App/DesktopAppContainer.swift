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
        let resolvedRuntime = runtime ?? DesktopRuntime(dependencies: .live(query: resolvedQueryFacade))

        self.runtime = resolvedRuntime
        self.mainViewModel = MainViewModel(
            bridgeClient: bridgeClient,
            queryFacade: resolvedQueryFacade,
            commandFacade: resolvedCommandFacade
        )
        self.settingsViewModel = SettingsViewModel(state: resolvedRuntime.state)
        self.menuBarScreenState = MenuBarScreenState()
        self.importContainer = ImportScreenContainer(state: resolvedRuntime.state, mainViewModel: mainViewModel)
        self.detailContainer = DetailScreenContainer(
            state: resolvedRuntime.state,
            detailSnapshot: { [weak mainViewModel] sourceId in
                mainViewModel?.detailSnapshot(for: sourceId)
            },
            fallbackRow: { [weak mainViewModel] sourceId in
                mainViewModel?.sourceRows.first(where: { $0.id == sourceId })
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
            setTargetEnabled: { [weak mainViewModel] targetId, enabled, sourceId in
                await mainViewModel?.setTargetEnabled(targetId, enabled: enabled, sourceId: sourceId)
            }
        )
        self.homeContainer = HomeScreenContainer(
            state: resolvedRuntime.state,
            mainViewModel: mainViewModel,
            settingsViewModel: settingsViewModel,
            importContainer: importContainer,
            detailContainer: detailContainer
        )
        self.navigation = RouteNavigation(
            showHome: { [weak state = resolvedRuntime.state] in
                state?.view.currentRoute = .home
            },
            showDetail: { [weak state = resolvedRuntime.state] sourceId in
                state?.view.currentRoute = .detail(sourceId: sourceId)
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
