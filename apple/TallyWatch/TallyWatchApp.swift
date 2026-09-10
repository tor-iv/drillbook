import SwiftUI
import TallyKit

@main
struct TallyWatchApp: App {
    @State private var model = WatchModel()
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                if model.signedIn { WatchTodayView() } else {
                    VStack(spacing: 8) {
                        Text("Tally").font(TallyFont.display(28))
                        Text("Open Tally on your iPhone once to pair.").font(.footnote).foregroundStyle(Ink.pencil).multilineTextAlignment(.center)
                    }
                }
            }
            .environment(model)
            .task { await model.bootstrap() }
        }
    }
}

@Observable @MainActor
final class WatchModel {
    var signedIn = TokenStore.load() != nil
    var status: DayStatus? = SharedStatus.load()
    var error: String?

    func bootstrap() async {
        WatchSession.shared.activate { [weak self] in Task { @MainActor in await self?.onCredentials() } }
        if signedIn { await refresh() }
    }

    func onCredentials() async {
        signedIn = TokenStore.load() != nil
        await TallyAPI.shared.configure(baseURL: TallyAPI.defaultBaseURL, token: TokenStore.load()?.token)
        await refresh()
    }

    func refresh() async {
        _ = await PendingOps.shared.flush(using: .shared)
        do {
            status = try await TallyAPI.shared.status()
            error = nil
            SharedStatus.save(status)
        } catch { self.error = error.localizedDescription }
    }
}
