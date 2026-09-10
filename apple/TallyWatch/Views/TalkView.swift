import SwiftUI
import TallyKit

/// Dictate to the coach. On watchOS a TextField offers the mic + scribble
/// keyboard, so no custom input controller is needed.
struct TalkView: View {
    @Environment(WatchModel.self) private var model
    @State private var text = ""
    @State private var reply: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Say something", text: $text).onSubmit { Task { await send() } }
                Button(busy ? "…" : "Send") { Task { await send() } }.disabled(busy || text.isEmpty).font(TallyFont.display(18))
                if let reply { Text(reply).font(.footnote) }
            }
        }
        .navigationTitle("Tally")
    }

    private func send() async {
        guard !busy else { return }
        busy = true
        do {
            let r = try await TallyAPI.shared.send(text: text, photo: nil, clientMsgId: UUID().uuidString)
            reply = ([r.reply] + r.results).joined(separator: "\n")
            text = ""
            await model.refresh()
        } catch { reply = error.localizedDescription }
        busy = false
    }
}
