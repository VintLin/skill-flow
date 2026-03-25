// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SkillFlowDesktop",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "SkillFlowDesktop", targets: ["SkillFlowDesktop"])
    ],
    targets: [
        .executableTarget(
            name: "SkillFlowDesktop",
            path: "Sources/SkillFlowDesktop"
        ),
        .testTarget(
            name: "SkillFlowDesktopTests",
            dependencies: ["SkillFlowDesktop"],
            path: "Tests"
        )
    ]
)
