import SwiftUI
import TallyKit
import WidgetKit

struct Entry: TimelineEntry {
    let date: Date
    let status: DayStatus?
}

/// Reads the App Group cache the watch app writes; no network from the
/// widget itself (budget is tiny). The app reloads timelines after every log.
struct Provider: TimelineProvider {
    func placeholder(in _: Context) -> Entry { Entry(date: .now, status: nil) }
    func getSnapshot(in _: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now, status: load())) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now, status: load())], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
    private func load() -> DayStatus? {
        guard let data = UserDefaults(suiteName: "group.me.torcox.tally")?.data(forKey: "status") else { return nil }
        return try? JSONDecoder().decode(DayStatus.self, from: data)
    }
}

struct OpenDrillsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry
    var open: [ActivityStatus] { entry.status?.openDrills ?? [] }

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(open.count)").font(.system(size: 22, weight: .heavy, design: .rounded))
                    Text("open").font(.system(size: 9))
                }
            }
        default:
            VStack(alignment: .leading, spacing: 1) {
                Text("TALLY").font(.system(size: 10, weight: .heavy)).widgetAccentable()
                if open.isEmpty {
                    Text(entry.status == nil ? "open the app" : "all drills closed").font(.system(size: 12))
                } else {
                    ForEach(open.prefix(2)) { a in
                        Text("\(a.label) \(Int(a.done ?? 0))/\(Int(a.goal ?? 0))").font(.system(size: 12)).lineLimit(1)
                    }
                }
            }
        }
    }
}

@main
struct OpenDrillsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "me.torcox.tally.opendrills", provider: Provider()) { entry in
            OpenDrillsView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Open drills")
        .description("What's still open today.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}
