// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "AgentExtensionAuditor",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "AgentExtensionAuditor",
            targets: ["AgentExtensionAuditor"]
        )
    ],
    targets: [
        .executableTarget(
            name: "AgentExtensionAuditor"
        ),
        .testTarget(
            name: "AgentExtensionAuditorTests",
            dependencies: ["AgentExtensionAuditor"]
        )
    ],
    swiftLanguageModes: [.v5]
)
