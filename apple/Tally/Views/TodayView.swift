import SwiftUI
import TallyKit

struct TodayView: View {
    @Environment(AppSession.self) private var session
    @State private var weightSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Tally", subtitle: session.status?.summary ?? "Loading…")
                if let status = session.status {
                    ForEach(status.activities) { a in
                        if a.kind == .counter { CounterCard(activity: a) } else { MeasureCard(activity: a) { weightSheet = true } }
                    }
                } else if let err = session.lastError {
                    Text(err).foregroundStyle(Ink.margin)
                }
            }
            .pagePadding()
        }
        .refreshable { await session.refreshStatus() }
        .sheet(isPresented: $weightSheet) { WeightSheet() }
    }
}

/// Tap-to-log with an optimistic update: the number moves on tap, and the
/// server's answer overwrites it (or the tap is queued if offline).
struct CounterCard: View {
    @Environment(AppSession.self) private var session
    let activity: ActivityStatus
    @State private var shown: Double?

    private var done: Double { shown ?? activity.done ?? 0 }
    private var met: Bool { activity.goal.map { done >= $0 } ?? (done > 0) }

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.label).font(TallyFont.display(26)).highlighted(met)
                Text(activity.streak > 0 ? "\(activity.streak)-day streak" : " ").font(.caption).foregroundStyle(Ink.pencil)
                Text("\(Int(done))\(activity.goal.map { "/\(Int($0))" } ?? "")")
                    .font(TallyFont.display(40)).monospacedDigit()
            }
            Spacer()
            VStack(spacing: 6) {
                ForEach([1.0, 5.0, 10.0], id: \.self) { d in
                    Button("+\(Int(d))") { Task { await bump(d) } }.buttonStyle(PaperButton())
                }
            }
        }
        .padding(12)
        .markerBox()
        .onChange(of: activity.done) { shown = nil }
    }

    private func bump(_ delta: Double) async {
        shown = done + delta
        do {
            let r = try await TallyAPI.shared.log(.counter(activityKey: activity.key, delta: delta))
            shown = r.total
            await session.refreshStatus()
        } catch APIError.unauthorized {
            await session.signOut()
        } catch {
            await PendingOps.shared.enqueue(activityKey: activity.key, delta: delta)
        }
    }
}

struct MeasureCard: View {
    let activity: ActivityStatus
    let onTap: () -> Void
    var body: some View {
        Button(action: onTap) {
            HStack {
                Text(activity.label).font(TallyFont.display(26))
                Spacer()
                Text(activity.done.map { "\(String(format: "%.1f", $0)) \(activity.unit)" } ?? "log")
                    .font(TallyFont.display(28)).foregroundStyle(activity.done == nil ? Ink.pencil : Ink.ink)
            }
            .padding(12).markerBox()
        }
        .buttonStyle(.plain)
    }
}

struct WeightSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    var body: some View {
        VStack(spacing: 16) {
            PageHeader(title: "Weight")
            TextField("lb", text: $text).keyboardType(.decimalPad).font(TallyFont.display(40)).padding(10).markerBox()
            Button("Log") {
                Task {
                    if let v = Double(text) { _ = try? await TallyAPI.shared.log(.weight(v)); await session.refreshStatus() }
                    dismiss()
                }
            }
            .buttonStyle(InkButton()).disabled(Double(text) == nil)
            Spacer()
        }
        .padding(24).presentationDetents([.medium]).background(Ink.paper)
    }
}
