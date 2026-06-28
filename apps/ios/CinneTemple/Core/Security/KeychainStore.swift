//
//  KeychainStore.swift
//  CinneTemple
//
//  Minimal, dependency-free Keychain wrapper for storing auth tokens securely.
//  Items are stored with kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly so
//  they survive relaunch but never leave the device or sync to iCloud.
//

import Foundation
import Security

struct KeychainStore {
    enum Key: String {
        case accessToken = "ct.access"
        case refreshToken = "ct.refresh"
        case deviceId = "ct.device"
    }

    private let service = "com.cinnetemple.app"

    func set(_ value: String, for key: Key) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
        }
    }

    func get(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func remove(_ key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Returns a stable per-install device id, creating one if needed.
    func deviceId() -> String {
        if let existing = get(.deviceId) { return existing }
        let id = UUID().uuidString
        set(id, for: .deviceId)
        return id
    }
}
