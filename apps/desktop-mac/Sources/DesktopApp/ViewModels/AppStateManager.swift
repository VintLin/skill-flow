import Foundation
import Observation

struct DesktopWarningPresentation: Identifiable, Equatable, Sendable {
    let id: String
    let issueCode: String
    let message: PresentationText
}

@MainActor
@Observable
final class AppStateManager {

    // MARK: - 页面导航状态

    var selectedSection: Section = .overview
    var selectedSourceId: String?
    var sourceIds: [String] = []

    var selectedGroupId: String? {
        selectedSourceId
    }

    // MARK: - UI 可见性状态

    var inspectorVisible: Bool = true
    var compactSidebarVisible: Bool = true
    var showAllTargets: Bool = false

    // MARK: - 加载状态

    var loadState: LoadState = .idle
    var isRefreshing: Bool = false
    var updatingSourceIds: Set<String> = []

    // MARK: - Toast 状态

    var toast: ToastState?

    func showToast(style: ToastStyle, message: String) {
        toast = ToastState(style: style, message: message)
    }

    func showToast(style: ToastStyle, text: PresentationText) {
        toast = ToastState(style: style, text: text)
    }

    func presentToast(style: ToastStyle = .neutral, message: String) {
        showToast(style: style, message: message)
    }

    func dismissToast(id: ToastState.ID? = nil) {
        guard let id else {
            toast = nil
            return
        }
        guard toast?.id == id else {
            return
        }
        toast = nil
    }

    // MARK: - 搜索和过滤状态

    var searchQuery: String = ""
    // MARK: - 部署过滤状态

    var deploymentFilterTarget: String = "All"
    var deploymentFilterKind: String = "All"

    // MARK: - 其他 UI 状态

    var pinnedSourceIds: [String] = []
    var healthStatus: HealthStatus = .unknown
    var latestWarnings: [BridgeIssue] = []
    var latestWarningPresentations: [DesktopWarningPresentation] = []
    var pendingDetailRename: PendingDetailRename?
    var doctorIssues: [DoctorIssueRow] = []
    var lastDoctorError: String?

    // MARK: - 状态转换方法

    func selectSection(_ section: Section) {
        selectedSection = section
    }

    func selectSource(_ sourceId: String?) {
        selectedSourceId = sourceId
    }

    func toggleInspector() {
        inspectorVisible.toggle()
    }

    func toggleCompactSidebar() {
        compactSidebarVisible.toggle()
    }

    func setInspectorVisible(_ visible: Bool) {
        inspectorVisible = visible
    }

    func setCompactSidebarVisible(_ visible: Bool) {
        compactSidebarVisible = visible
    }

    func setSearchQuery(_ query: String) {
        searchQuery = query
    }

    func clearSearch() {
        searchQuery = ""
    }

    func setLoadState(_ state: LoadState) {
        loadState = state
    }

    func startRefreshing() {
        isRefreshing = true
    }

    func stopRefreshing() {
        isRefreshing = false
    }

    func setUpdatingSourceIds(_ ids: Set<String>) {
        updatingSourceIds = ids
    }

    func addUpdatingSourceId(_ id: String) {
        updatingSourceIds.insert(id)
    }

    func addUpdatingSourceIds<S: Sequence>(_ ids: S) where S.Element == String {
        updatingSourceIds.formUnion(ids)
    }

    func removeUpdatingSourceId(_ id: String) {
        updatingSourceIds.remove(id)
    }

    func isUpdatingCurrentGroup() -> Bool {
        guard let selectedSourceId else {
            return false
        }
        return updatingSourceIds.contains(selectedSourceId)
    }

    func setPinnedSourceIds(_ ids: [String]) {
        pinnedSourceIds = ids
    }

    func togglePinnedSourceId(_ id: String) {
        if pinnedSourceIds.contains(id) {
            pinnedSourceIds.removeAll { $0 == id }
        } else {
            pinnedSourceIds.append(id)
        }
    }

    func setHealthStatus(_ status: HealthStatus) {
        healthStatus = status
    }

    func setLatestWarnings(_ warnings: [BridgeIssue]) {
        latestWarnings = warnings
        latestWarningPresentations = warnings.map { warning in
            let presentation = DesktopIssuePresentationCatalog.presentation(forInternalCode: warning.code)
            return DesktopWarningPresentation(
                id: warning.id,
                issueCode: presentation.issueCode,
                message: DesktopIssuePresentationCatalog.toastText(forInternalCode: warning.code, locale: PresentationText.presentationLocale)
            )
        }
    }

    func setDeploymentFilter(target: String, kind: String) {
        deploymentFilterTarget = target
        deploymentFilterKind = kind
    }

    func resetDeploymentFilters() {
        deploymentFilterTarget = "All"
        deploymentFilterKind = "All"
    }

    func setPendingDetailRename(_ rename: PendingDetailRename?) {
        pendingDetailRename = rename
    }

    func setDoctorIssues(_ issues: [DoctorIssueRow]) {
        doctorIssues = issues
    }

    func setLastDoctorError(_ error: String?) {
        lastDoctorError = error
    }

    func resetToDefaults() {
        selectedSection = .overview
        selectedSourceId = nil
        sourceIds = []
        inspectorVisible = true
        compactSidebarVisible = true
        showAllTargets = false
        loadState = .idle
        isRefreshing = false
        updatingSourceIds = []
        toast = nil
        searchQuery = ""
        deploymentFilterTarget = "All"
        deploymentFilterKind = "All"
        pinnedSourceIds = []
        healthStatus = .unknown
        latestWarnings = []
        latestWarningPresentations = []
        pendingDetailRename = nil
        doctorIssues = []
        lastDoctorError = nil
    }
}
