import SwiftUI
import TallyKit

@main
struct TallyApp: App {
    @State private var session = AppSession()

    init() {
        Nudges.register()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                RuledPaper()
                if session.signedIn { RootTabs() } else { LoginView() }
            }
            .environment(session)
            .task { await session.bootstrap() }
        }
    }
}

/// App-wide state: signed-in flag and the cached DayStatus every tab reads.
@Observable @MainActor
final class AppSession {
    var signedIn = TokenStore.load() != nil
    var status: DayStatus?
    var lastError: String?

    func bootstrap() async {
        guard signedIn else { return }
        PhoneSession.shared.activate()
        await refreshStatus()
        _ = await PendingOps.shared.flush(using: .shared)
        await HealthSync.shared.startIfAuthorized()
    }

    func refreshStatus() async {
        do {
            status = try await TallyAPI.shared.status()
            lastError = nil
            PhoneSession.shared.push(status: status)
        } catch APIError.unauthorized {
            await signOut()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signIn(pin: String) async -> Bool {
        do {
            _ = try await TallyAPI.shared.signIn(pin: pin, deviceName: UIDevice.current.name)
            signedIn = true
            await bootstrap()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func signOut() async {
        await TallyAPI.shared.signOut()
        signedIn = false
        status = nil
    }
}
