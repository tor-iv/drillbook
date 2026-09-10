// swift-tools-version: 5.10
import PackageDescription

// Everything the phone, the watch, and the complication share: the API
// client, the wire models, the Keychain token, the offline tap queue, and the
// notebook theme. Keeping it a package means it compiles once and the app
// targets stay thin.
let package = Package(
    name: "TallyKit",
    platforms: [.iOS(.v17), .watchOS(.v10)],
    products: [.library(name: "TallyKit", targets: ["TallyKit"])],
    targets: [
        .target(name: "TallyKit", resources: [.process("Resources")]),
        .testTarget(name: "TallyKitTests", dependencies: ["TallyKit"]),
    ]
)
