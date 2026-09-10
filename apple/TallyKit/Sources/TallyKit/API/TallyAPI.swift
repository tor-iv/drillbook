import Foundation

public enum APIError: Error, LocalizedError {
    case unauthorized
    case server(Int, String)
    case transport(Error)
    case decoding(Error)

    public var errorDescription: String? {
        switch self {
        case .unauthorized: return "Signed out — enter the PIN again."
        case let .server(code, msg): return msg.isEmpty ? "Server error \(code)" : msg
        case let .transport(e): return e.localizedDescription
        case .decoding: return "Unexpected reply from the server."
        }
    }
}

/// The one HTTP client. An actor so token/baseURL updates and in-flight calls
/// can't race; every screen goes through here, so auth and error mapping
/// live in exactly one place (the same reason the server has askClaude()).
public actor TallyAPI {
    public static let shared = TallyAPI()

    public private(set) var baseURL: URL
    private var token: String?
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(baseURL: URL = TallyAPI.defaultBaseURL, token: String? = TokenStore.load()?.token) {
        self.baseURL = baseURL
        self.token = token
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.waitsForConnectivity = false
        session = URLSession(configuration: cfg)
    }

    /// Release builds talk to prod; a debug build reads TALLY_BASE_URL from
    /// the scheme environment (Mac LAN IP) and falls back to prod.
    public static var defaultBaseURL: URL {
        if let s = UserDefaults.standard.string(forKey: "tally.baseURL"), let u = URL(string: s) { return u }
        if let s = ProcessInfo.processInfo.environment["TALLY_BASE_URL"], let u = URL(string: s) { return u }
        return URL(string: "https://drillbook.tors-bored.com")!
    }

    public func configure(baseURL: URL? = nil, token: String?) {
        if let baseURL { self.baseURL = baseURL; UserDefaults.standard.set(baseURL.absoluteString, forKey: "tally.baseURL") }
        self.token = token
    }

    public var isSignedIn: Bool { token != nil }

    // MARK: - Auth

    public func signIn(pin: String, deviceName: String) async throws -> String {
        let body = try encoder.encode(["pin": pin, "name": deviceName])
        let dt: DeviceToken = try await request("POST", "/api/auth/device", body: body, contentType: "application/json", authenticated: false)
        token = dt.token
        TokenStore.save(Credentials(token: dt.token, deviceId: dt.id))
        return dt.token
    }

    public func signOut() async {
        if let creds = TokenStore.load() {
            _ = try? await requestRaw("DELETE", "/api/auth/device?id=\(creds.deviceId)")
        }
        token = nil
        TokenStore.clear()
    }

    // MARK: - Endpoints

    public func status() async throws -> DayStatus { try await request("GET", "/api/status") }

    public func log(_ req: LogRequest) async throws -> LogResponse {
        try await request("POST", "/api/log", body: try encoder.encode(req), contentType: "application/json")
    }

    public func nudge(slot: String) async throws -> NudgeText { try await request("GET", "/api/nudge/latest?slot=\(slot)") }

    public func coach() async throws -> CoachNotes { try await request("GET", "/api/coach/latest") }

    public func chatHistory(before: Int? = nil) async throws -> [ChatMessage] {
        struct Page: Codable { let messages: [ChatMessage] }
        let q = before.map { "?before=\($0)" } ?? ""
        let page: Page = try await request("GET", "/api/chat\(q)")
        return page.messages
    }

    public func send(text: String?, photo: Data?, photoName: String = "photo.jpg", clientMsgId: String) async throws -> ChatReply {
        var parts: [MultipartPart] = [.field("clientMsgId", clientMsgId)]
        if let text, !text.isEmpty { parts.append(.field("text", text)) }
        if let photo { parts.append(.file("photo", photoName, "image/jpeg", photo)) }
        let (body, ct) = Multipart.encode(parts)
        return try await request("POST", "/api/chat", body: body, contentType: ct)
    }

    public func meals(date: String) async throws -> MealsPage { try await request("GET", "/api/meals?date=\(date)") }

    public func logMeal(description: String?, photo: Data?) async throws -> MealLogged {
        var parts: [MultipartPart] = []
        if let description, !description.isEmpty { parts.append(.field("description", description)) }
        if let photo { parts.append(.file("photo", "meal.jpg", "image/jpeg", photo)) }
        let (body, ct) = Multipart.encode(parts)
        return try await request("POST", "/api/meals", body: body, contentType: ct)
    }

    public func healthSync(payload: Data) async throws -> [String: Int] {
        try await request("POST", "/api/health-sync", body: payload, contentType: "application/json")
    }

    // MARK: - Plumbing

    private func request<T: Decodable>(_ method: String, _ path: String, body: Data? = nil, contentType: String? = nil, authenticated: Bool = true) async throws -> T {
        let data = try await requestRaw(method, path, body: body, contentType: contentType, authenticated: authenticated)
        do { return try decoder.decode(T.self, from: data) } catch { throw APIError.decoding(error) }
    }

    @discardableResult
    private func requestRaw(_ method: String, _ path: String, body: Data? = nil, contentType: String? = nil, authenticated: Bool = true) async throws -> Data {
        var req = URLRequest(url: baseURL.appending(path: path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path))
        if let q = path.split(separator: "?", maxSplits: 1).dropFirst().first {
            req.url = URL(string: req.url!.absoluteString + "?" + q)
        }
        req.httpMethod = method
        req.httpBody = body
        if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if authenticated, let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(for: req) } catch { throw APIError.transport(error) }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(code) else {
            struct Err: Decodable { let error: String? }
            let msg = (try? decoder.decode(Err.self, from: data))?.error ?? ""
            throw APIError.server(code, msg)
        }
        return data
    }
}

enum MultipartPart {
    case field(String, String)
    case file(String, String, String, Data)
}

enum Multipart {
    static func encode(_ parts: [MultipartPart]) -> (Data, String) {
        let boundary = "tally-\(UUID().uuidString)"
        var body = Data()
        for p in parts {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            switch p {
            case let .field(name, value):
                body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
            case let .file(name, filename, mime, data):
                body.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
                body.append(data)
                body.append("\r\n".data(using: .utf8)!)
            }
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return (body, "multipart/form-data; boundary=\(boundary)")
    }
}
