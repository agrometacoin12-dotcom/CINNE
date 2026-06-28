//
//  NotificationsAPI.swift
//  CinneTemple
//

import Foundation

final class NotificationsAPI {
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func registerDevice(token: String) async throws {
        let _: Empty = try await client.send(
            "v1/notifications/devices", method: .post,
            body: RegisterDeviceBody(platform: "IOS", token: token),
            authenticated: true
        )
    }

    func unregisterDevice(token: String) async throws {
        let _: Empty = try await client.send(
            "v1/notifications/devices/\(token)", method: .delete, authenticated: true
        )
    }
}

private struct RegisterDeviceBody: Encodable {
    let platform: String
    let token: String
}
