import UIKit
import SafariServices

/// Opens web pages (legal, support) in SFSafariViewController on top of the game.
/// Only https URLs are accepted; the game itself never navigates away from its bundled page.
@MainActor
final class SafariOpener {

    /// Apple's subscription management page. It is https, so it already passes the general
    /// rule below; the constant exists for the manageSubscriptions fallback.
    static let subscriptionsURLString: String = "https://apps.apple.com/account/subscriptions"

    private static let maxURLLength: Int = 2048

    private weak var host: UIViewController?

    init(host: UIViewController) {
        self.host = host
    }

    /// The window scene the game is shown in, needed by AppStore.showManageSubscriptions.
    var windowScene: UIWindowScene? {
        return host?.view.window?.windowScene
    }

    /// Presents the URL in Safari View Controller. Returns a bridge reply.
    func open(_ urlString: String) -> [String: Any] {
        guard let url = SafariOpener.allowedURL(urlString) else {
            return BridgeReply.failure("only https urls are allowed")
        }
        guard let top = topViewController() else {
            return BridgeReply.failure("nothing to present from")
        }
        if top is SFSafariViewController {
            return BridgeReply.failure("browser already open")
        }
        // SFSafariViewController(url:) raises an exception for non-http(s) URLs, which is why
        // allowedURL() runs first.
        let safari = SFSafariViewController(url: url)
        top.present(safari, animated: true, completion: nil)
        return BridgeReply.ok()
    }

    /// Returns the parsed URL only when it is a well-formed https URL with a host.
    private static func allowedURL(_ string: String) -> URL? {
        guard string.count <= maxURLLength, let url = URL(string: string) else { return nil }
        guard url.scheme?.lowercased() == "https", url.host != nil else { return nil }
        return url
    }

    /// Follows the chain of presented view controllers to the one currently on top.
    private func topViewController() -> UIViewController? {
        var top: UIViewController? = host
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
