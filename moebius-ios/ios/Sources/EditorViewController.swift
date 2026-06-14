import UIKit
import WebKit
import UniformTypeIdentifiers

/// Hosts the Moebius web editor in a WKWebView and bridges it to native iOS
/// capabilities (file open/save, dialogs, clipboard, external links).
final class EditorViewController: UIViewController {

    private(set) var webView: WKWebView!
    private let messageHandlerName = "moebius"

    /// Set by SceneDelegate when the app is launched by opening a document.
    var pendingLaunchURL: URL?

    /// Security-scoped URL of the document currently being edited, if any, so we
    /// can save back in place rather than always exporting a copy.
    private var currentDocumentURL: URL?
    private var suggestedFileName = "Untitled.ans"

    /// Height of the soft keyboard currently overlapping the view (used by the
    /// layout pass in EditorViewController+UI.swift).
    var keyboardHeight: CGFloat = 0

    private enum PickerIntent { case open, export }
    private var pickerIntent: PickerIntent = .open

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        setupMenuButton()
        observeKeyboard()
        loadEditor()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // MARK: - WebView

    private func setupWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: messageHandlerName)

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.suppressesIncrementalRendering = false
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.uiDelegate = self
        if #available(iOS 16.4, *) {
            webView.isInspectable = true   // Safari Web Inspector in debug builds
        }
        view.addSubview(webView)
    }

    private func loadEditor() {
        guard let www = Bundle.main.url(forResource: "www", withExtension: nil) else {
            presentFatal("Web bundle not found. Build moebius-ios/web (npm run build) before running.")
            return
        }
        let indexURL = www.appendingPathComponent("index.html")
        guard FileManager.default.fileExists(atPath: indexURL.path) else {
            presentFatal("www/index.html missing. Run npm run build in moebius-ios/web.")
            return
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: www)
    }

    // MARK: - Native -> Web

    /// Calls `window.MoebiusNative.receive(name, payload)` in the page.
    func sendToWeb(_ name: String, _ payload: [String: Any] = [:]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let escapedName = name.replacingOccurrences(of: "'", with: "\\'")
        let js = "window.MoebiusNative && window.MoebiusNative.receive('\(escapedName)', \(json));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    /// The renderer is up and asking what document to show.
    func handleRendererReady() {
        if let url = pendingLaunchURL {
            pendingLaunchURL = nil
            openDocument(at: url)
        } else {
            sendToWeb("new_document", ["columns": 80, "rows": 25])
        }
    }
}

// MARK: - WKScriptMessageHandler (Web -> Native)

extension EditorViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == messageHandlerName,
              let body = message.body as? [String: Any],
              let name = body["name"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch name {
        case "renderer_ready":
            handleRendererReady()
        case "save_file":
            handleSaveFile(payload)
        case "request_open":
            presentOpenPicker()
        case "open_external":
            if let s = payload["url"] as? String, let url = URL(string: s) {
                UIApplication.shared.open(url)
            }
        case "set_title", "set_represented_filename", "set_file":
            if let title = (payload["title"] as? String) ?? (payload["path"] as? String) {
                suggestedFileName = (title as NSString).lastPathComponent
            }
        case "clipboard_write":
            if let text = payload["text"] as? String { UIPasteboard.general.string = text }
        case "ready", "set_document_edited", "set_zoom", "ipc",
             "close_modal", "show_rendering_modal", "show_connecting_modal",
             "set_modal_menu", "set_doc_menu", "update_menu_checkboxes",
             "show_item_in_folder":
            break // not yet surfaced natively (see ROADMAP.md)
        default:
            break
        }
    }
}

// MARK: - Document open / save

extension EditorViewController: UIDocumentPickerDelegate {

    func openDocument(at url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            currentDocumentURL = url
            suggestedFileName = url.lastPathComponent
            sendToWeb("open_file", [
                "path": url.lastPathComponent,
                "base64": data.base64EncodedString(),
            ])
        } catch {
            presentAlert(title: "Couldn't Open", message: error.localizedDescription)
        }
    }

    func presentOpenPicker() {
        let types: [UTType] = [
            UTType("public.plain-text"),
            UTType("art.moebius.ansi"),
            UTType("art.moebius.xbin"),
            UTType.data,
        ].compactMap { $0 }
        pickerIntent = .open
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: true)
    }

    private func handleSaveFile(_ payload: [String: Any]) {
        guard let b64 = payload["base64"] as? String,
              let data = Data(base64Encoded: b64) else { return }
        if let path = payload["path"] as? String, !path.isEmpty {
            suggestedFileName = (path as NSString).lastPathComponent
        }
        // Write to a temp file and let the user place it via the document picker.
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(suggestedFileName)
        do {
            try data.write(to: tmp)
        } catch {
            presentAlert(title: "Couldn't Save", message: error.localizedDescription)
            return
        }
        pickerIntent = .export
        let picker = UIDocumentPickerViewController(forExporting: [tmp], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        switch pickerIntent {
        case .open:
            openDocument(at: url)
        case .export:
            currentDocumentURL = url
        }
    }
}

// MARK: - WKUIDelegate (JS alert/confirm -> native, synchronous to JS)

extension EditorViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}
