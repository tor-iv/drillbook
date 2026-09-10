import BackgroundTasks
import Foundation
import TallyKit
import UserNotifications

/// Nudges without APNs (free Apple ID): a background refresh task pulls the
/// current slot's nudge and posts it locally; three fixed daily reminders
/// are the floor if iOS never grants the refresh.
enum Nudges {
    static let refreshId = "me.torcox.tally.refresh"
    static let slots: [(hour: Int, minute: Int, slot: String)] = [(7, 30, "morning"), (13, 0, "midday"), (20, 0, "evening")]

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { task in
            handle(task as! BGAppRefreshTask)
        }
        scheduleRefresh()
    }

    static func requestPermissionAndSchedule() async {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard ok else { return }
        scheduleFixedReminders()
    }

    static func scheduleRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: refreshId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(req)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        scheduleRefresh()
        let work = Task {
            let slot = currentSlot()
            if let nudge = try? await TallyAPI.shared.nudge(slot: slot) {
                await post(title: "Tally", body: nudge.text, id: "nudge-\(slot)")
            }
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
    }

    private static func currentSlot() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 12 ? "morning" : h < 18 ? "midday" : "evening"
    }

    private static func scheduleFixedReminders() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: slots.map { "fixed-\($0.slot)" })
        for s in slots {
            var comps = DateComponents(); comps.hour = s.hour; comps.minute = s.minute
            let content = UNMutableNotificationContent()
            content.title = "Tally"
            content.body = s.slot == "evening" ? "What's still open today?" : "Check in with Tally."
            center.add(UNNotificationRequest(identifier: "fixed-\(s.slot)", content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)))
        }
    }

    private static func post(title: String, body: String, id: String) async {
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}
