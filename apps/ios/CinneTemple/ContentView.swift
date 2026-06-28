//
//  ContentView.swift
//  CinneTemple
//
//  Root router: switches between the loading splash, biometric lock, the auth
//  flow, and the authenticated app based on SessionStore.phase.
//

import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appContainer) private var container

    var body: some View {
        ZStack {
            CinematicBackground()

            switch session.phase {
            case .loading:
                ProgressView()
                    .tint(.white)
                    .controlSize(.large)
            case .locked:
                LockView()
                    .transition(.opacity)
            case .unauthenticated:
                AuthFlowView(container: container)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            case .authenticated:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(Theme.Motion.spring, value: session.phase)
    }
}

/// Biometric unlock screen shown when a session exists but is locked.
struct LockView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(Theme.Colors.brand)
            Text("CinneTemple is locked")
                .font(.title2.bold())
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Unlock with \(session.biometrics.label) to continue.")
                .foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            VStack(spacing: 12) {
                PrimaryButton(title: "Unlock with \(session.biometrics.label)") {
                    Task { await session.unlockWithBiometrics() }
                }
                GlassButton(title: "Sign out") {
                    Task { await session.signOut() }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .task { await session.unlockWithBiometrics() }
    }
}

// Kept for SwiftUI previews / compatibility.
struct ContentView: View {
    var body: some View { RootView() }
}

#Preview {
    RootView()
        .environmentObject(
            AppContainer().session
        )
}
