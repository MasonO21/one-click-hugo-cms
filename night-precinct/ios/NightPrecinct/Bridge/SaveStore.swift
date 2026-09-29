import Foundation

enum SaveStoreError: Error {
    case tooLarge
    case unavailable
}

/// Mirrors the game save to Application Support/save.json.
///
/// The file is deliberately NOT excluded from backup, so it travels with iCloud and computer
/// backups (FACTS.md section 2). Nothing here reads file attributes or timestamps.
final class SaveStore {

    /// Largest accepted payload, in UTF-8 bytes.
    static let maxBytes: Int = 2 * 1024 * 1024

    private static let fileName: String = "save.json"

    /// The saved text, or nil when there is no save (or it cannot be read).
    func read() -> String? {
        guard let url = try? SaveStore.fileURL() else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard let text = String(data: data, encoding: .utf8), !text.isEmpty else { return nil }
        return text
    }

    /// Atomically replaces save.json (temp file plus rename), so a crash mid-write can never
    /// leave a half-written save behind.
    func write(_ text: String) throws {
        guard text.utf8.count <= SaveStore.maxBytes else { throw SaveStoreError.tooLarge }
        let url: URL = try SaveStore.fileURL()
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: nil
        )
        try Data(text.utf8).write(to: url, options: [.atomic])
    }

    /// Deletes save.json. A missing file counts as success.
    func delete() throws {
        let url: URL = try SaveStore.fileURL()
        do {
            try FileManager.default.removeItem(at: url)
        } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
            return
        }
    }

    private static func fileURL() throws -> URL {
        let bases: [URL] = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        guard let base = bases.first else { throw SaveStoreError.unavailable }
        return base.appendingPathComponent(fileName, isDirectory: false)
    }
}
