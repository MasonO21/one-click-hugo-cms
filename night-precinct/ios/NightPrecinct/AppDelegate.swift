import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Ambient mixes with music the player is already listening to and follows the
        // silent switch. A failure here only means default audio behavior, so it is ignored.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [])
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // "Default Configuration" is declared in Info.plist (UIApplicationSceneManifest),
        // which names SceneDelegate as the delegate class.
        return UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
    }
}
