import Foundation
import TallyKit
import WatchConnectivity
import WidgetKit

/// Watch side of WatchConnectivity: stores the token the phone pushes and
/// caches the last DayStatus for the complication.
final class WatchSession: NSObject, WCSessionDelegate {
    static let shared = WatchSession()
    private var onCredentials: (() -> Void)?

    func activate(onCredentials: @escaping () -> Void) {
        self.onCredentials = onCredentials
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func apply(_ ctx: [String: Any]) {
        if let token = ctx["token"] as? String { TokenStore.save(Credentials(token: token, deviceId: 0)) }
        if let url = ctx["baseURL"] as? String { UserDefaults.standard.set(url, forKey: "tally.baseURL") }
        if let data = ctx["status"] as? Data, let status = try? JSONDecoder().decode(DayStatus.self, from: data) { SharedStatus.save(status) }
        onCredentials?()
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated, !session.receivedApplicationContext.isEmpty { apply(session.receivedApplicationContext) }
    }
    func session(_ session: WCSession, didReceiveApplicationContext ctx: [String: Any]) { apply(ctx) }
}

/// App Group cache read by the complication's timeline provider.
enum SharedStatus {
    static let defaults = UserDefaults(suiteName: "group.me.torcox.tally")
    static func save(_ status: DayStatus?) {
        guard let status, let data = try? JSONEncoder().encode(status) else { return }
        defaults?.set(data, forKey: "status")
        WidgetCenter.shared.reloadAllTimelines()
    }
    static func load() -> DayStatus? {
        guard let data = defaults?.data(forKey: "status") else { return nil }
        return try? JSONDecoder().decode(DayStatus.self, from: data)
    }
}
