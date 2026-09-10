import Foundation
import TallyKit
import WatchConnectivity

/// Phone side of WatchConnectivity: hands the watch the device token + server
/// URL (applicationContext survives until replaced, so a watch that was off
/// still gets it later) and the latest DayStatus for a cheap first paint.
final class PhoneSession: NSObject, WCSessionDelegate {
    static let shared = PhoneSession()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func push(status: DayStatus?) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        var ctx: [String: Any] = ["baseURL": TallyAPI.defaultBaseURL.absoluteString]
        if let creds = TokenStore.load() { ctx["token"] = creds.token }
        if let status, let data = try? JSONEncoder().encode(status) { ctx["status"] = data }
        try? WCSession.default.updateApplicationContext(ctx)
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { push(status: nil) }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
