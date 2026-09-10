import PhotosUI
import SwiftUI
import TallyKit

struct FoodView: View {
    @Environment(AppSession.self) private var session
    @State private var page: MealsPage?
    @State private var description = ""
    @State private var pickerItem: PhotosPickerItem?
    @State private var photo: Data?
    @State private var busy = false
    @State private var note: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Food", subtitle: page.map { "\(Int($0.totals.calories)) cal · \(Int($0.totals.protein))g protein" } ?? "Today")
                VStack(spacing: 8) {
                    if let photo, let ui = UIImage(data: photo) {
                        HStack {
                            Image(uiImage: ui).resizable().scaledToFill().frame(width: 64, height: 64).clipped().overlay(Rectangle().stroke(Ink.ink, lineWidth: 2))
                            Spacer()
                            Button("✕") { self.photo = nil }.buttonStyle(PaperButton())
                        }
                    }
                    TextField("What did you eat?", text: $description, axis: .vertical).lineLimit(1...3)
                    HStack {
                        Button(busy ? "…" : "Log it") { Task { await log() } }.buttonStyle(InkButton()).disabled(busy || (description.isEmpty && photo == nil))
                        PhotosPicker(selection: $pickerItem, matching: .images) { Image(systemName: "camera").font(.title3) }.buttonStyle(PaperButton())
                    }
                    if let note { Text(note).font(.footnote).foregroundStyle(Ink.pencil) }
                }
                .padding(12).markerBox()
                ForEach(page?.meals ?? []) { m in
                    HStack { Text(m.name); Spacer(); Text("\(Int(m.calories)) cal").font(TallyFont.display(20)) }
                        .padding(10).markerBox()
                }
            }
            .pagePadding()
        }
        .refreshable { await load() }
        .task { await load() }
        .onChange(of: pickerItem) { Task { photo = await loadJpeg(pickerItem) } }
    }

    private func load() async {
        page = try? await TallyAPI.shared.meals(date: localDate())
    }

    private func log() async {
        busy = true; note = nil
        do {
            let r = try await TallyAPI.shared.logMeal(description: description, photo: photo)
            note = r.question ?? "Logged \(r.meal.name), ~\(Int(r.meal.calories)) cal."
            description = ""; photo = nil
            await load(); await session.refreshStatus()
        } catch { note = error.localizedDescription }
        busy = false
    }
}
