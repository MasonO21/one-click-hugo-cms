import Foundation

/// Builders for the dictionaries sent back to JavaScript. Every reply carries an `ok` Bool,
/// and only property-list-safe values (String, NSNumber/Bool/Int, NSNull, arrays and
/// dictionaries of those) may be stored in it, because WebKit rejects anything else.
enum BridgeReply {

    /// A success reply with optional extra fields.
    static func ok(_ fields: [String: Any] = [:]) -> [String: Any] {
        var reply: [String: Any] = fields
        reply["ok"] = true
        return reply
    }

    /// A failure reply with a short machine-friendly message.
    static func failure(_ message: String) -> [String: Any] {
        return ["ok": false, "error": message]
    }

    /// A failure reply built from a thrown error. The text is cut short so nothing large
    /// or unexpected reaches the page.
    static func failure(error: Error) -> [String: Any] {
        return failure(String(error.localizedDescription.prefix(200)))
    }
}
