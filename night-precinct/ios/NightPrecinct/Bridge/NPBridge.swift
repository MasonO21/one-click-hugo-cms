import UIKit
import WebKit
import StoreKit

/// The single native endpoint of the game: `window.webkit.messageHandlers.np.postMessage(...)`.
/// It implements every command in docs/NATIVE_BRIDGE.md by delegating to StoreManager,
/// SaveStore, Haptics and SafariOpener, and it pushes StoreKit transaction updates to the page.
///
/// Every reply is a dictionary with an `ok` Bool. The handler never throws and never
/// returns nil, so a JavaScript promise can only reject if the page sends something odd.
@MainActor
final class NPBridge: NSObject, WKScriptMessageHandlerWithReply {

    /// The name the page uses: window.webkit.messageHandlers.np
    static let handlerName: String = "np"

    /// Upper bound on how many product IDs one `products` call may ask for.
    private static let maxProductIDs: Int = 64

    private weak var webView: WKWebView?
    private let store: StoreManager
    private let saveStore: SaveStore
    private let safari: SafariOpener
    private let haptics: Haptics = Haptics()

    init(webView: WKWebView, store: StoreManager, saveStore: SaveStore, safari: SafariOpener) {
        self.webView = webView
        self.store = store
        self.saveStore = saveStore
        self.safari = safari
        super.init()
    }

    // MARK: - Transaction.updates -> JavaScript

    /// Starts forwarding StoreKit transaction updates to `window.NPNative.onTransaction`.
    /// Call once, as early as possible, so no update is missed.
    func startListening() {
        let store: StoreManager = self.store
        Task {
            await store.startListening { [weak self] transaction in
                Task { @MainActor in
                    self?.deliver(transaction: transaction)
                }
            }
        }
    }

    private func deliver(transaction: [String: Any]) {
        // isValidJSONObject matters: JSONSerialization raises an Objective-C exception (which
        // Swift cannot catch) for invalid input instead of throwing.
        guard let webView = webView,
              JSONSerialization.isValidJSONObject(transaction),
              let data = try? JSONSerialization.data(withJSONObject: transaction, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        // `json` comes from JSONSerialization, so it is a safely escaped JavaScript literal.
        // If the page has not defined NPNative yet this is a harmless no-op; the game also
        // asks for `unfinished` and `entitlements` at launch.
        let script = "window.NPNative&&window.NPNative.onTransaction&&window.NPNative.onTransaction(\(json))"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    // MARK: - WKScriptMessageHandlerWithReply

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        let reply: [String: Any] = await handle(body: message.body)
        return (reply, nil)
    }

    // MARK: - Command dispatch

    private func handle(body: Any) async -> [String: Any] {
        guard let fields = body as? [String: Any], let cmd = fields["cmd"] as? String else {
            return BridgeReply.failure("bad message")
        }

        switch cmd {
        case "products":
            guard let ids = fields["ids"] as? [String], ids.count <= NPBridge.maxProductIDs else {
                return BridgeReply.failure("ids must be an array of strings")
            }
            return await store.loadProducts(ids: ids)

        case "purchase":
            guard let id = fields["id"] as? String else {
                return BridgeReply.failure("id must be a string")
            }
            return await store.purchase(id: id)

        case "finish":
            guard let txId = fields["txId"] as? String else {
                return BridgeReply.failure("txId must be a string")
            }
            return await store.finish(txId: txId)

        case "entitlements":
            return await store.currentEntitlements()

        case "restore":
            return await store.restore()

        case "unfinished":
            return await store.unfinished()

        case "storefront":
            return await store.storefront()

        case "save":
            guard let data = fields["data"] as? String else {
                return BridgeReply.failure("data must be a string")
            }
            return save(data)

        case "wipe":
            return wipe()

        case "openUrl":
            guard let url = fields["url"] as? String else {
                return BridgeReply.failure("url must be a string")
            }
            return safari.open(url)

        case "manageSubscriptions":
            return await manageSubscriptions()

        case "haptic":
            guard let style = fields["style"] as? String else {
                return BridgeReply.failure("style must be a string")
            }
            if haptics.play(style) {
                return BridgeReply.ok()
            }
            return BridgeReply.failure("unknown haptic style")

        default:
            return BridgeReply.failure("unknown")
        }
    }

    // MARK: - Commands that need more than one line

    private func save(_ text: String) -> [String: Any] {
        do {
            try saveStore.write(text)
            return BridgeReply.ok()
        } catch SaveStoreError.tooLarge {
            return BridgeReply.failure("save too large")
        } catch {
            return BridgeReply.failure("save failed")
        }
    }

    private func wipe() -> [String: Any] {
        do {
            try saveStore.delete()
            return BridgeReply.ok()
        } catch {
            return BridgeReply.failure("wipe failed")
        }
    }

    /// Shows Apple's subscription management sheet; if that is unavailable (for example in
    /// the simulator) opens Apple's subscriptions web page instead.
    private func manageSubscriptions() async -> [String: Any] {
        if let scene = safari.windowScene {
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                return BridgeReply.ok()
            } catch {
                // Fall through to the web page.
            }
        }
        return safari.open(SafariOpener.subscriptionsURLString)
    }
}
