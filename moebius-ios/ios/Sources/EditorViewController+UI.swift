import UIKit

extension EditorViewController {

    // MARK: - Layout (keyboard avoidance)

    /// Resize the web view to sit above the soft keyboard so the in-page control
    /// bar and canvas are never hidden behind it.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        var frame = view.bounds
        frame.size.height -= keyboardHeight
        webView.frame = frame
    }

    func observeKeyboard() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(keyboardWillChange(_:)),
                       name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        nc.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                       name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillChange(_ note: Notification) {
        guard let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let overlap = max(0, view.bounds.maxY - view.convert(end, from: nil).minY)
        keyboardHeight = overlap
        animateLayout(with: note)
    }

    @objc private func keyboardWillHide(_ note: Notification) {
        keyboardHeight = 0
        animateLayout(with: note)
    }

    private func animateLayout(with note: Notification) {
        let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        UIView.animate(withDuration: duration) {
            self.view.setNeedsLayout()
            self.view.layoutIfNeeded()
        }
    }

    // MARK: - Native menu

    func setupMenuButton() {
        let button = UIButton(type: .system)
        button.setTitle("≡", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 22, weight: .semibold)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.1, alpha: 0.6)
        button.layer.cornerRadius = 16
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(showMenu(_:)), for: .touchUpInside)
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            button.widthAnchor.constraint(equalToConstant: 36),
            button.heightAnchor.constraint(equalToConstant: 32),
        ])
    }

    @objc private func showMenu(_ sender: UIView) {
        // Open the full data-driven Moebius menu rendered in the web layer, which
        // exposes the complete command set (File/Edit/Selection/Colors/View/
        // Network) and routes Open/Save back through this native shell.
        webView.evaluateJavaScript("window.MoebiusMenu && window.MoebiusMenu.open();", completionHandler: nil)
    }

    // MARK: - Hardware keyboard commands

    override var canBecomeFirstResponder: Bool { true }

    /// All accelerator-bearing Moebius commands, generated from the same
    /// menu_data.json the web menu uses. Each carries its dispatch action as a
    /// property list and is routed through the (tested) web menu logic. Only
    /// modified shortcuts exist here, so plain editing keys still reach the editor.
    override var keyCommands: [UIKeyCommand]? {
        MenuData.loadCommands().map { cmd in
            UIKeyCommand(title: cmd.title,
                         action: #selector(handleMenuKeyCommand(_:)),
                         input: cmd.input,
                         modifierFlags: cmd.modifierFlags,
                         propertyList: cmd.actionJS)
        }
    }

    @objc private func handleMenuKeyCommand(_ sender: UIKeyCommand) {
        guard let json = sender.propertyList as? String else { return }
        webView.evaluateJavaScript("window.MoebiusMenu && window.MoebiusMenu.run(\(json));", completionHandler: nil)
    }

    // MARK: - Alerts

    func presentAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    func presentFatal(_ message: String) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 24, dy: 24))
        label.text = message
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(label)
    }
}
