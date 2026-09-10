import Foundation

/// Counter taps that couldn't reach the server (watch away from Wi-Fi, subway).
/// Persisted to disk and replayed in order on the next successful contact.
/// Deltas are additive on the server (MAX(0, value + delta)), so a replay
/// after reconnect is exactly what the user meant.
public actor PendingOps {
    public static let shared = PendingOps()

    public struct Op: Codable, Sendable { public let activityKey: String; public let delta: Double; public let at: Date }

    private let url: URL
    private var ops: [Op]

    public init(directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        url = directory.appending(path: "pending-ops.json")
        ops = (try? JSONDecoder().decode([Op].self, from: Data(contentsOf: url))) ?? []
    }

    public var count: Int { ops.count }

    public func enqueue(activityKey: String, delta: Double) {
        ops.append(Op(activityKey: activityKey, delta: delta, at: Date()))
        persist()
    }

    /// Replays everything; stops at the first failure and keeps the rest.
    public func flush(using api: TallyAPI) async -> Int {
        var sent = 0
        while let op = ops.first {
            do {
                _ = try await api.log(.counter(activityKey: op.activityKey, delta: op.delta))
                ops.removeFirst()
                sent += 1
                persist()
            } catch { break }
        }
        return sent
    }

    private func persist() {
        try? JSONEncoder().encode(ops).write(to: url, options: .atomic)
    }
}
