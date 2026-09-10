import SwiftUI
import TallyKit

struct WatchTodayView: View {
    @Environment(WatchModel.self) private var model
    var body: some View {
        List {
            if let s = model.status {
                ForEach(s.activities.filter { $0.kind == .counter }) { a in CounterRow(activity: a) }
                NavigationLink("Talk to Tally") { TalkView() }.font(TallyFont.display(18))
            } else {
                Text(model.error ?? "Loading…").foregroundStyle(Ink.pencil)
            }
        }
        .navigationTitle("Tally")
        .refreshable { await model.refresh() }
    }
}

/// Big targets, additive deltas, optimistic number; a failed tap queues.
struct CounterRow: View {
    @Environment(WatchModel.self) private var model
    let activity: ActivityStatus
    @State private var shown: Double?
    private var done: Double { shown ?? activity.done ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(activity.label).font(TallyFont.display(16))
                Spacer()
                Text("\(Int(done))\(activity.goal.map { "/\(Int($0))" } ?? "")").font(TallyFont.display(22)).monospacedDigit()
                    .foregroundStyle(activity.goal.map { done >= $0 } ?? false ? Ink.margin : .primary)
            }
            HStack(spacing: 6) {
                ForEach([1.0, 5.0, 10.0], id: \.self) { d in
                    Button("+\(Int(d))") { Task { await bump(d) } }.font(TallyFont.display(16)).buttonStyle(.bordered)
                }
            }
        }
        .onChange(of: activity.done) { shown = nil }
    }

    private func bump(_ delta: Double) async {
        shown = done + delta
        do {
            let r = try await TallyAPI.shared.log(.counter(activityKey: activity.key, delta: delta))
            shown = r.total
            await model.refresh()
        } catch {
            await PendingOps.shared.enqueue(activityKey: activity.key, delta: delta)
        }
    }
}
