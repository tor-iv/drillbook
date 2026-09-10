import SwiftUI
import TallyKit

struct RootTabs: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "checkmark.square") }
            ChatView().tabItem { Label("Chat", systemImage: "text.bubble") }
            FoodView().tabItem { Label("Food", systemImage: "fork.knife") }
            CoachView().tabItem { Label("Coach", systemImage: "figure.strengthtraining.traditional") }
            SettingsView().tabItem { Label("Setup", systemImage: "gearshape") }
        }
        .tint(Ink.ink)
    }
}

/// Page header in the notebook style: big display title, small pencil subtitle.
struct PageHeader: View {
    let title: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(TallyFont.display(44)).foregroundStyle(Ink.ink)
            if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Ink.pencil) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Content sits right of the red margin line, like writing on the page.
struct PagePadding: ViewModifier {
    func body(content: Content) -> some View { content.padding(.leading, 52).padding(.trailing, 16).padding(.vertical, 16) }
}
extension View { func pagePadding() -> some View { modifier(PagePadding()) } }

/// YYYY-MM-DD in the coach's timezone — same rule as the server's localDate().
func localDate(_ date: Date = Date(), timeZone: TimeZone = TimeZone(identifier: "America/New_York")!) -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = timeZone
    return f.string(from: date)
}
