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
    dependencies: [
        .package(url: "https://github.com/Lakr233/MarkdownView", from: "3.6.0")
    ],
    targets: [
        .executableTarget(
            name: "SkillFlowDesktop",
            dependencies: [
                "MarkdownView",
            ],
            path: "Sources/SkillFlowDesktop",
            resources: [
                .copy("Resources")
            ]
        ),
        .testTarget(
            name: "SkillFlowDesktopTests",
            dependencies: ["SkillFlowDesktop"],
            path: "Tests"
        )
    ]
)
