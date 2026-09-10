import SwiftUI
import TallyKit

struct SettingsView: View {
    @Environment(AppSession.self) private var session
    @State private var healthNote = HealthSync.shared.statusLine
    @State private var syncing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Setup")
                VStack(alignment: .leading, spacing: 8) {
                    Text("Apple Health").font(TallyFont.display(20))
                    Text(healthNote).font(.footnote).foregroundStyle(Ink.pencil)
                    HStack {
                        Button("Allow") { Task { await HealthSync.shared.requestAuthorization(); healthNote = HealthSync.shared.statusLine } }.buttonStyle(PaperButton())
                        Button(syncing ? "…" : "Sync now") { Task { syncing = true; healthNote = await HealthSync.shared.syncNow(); syncing = false } }.buttonStyle(InkButton()).disabled(syncing)
                    }
                }
                .padding(12).markerBox()
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nudges").font(TallyFont.display(20))
                    Text("Tally checks in at 7:30, 1:00 and 8:00. iOS decides when background refresh actually runs; the fixed reminders are the fallback.").font(.footnote).foregroundStyle(Ink.pencil)
                    Button("Enable notifications") { Task { await Nudges.requestPermissionAndSchedule() } }.buttonStyle(PaperButton())
                }
                .padding(12).markerBox()
                VStack(alignment: .leading, spacing: 8) {
                    Text("Server").font(TallyFont.display(20))
                    Text(TallyAPI.defaultBaseURL.absoluteString).font(.footnote).foregroundStyle(Ink.pencil)
                    Button("Sign out") { Task { await session.signOut() } }.buttonStyle(PaperButton())
                }
                .padding(12).markerBox()
            }
            .pagePadding()
        }
    }
}
