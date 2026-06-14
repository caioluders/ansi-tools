import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var editor: EditorViewController?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let editor = EditorViewController()
        self.editor = editor
        window.rootViewController = editor
        self.window = window
        window.makeKeyAndVisible()

        // If the app was launched by opening a document, hand it to the editor.
        if let url = connectionOptions.urlContexts.first?.url {
            editor.pendingLaunchURL = url
        }
    }

    // Opening a document while the app is already running (Files / share-to).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        editor?.openDocument(at: url)
    }
}
