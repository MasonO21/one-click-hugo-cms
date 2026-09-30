import UIKit
import Capacitor

/// The app's web view controller: registers the plugins that live in this target (see Main.storyboard).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AgeRangePlugin())
    }
}
