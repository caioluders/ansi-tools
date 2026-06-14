import Foundation
import UIKit

/// Decodes `menu_data.json` (the menu faithfully extracted from Moebius's
/// menu.js) so the native shell can offer the full command set as hardware-
/// keyboard shortcuts / an iPad menu, dispatched through the web menu's tested
/// `MoebiusMenu.run()` logic.
struct MenuNode: Decodable {
    let label: String?
    let accelerator: String?
    let type: String?
    let submenu: [MenuNode]?
    let action: MenuAction?
}

struct MenuAction: Decodable {
    let send: String?
    let role: String?
    let emit: String?
    let open: String?

    /// JSON to hand to `window.MoebiusMenu.run(...)` so the renderer dispatch is
    /// identical to a tap in the web menu.
    var jsObject: String {
        if let send = send { return "{\"send\":\(MenuAction.q(send))}" }
        if let role = role { return "{\"role\":\(MenuAction.q(role))}" }
        if let emit = emit { return "{\"emit\":\(MenuAction.q(emit))}" }
        if let open = open { return "{\"open\":\(MenuAction.q(open))}" }
        return "null"
    }

    private static func q(_ s: String) -> String {
        let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }
}

/// A flattened command with a keyboard accelerator.
struct MenuCommand {
    let title: String
    let input: String
    let modifierFlags: UIKeyModifierFlags
    let actionJS: String
}

enum MenuData {
    /// Load and flatten every accelerator-bearing command from the bundled JSON.
    static func loadCommands() -> [MenuCommand] {
        guard let url = Bundle.main.url(forResource: "www", withExtension: nil)?
                .appendingPathComponent("menu_data.json"),
              let data = try? Data(contentsOf: url),
              let tree = try? JSONDecoder().decode([MenuNode].self, from: data) else {
            return []
        }
        var commands: [MenuCommand] = []
        flatten(tree, into: &commands)
        return commands
    }

    private static func flatten(_ nodes: [MenuNode], into commands: inout [MenuCommand]) {
        for node in nodes {
            if let submenu = node.submenu {
                flatten(submenu, into: &commands)
            } else if let accelerator = node.accelerator,
                      let parsed = parse(accelerator),
                      let label = node.label {
                let action = node.action ?? MenuAction(send: nil, role: roleFor(label), emit: nil, open: nil)
                commands.append(MenuCommand(title: label, input: parsed.input,
                                            modifierFlags: parsed.flags, actionJS: action.jsObject))
            }
        }
    }

    // Edit roles (Undo/Redo/Cut/Copy/Paste/Select All) have no `action` in the
    // data (they used Electron roles); recover the channel from the label.
    private static func roleFor(_ label: String) -> String? {
        switch label.lowercased() {
        case "undo": return "undo"
        case "redo": return "redo"
        case "cut": return "cut"
        case "copy": return "copy"
        case "paste": return "paste"
        case "select all": return "selectall"
        default: return nil
        }
    }

    /// Convert an Electron accelerator ("CmdorCtrl+Shift+Z") to a UIKeyCommand
    /// input + modifier flags. Returns nil for accelerators we can't map.
    static func parse(_ accelerator: String) -> (input: String, flags: UIKeyModifierFlags)? {
        var flags: UIKeyModifierFlags = []
        var key: String?
        for raw in accelerator.split(separator: "+") {
            let token = raw.trimmingCharacters(in: .whitespaces)
            switch token {
            case "Cmd", "Command", "CmdorCtrl", "CommandOrControl", "Super", "Meta":
                flags.insert(.command)
            case "Ctrl", "Control":
                flags.insert(.control)
            case "Alt", "Option":
                flags.insert(.alternate)
            case "Shift":
                flags.insert(.shift)
            default:
                key = token
            }
        }
        guard let k = key, let input = inputFor(k) else { return nil }
        return (input, flags)
    }

    private static func inputFor(_ key: String) -> String? {
        switch key {
        case "Up": return UIKeyCommand.inputUpArrow
        case "Down": return UIKeyCommand.inputDownArrow
        case "Left": return UIKeyCommand.inputLeftArrow
        case "Right": return UIKeyCommand.inputRightArrow
        case "Escape", "Esc": return UIKeyCommand.inputEscape
        case "Home": return UIKeyCommand.inputHome
        case "End": return UIKeyCommand.inputEnd
        case "PageUp": return UIKeyCommand.inputPageUp
        case "PageDown": return UIKeyCommand.inputPageDown
        case "Plus": return "+"
        case "Minus": return "-"
        case "Space": return " "
        case "Delete", "Backspace": return "\u{8}"
        case "Tab": return "\t"
        case "Enter", "Return": return "\r"
        default:
            // Single character keys (letters, digits, punctuation like ",").
            return key.count == 1 ? key.lowercased() : nil
        }
    }
}
