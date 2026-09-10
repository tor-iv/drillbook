import SwiftUI
import TallyKit

struct CoachView: View {
    @State private var notes: CoachNotes?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Coach")
                if let d = notes?.daily { CoachNoteCard(title: "Today · \(d.date)", text: d.content) }
                if let w = notes?.weekly { CoachNoteCard(title: "This week · \(w.date)", text: w.content) }
                if notes == nil { Text("Loading…").foregroundStyle(Ink.pencil) }
            }
            .pagePadding()
        }
        .refreshable { notes = try? await TallyAPI.shared.coach() }
        .task { notes = try? await TallyAPI.shared.coach() }
    }
}

struct CoachNoteCard: View {
    let title: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(TallyFont.display(14)).foregroundStyle(Ink.margin)
            Text(text).font(TallyFont.marker(16)).lineSpacing(3)
        }
        .padding(12).markerBox()
    }
}
