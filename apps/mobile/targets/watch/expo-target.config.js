/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch",
  name: "PadelasoWatch",
  displayName: "Padelaso Test",
  bundleIdentifier: ".watch",
  deploymentTarget: "10.0",
  icon: "../../assets/app-icon.png",
  appleTeamId: config.ios.appleTeamId,
  frameworks: ["SwiftUI", "WatchConnectivity", "Security"],
});
