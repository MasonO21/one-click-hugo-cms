import UIKit
import WebKit

/// Hosts the game: a full-screen WKWebView that loads the bundled www/index.html.
/// The web view is locked to that one page; everything native goes through NPBridge.
@MainActor
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private static let backgroundHook: String =
        "window.NPNative&&window.NPNative.onBackground&&window.NPNative.onBackground()"
    private static let foregroundHook: String =
        "window.NPNative&&window.NPNative.onForeground&&window.NPNative.onForeground()"

    private let saveStore: SaveStore = SaveStore()
    private let store: StoreManager = StoreManager()
    private let contentController: WKUserContentController = WKUserContentController()

    private var webView: WKWebView?
    private var safari: SafariOpener?
    private var bridge: NPBridge?

    /// The only URL the web view may show: file:///.../www/index.html inside the app bundle.
    private var gameURL: URL?

    // MARK: - Orientation and chrome

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        // Info.plist already restricts iPhone to portrait; this keeps the two in agreement.
        if UIDevice.current.userInterfaceIdiom == .pad {
            return .all
        }
        return .portrait
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        return true
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.background

        // The www folder reference is copied into the bundle as a directory named "www".
        guard let gameURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            showFailure("The game files are missing from this build.")
            return
        }
        self.gameURL = gameURL

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.suppressesIncrementalRendering = false
        // Audio and video may only start after a tap, which is what the game's audio unlock expects.
        configuration.mediaTypesRequiringUserActionForPlayback = .all

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.backgroundColor = Theme.background
        webView.underPageBackgroundColor = Theme.background
        // The page scrolls inside its own containers, so the outer scroll view stays still.
        webView.scrollView.backgroundColor = Theme.background
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // A rapid-tap game must never zoom. The page also sets user-scalable=no.
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        // Edge to edge; the page positions its UI with env(safe-area-inset-*).
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        let safari = SafariOpener(host: self)
        let bridge = NPBridge(webView: webView, store: store, saveStore: saveStore, safari: safari)
        contentController.addScriptMessageHandler(bridge, contentWorld: .page, name: NPBridge.handlerName)
        bridge.startListening()

        self.webView = webView
        self.safari = safari
        self.bridge = bridge

        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        // The boot script is installed by decidePolicyFor just before this load is allowed.
        webView.loadFileURL(gameURL, allowingReadAccessTo: gameURL.deletingLastPathComponent())
    }

    @objc private func appWillResignActive() {
        webView?.evaluateJavaScript(GameViewController.backgroundHook, completionHandler: nil)
    }

    @objc private func appDidBecomeActive() {
        webView?.evaluateJavaScript(GameViewController.foregroundHook, completionHandler: nil)
    }

    // MARK: - Boot data (native -> JS, before any game script runs)

    /// Replaces the installed boot script with one built from save.json as it is right now.
    /// Returns false if the script could not be built.
    private func refreshBootScript() -> Bool {
        guard let script = makeBootScript() else { return false }
        contentController.removeAllUserScripts()
        contentController.addUserScript(script)
        return true
    }

    /// Builds the user script that defines window.NP_BOOT. Values are encoded with
    /// JSONSerialization and never spliced into JavaScript as raw strings.
    private func makeBootScript() -> WKUserScript? {
        let info: [String: Any] = Bundle.main.infoDictionary ?? [:]
        var boot: [String: Any] = [
            "region": (Locale.current.region?.identifier ?? "").uppercased(),
            "locale": GameViewController.localeTag(),
            "version": (info["CFBundleShortVersionString"] as? String) ?? "",
            "build": (info["CFBundleVersion"] as? String) ?? "",
            "reduceMotion": UIAccessibility.isReduceMotionEnabled,
            "platform": "ios"
        ]
        if let save = saveStore.read() {
            boot["save"] = save
        } else {
            boot["save"] = NSNull()
        }

        guard JSONSerialization.isValidJSONObject(boot),
              let data = try? JSONSerialization.data(withJSONObject: boot, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return WKUserScript(
            source: "window.NP_BOOT = \(json);",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    /// The current locale as a BCP 47 tag, for example "en-US".
    private static func localeTag() -> String {
        let identifier: String = Locale.current.identifier
        // Drop any "@calendar=..." suffix, then turn "en_US" into "en-US".
        let base: String = identifier.split(separator: "@").first.map { String($0) } ?? identifier
        let tag: String = base.replacingOccurrences(of: "_", with: "-")
        return tag.isEmpty ? "en-US" : tag
    }

    // MARK: - Failure screen

    private func showFailure(_ text: String) {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = text
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.font = UIFont.preferredFont(forTextStyle: .body)
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor)
        ])
    }

    // MARK: - WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isGameURL(url) {
            // Every load of the game page gets a boot script built from the current save.json:
            // the first launch, a reload after the web process was killed, and the game's own
            // location.reload() after "wipe". A script built only once at launch would hand a
            // reloaded page the old save, bringing back progress the player just erased.
            guard refreshBootScript() else {
                // Starting without boot data could let the game overwrite a real save with an
                // empty one, so refuse to start instead.
                showFailure("The game could not be started.")
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }
        // Anything else is refused inside the web view. A web link goes to Safari instead.
        if url.scheme?.lowercased() == "https" {
            _ = safari?.open(url.absoluteString)
        }
        decisionHandler(.cancel)
    }

    /// iOS can kill the web content process while the app is in the background to reclaim
    /// memory, leaving a blank page. Load the game again (decidePolicyFor refreshes the boot
    /// script, so the page starts from the latest save.json).
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard let gameURL = gameURL else { return }
        webView.loadFileURL(gameURL, allowingReadAccessTo: gameURL.deletingLastPathComponent())
    }

    /// True for the bundled game page itself; a #fragment or ?query on it does not matter.
    private func isGameURL(_ url: URL) -> Bool {
        guard let gameURL = gameURL, url.isFileURL else { return false }
        return url.standardizedFileURL.path == gameURL.standardizedFileURL.path
    }

    // MARK: - WKUIDelegate

    /// window.open and target=_blank never get a new web view. (An https target has already
    /// been sent to Safari by decidePolicyFor.)
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        return nil
    }
}
