import Foundation

enum ResourcePhase: Equatable {
    case idle
    case loading
    case ready
    case failed(String)
}

struct AsyncResourceState {
    var homeBootstrapPhase: ResourcePhase = .idle
}
