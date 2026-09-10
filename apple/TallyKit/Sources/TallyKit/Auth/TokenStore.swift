import Foundation
import Security

public struct Credentials: Codable, Sendable {
    public let token: String
    public let deviceId: Int
    public init(token: String, deviceId: Int) { self.token = token; self.deviceId = deviceId }
}

/// Keychain wrapper for the device token. AfterFirstUnlock so background
/// HealthKit sync can still read it when the phone is locked in a pocket.
public enum TokenStore {
    private static let service = "me.torcox.tally"
    private static let account = "device-token"

    public static func save(_ creds: Credentials) {
        guard let data = try? JSONEncoder().encode(creds) else { return }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    public static func load() -> Credentials? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }

    public static func clear() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }
}
