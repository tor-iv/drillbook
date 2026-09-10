import PhotosUI
import SwiftUI
import TallyKit

struct ChatView: View {
    @Environment(AppSession.self) private var session
    @State private var messages: [ChatMessage] = []
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?
    @State private var pickerItem: PhotosPickerItem?
    @State private var photo: Data?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        PageHeader(title: "Chat", subtitle: "Log, ask, schedule. Same coach as Telegram.").padding(.bottom, 8)
                        ForEach(messages) { m in Bubble(message: m).id(m.id) }
                        if busy { Text("…").font(TallyFont.marker(20)).foregroundStyle(Ink.pencil).frame(maxWidth: .infinity, alignment: .leading) }
                    }
                    .pagePadding()
                }
                .onChange(of: messages.count) { if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
            }
            composer
        }
        .task { await load() }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if let photo, let ui = UIImage(data: photo) {
                HStack {
                    Image(uiImage: ui).resizable().scaledToFill().frame(width: 56, height: 56).clipped().overlay(Rectangle().stroke(Ink.ink, lineWidth: 2))
                    Text("Add a caption, or send as-is.").font(.caption).foregroundStyle(Ink.pencil)
                    Spacer()
                    Button("✕") { self.photo = nil }.buttonStyle(PaperButton())
                }
            }
            HStack(alignment: .bottom) {
                TextField("Talk to Tally", text: $text, axis: .vertical).lineLimit(1...4).onSubmit { Task { await send() } }
                PhotosPicker(selection: $pickerItem, matching: .images) { Image(systemName: "camera").font(.title3) }.buttonStyle(PaperButton())
                Button("Send") { Task { await send() } }.buttonStyle(InkButton()).disabled(busy || (text.isEmpty && photo == nil))
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Ink.margin) }
        }
        .padding(12).markerBox().padding(.leading, 52).padding(.trailing, 16).padding(.bottom, 8)
        .onChange(of: pickerItem) { Task { photo = await loadJpeg(pickerItem) } }
    }

    private func load() async {
        do { messages = try await TallyAPI.shared.chatHistory() } catch { self.error = error.localizedDescription }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, !body.isEmpty || photo != nil else { return }
        busy = true; error = nil
        let shown = photo != nil ? "[photo] \(body)".trimmingCharacters(in: .whitespaces) : body
        let tempId = -Int(Date().timeIntervalSince1970)
        messages.append(ChatMessage(id: tempId, channel: "web", role: .user, content: shown, results: [], createdAt: ""))
        let sending = (body, photo)
        text = ""; photo = nil
        do {
            // A UUID per send: the server dedups on it, so a retry after a dropped
            // connection never logs the same thing twice.
            let r = try await TallyAPI.shared.send(text: sending.0, photo: sending.1, clientMsgId: UUID().uuidString)
            messages.append(ChatMessage(id: tempId - 1, channel: "web", role: .assistant, content: r.reply, results: r.results, createdAt: ""))
            await session.refreshStatus()
        } catch {
            self.error = error.localizedDescription
            messages.removeAll { $0.id == tempId }
            text = sending.0
        }
        busy = false
    }
}

/// Picker item → JPEG bytes the server's estimator accepts.
func loadJpeg(_ item: PhotosPickerItem?) async -> Data? {
    guard let item, let data = try? await item.loadTransferable(type: Data.self), let ui = UIImage(data: data) else { return nil }
    return ui.jpegData(compressionQuality: 0.8)
}

struct Bubble: View {
    let message: ChatMessage
    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                if message.role == .assistant && message.channel == "telegram" {
                    Text("via Telegram").font(TallyFont.display(11)).foregroundStyle(Ink.margin)
                }
                Text(message.content)
                if !message.results.isEmpty {
                    Divider().overlay(Ink.ink.opacity(0.2))
                    ForEach(message.results, id: \.self) { Text($0).font(.footnote).foregroundStyle(Ink.pencil) }
                }
            }
            .padding(10)
            .foregroundStyle(message.role == .user ? Ink.paper : Ink.ink)
            .background(message.role == .user ? Ink.ink : .clear)
            .modifier(AssistantBox(on: message.role == .assistant))
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }
}

private struct AssistantBox: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.markerBox() } else { content }
    }
}
