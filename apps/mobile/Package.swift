// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "WatchSpikeCore",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "WatchSpikeCore", path: "targets/watch/Shared"),
    .testTarget(name: "WatchSpikeCoreTests", dependencies: ["WatchSpikeCore"], path: "native-tests"),
  ]
)
