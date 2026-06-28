//
//  CinneTempleApp.swift
//  CinneTemple
//

import SwiftUI

@main
struct CinneTempleApp: App {
    @StateObject private var session: SessionStore
    @Environment(\.scenePhase) private var scenePhase
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate
    private let container: AppContainer

    init() {
        let container = AppContainer()
        self.container = container
        _session = StateObject(wrappedValue: container.session)
        PushAppDelegate.pushManager = container.pushManager
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environment(\.appContainer, container)
                .preferredColorScheme(.dark)
                .task { await session.bootstrap() }
                .task(id: session.phase) {
                    // Ask for push permission once the user is signed in.
                    if session.phase == .authenticated {
                        await container.pushManager.requestAuthorization()
                    }
                }
        }
        // Schedule the next background refresh whenever we leave the foreground.
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                container.backgroundSync.scheduleNextRefresh()
            }
        }
        // System-invoked background refresh (declare the identifier in Info.plist).
        .backgroundTask(.appRefresh(BackgroundSyncManager.taskIdentifier)) {
            await container.backgroundSync.performSync()
            await container.backgroundSync.scheduleNextRefresh()
        }
    }
}

// MARK: - Container injection

private struct AppContainerKey: EnvironmentKey {
    @MainActor static let defaultValue = AppContainer()
}

extension EnvironmentValues {
    var appContainer: AppContainer {
        get { self[AppContainerKey.self] }
        set { self[AppContainerKey.self] = newValue }
    }
}
