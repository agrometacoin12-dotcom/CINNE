//
//  PushManager.swift
//  CinneTemple
//
//  Requests push authorization, registers for remote notifications, and sends
//  the APNs device token to the backend. Wire-up uses an AppDelegate adaptor to
//  receive the token callback (see CinneTempleApp).
//

import Foundation
import Combine
import UIKit
import UserNotifications

@MainActor
final class PushManager: NSObject, ObservableObject {
    @Published var isAuthorized = false

    private let api: NotificationsAPI
    private let session: SessionStore

    init(api: NotificationsAPI, session: SessionStore) {
        self.api = api
        self.session = session
        super.init()
    }

    /// Ask for permission and, if granted, register with APNs.
    func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        isAuthorized = granted
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// Called from the AppDelegate when APNs returns the device token.
    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard session.phase == .authenticated else { return }
        Task { try? await api.registerDevice(token: token) }
    }
}

/// AppDelegate adaptor that forwards the APNs token to the PushManager.
final class PushAppDelegate: NSObject, UIApplicationDelegate {
    static weak var pushManager: PushManager?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushAppDelegate.pushManager?.didRegister(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Non-fatal: device simply won't receive pushes this session.
    }
}
