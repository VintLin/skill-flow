// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SkillFlowDesktop",
    defaultLocalization: "en",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "SkillFlowDesktop", targets: ["SkillFlowDesktop"])
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/textual", from: "0.1.0"),
        .package(url: "https://github.com/jpsim/Yams.git", from: "6.0.1")
    ],
    targets: [
        .executableTarget(
            name: "SkillFlowDesktop",
            dependencies: [
                .product(name: "Textual", package: "textual"),
                .product(name: "Yams", package: "Yams"),
            ],
            path: "Sources/DesktopApp",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "SkillFlowDesktopTests",
            dependencies: ["SkillFlowDesktop"],
            path: "Tests"
        )
    ]
)
