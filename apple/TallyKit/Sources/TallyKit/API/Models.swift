import Foundation

// Wire models. Field names match the server's JSON exactly (src/lib/status.ts,
// src/lib/agent/history.ts, ...) so Codable needs no key mapping — if the
// server renames a field, the compile-time model is the place it shows up.

public struct ActivityStatus: Codable, Identifiable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case counter, measure }
    public let id: Int
    public let key: String
    public let label: String
    public let kind: Kind
    public let unit: String
    public let goal: Double?
    public var done: Double?
    public var met: Bool
    public let streak: Int
}

public struct DayStatus: Codable, Sendable {
    public let date: String
    public var activities: [ActivityStatus]
    public var behind: Bool
    public let calories: Double?
    public let summary: String

    /// Counters with a goal that still isn't met — what the watch and the complication care about.
    public var openDrills: [ActivityStatus] {
        activities.filter { $0.kind == .counter && $0.goal != nil && !$0.met }
    }
}

public struct LogResponse: Codable, Sendable {
    public let ok: Bool
    public let spoken: String
    public let total: Double?
}

public enum LogRequest: Encodable, Sendable {
    case counter(activityKey: String, delta: Double)
    case weight(Double)
    case meal(String)
    case workout(String)

    enum CodingKeys: String, CodingKey { case type, activityKey, delta, value, description }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .counter(key, delta):
            try c.encode("counter", forKey: .type); try c.encode(key, forKey: .activityKey); try c.encode(delta, forKey: .delta)
        case let .weight(v):
            try c.encode("weight", forKey: .type); try c.encode(v, forKey: .value)
        case let .meal(d):
            try c.encode("meal", forKey: .type); try c.encode(d, forKey: .description)
        case let .workout(d):
            try c.encode("workout", forKey: .type); try c.encode(d, forKey: .description)
        }
    }
}

public struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    public enum Role: String, Codable, Sendable { case user, assistant }
    public let id: Int
    public let channel: String
    public let role: Role
    public let content: String
    public let results: [String]
    public let createdAt: String

    public init(id: Int, channel: String, role: Role, content: String, results: [String], createdAt: String) {
        self.id = id; self.channel = channel; self.role = role; self.content = content; self.results = results; self.createdAt = createdAt
    }
}

public struct ChatReply: Codable, Sendable {
    public let reply: String
    public let results: [String]
}

public struct Meal: Codable, Identifiable, Hashable, Sendable {
    public let id: Int
    public let date: String
    public let name: String
    public let calories: Double
    public let protein: Double?
    public let method: String
}

public struct MealsPage: Codable, Sendable {
    public struct Totals: Codable, Sendable { public let calories: Double; public let protein: Double }
    public let date: String
    public let meals: [Meal]
    public let totals: Totals
}

public struct MealLogged: Codable, Sendable {
    public let ok: Bool
    public let meal: Meal
    public let confidence: String?
    public let question: String?
}

public struct CoachNote: Codable, Sendable {
    public let date: String
    public let content: String
    public let createdAt: String
}

public struct CoachNotes: Codable, Sendable {
    public let daily: CoachNote?
    public let weekly: CoachNote?
}

public struct NudgeText: Codable, Sendable { public let text: String }

public struct DeviceToken: Codable, Sendable {
    public let id: Int
    public let token: String
}
