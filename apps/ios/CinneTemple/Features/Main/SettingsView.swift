//
//  SettingsView.swift
//  CinneTemple
//

import SwiftUI
import Combine

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var sessions: [SessionInfo] = []
    @Published var loading = false
    @Published var error: String?

    private let api: AuthAPI
    init(api: AuthAPI) { self.api = api }

    func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do { sessions = try await api.sessions() }
        catch let err { self.error = (err as? APIError)?.detail ?? "Could not load sessions." }
    }

    func revoke(_ id: String) async {
        try? await api.revokeSession(id: id)
        await load()
    }

    func deleteAccount() async -> Bool {
        loading = true
        defer { loading = false }
        do { try await api.deleteAccount(); return true }
        catch { self.error = (error as? APIError)?.detail ?? "Could not delete your account. Please try again."; return false }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var model: SettingsViewModel
    @State private var confirmDeletion = false

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: SettingsViewModel(api: container.authAPI))
    }

    // Pushed from Profile (contract §2) — rides the presenter's NavigationStack.
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                accountCard
                securityCard
                sessionsCard
                aboutCard
                signOutCard
            }
            .padding(.vertical, 16)
        }
        .scrollIndicators(.hidden)
        .background(Theme.Colors.bgBase)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .alert("Permanently delete your account?", isPresented: $confirmDeletion) {
            Button("Cancel", role: .cancel) { }
            Button("Delete account", role: .destructive) {
                Task { if await model.deleteAccount() { await session.signOut() } }
            }
        } message: {
            Text("Your profile, sign-in details and personal activity will be removed. You will lose account access, tickets and unused coins. Limited payment and security records are retained where required. This cannot be undone.")
        }
    }

    private var accountCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Account").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                infoRow("Email", session.user?.email ?? "—")
                infoRow("Status", session.user?.status.rawValue ?? "—")
                infoRow("Two-factor (MFA)", session.user?.mfaEnabled == true ? "Enabled" : "Not enabled")
                infoRow("Roles", (session.user?.roles ?? []).joined(separator: ", "))
                Button("Delete account and data", role: .destructive) { confirmDeletion = true }
                        .font(.subheadline.weight(.semibold))
                        .disabled(model.loading)
                if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
    }

    private var aboutCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("About").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                if let support = URL(string: "mailto:support@cinnetemple.com") {
                    Link("Help & Support", destination: support)
                        .foregroundStyle(Theme.Colors.brand)
                }
                if let privacy = URL(string: "https://www.cinnetemple.com/privacy/") {
                    Link("Privacy policy", destination: privacy)
                        .foregroundStyle(Theme.Colors.brand)
                }
            }
            .font(.subheadline.weight(.semibold))
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
    }

    private var securityCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Security").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                Toggle(isOn: Binding(
                    get: { session.biometricEnabled },
                    set: { session.setBiometricEnabled($0) }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Unlock with \(session.biometrics.label)")
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text("Require biometrics each time you open the app.")
                            .font(.caption)
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
                .tint(Theme.Colors.brand)
                .disabled(session.biometrics.availableBiometry() == .none)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
    }

    private var sessionsCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Active sessions").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                    Spacer()
                    Button("Refresh") { Task { await model.load() } }
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
                if let error = model.error { ErrorBanner(message: error) }
                if model.loading {
                    ProgressView().tint(.white)
                } else if model.sessions.isEmpty {
                    Text("No active sessions.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.textSecondary)
                } else {
                    ForEach(model.sessions) { s in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.userAgent ?? "Unknown device")
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.Colors.textPrimary)
                                    .lineLimit(1)
                                Text(s.ip ?? "unknown ip")
                                    .font(.caption)
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                            Spacer()
                            Button("Revoke") { Task { await model.revoke(s.id) } }
                                .font(.caption.bold())
                                .foregroundStyle(Theme.Colors.brand)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
    }

    private var signOutCard: some View {
        GlassCard {
            VStack(spacing: 12) {
                GlassButton(title: "Sign out") { Task { await session.signOut() } }
            }
            .padding(18)
        }
        .padding(.horizontal, 16)
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            Text(value).foregroundStyle(Theme.Colors.textPrimary).multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }
}
