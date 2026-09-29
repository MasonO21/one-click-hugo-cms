import UIKit

@MainActor
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let newWindow = UIWindow(windowScene: windowScene)
        newWindow.backgroundColor = Theme.background
        newWindow.rootViewController = GameViewController()
        newWindow.makeKeyAndVisible()
        window = newWindow
    }
}
