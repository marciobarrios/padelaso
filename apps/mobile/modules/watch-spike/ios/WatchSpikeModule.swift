import ExpoModulesCore
import SwiftUI

public class WatchSpikeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchSpike")
    AsyncFunction("openSetup") { () throws in
      guard let presenter = appContext?.utilities?.currentViewController(),
        presenter.presentedViewController == nil else { throw ProbeError.unavailable }
      presenter.present(UIHostingController(rootView: PhoneProbeSetup()), animated: true)
    }.runOnQueue(.main)
  }
}
