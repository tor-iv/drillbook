import SwiftUI
import TallyKit

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var pin = ""
    @State private var busy = false
    @State private var serverURL = TallyAPI.defaultBaseURL.absoluteString

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PageHeader(title: "Tally", subtitle: "Sign the sheet.")
            SecureField("PIN", text: $pin)
                .keyboardType(.numberPad)
                .font(.title2)
                .padding(10)
                .markerBox()
                .onSubmit { Task { await submit() } }
            Button(busy ? "…" : "Open the book") { Task { await submit() } }
                .buttonStyle(InkButton())
                .disabled(busy || pin.isEmpty)
            if let err = session.lastError { Text(err).foregroundStyle(Ink.margin).font(.footnote) }
            #if DEBUG
            DisclosureGroup("Server") {
                TextField("https://…", text: $serverURL)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .font(.footnote)
            }
            .font(.footnote).foregroundStyle(Ink.pencil)
            #endif
            Spacer()
        }
        .pagePadding()
    }

    private func submit() async {
        busy = true
        if let url = URL(string: serverURL) { await TallyAPI.shared.configure(baseURL: url, token: nil) }
        _ = await session.signIn(pin: pin)
        busy = false
    }
}
