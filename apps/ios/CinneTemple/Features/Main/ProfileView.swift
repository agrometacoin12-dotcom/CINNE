//
//  ProfileView.swift
//  CinneTemple
//

import SwiftUI
import Combine
import UIKit

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var displayName = ""
    @Published var avatarUrl = ""
    @Published var bio = ""
    @Published var isSaving = false
    @Published var message: String?
    @Published var isError = false

    private let api: AuthAPI
    private let session: SessionStore

    init(api: AuthAPI, session: SessionStore) {
        self.api = api
        self.session = session
        if let p = session.user?.profile {
            displayName = p.displayName
            avatarUrl = p.avatarUrl ?? ""
        }
    }

    func save() async {
        isSaving = true
        message = nil
        defer { isSaving = false }
        do {
            try await api.updateProfile(UpdateProfileRequest(
                displayName: displayName,
                avatarUrl: avatarUrl.isEmpty ? nil : avatarUrl,
                bio: bio.isEmpty ? nil : bio,
                locale: nil
            ))
            await session.refreshUser()
            isError = false
            message = "Profile updated."
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            isError = true
            message = (error as? APIError)?.detail ?? error.localizedDescription
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var model: ProfileViewModel

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: ProfileViewModel(api: container.authAPI, session: container.session))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    editor
                }
                .padding(.vertical, 16)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var header: some View {
        GlassCard {
            HStack(spacing: 16) {
                ZStack {
                    Circle().fill(Theme.Colors.brand.opacity(0.85))
                    Text(session.user?.initials ?? "?")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                }
                .frame(width: 72, height: 72)

                VStack(alignment: .leading, spacing: 4) {
                    Text(session.user?.profile?.displayName ?? "Your profile")
                        .font(.title3.bold())
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(session.user?.email ?? "")
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.textSecondary)
                    HStack(spacing: 6) {
                        ForEach(session.user?.roles ?? [], id: \.self) { role in
                            Text(role)
                                .font(.caption2)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.ultraThinMaterial, in: Capsule())
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                        if session.user?.emailVerified == true {
                            Text("verified")
                                .font(.caption2)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Color.green.opacity(0.25), in: Capsule())
                                .foregroundStyle(.green)
                        }
                    }
                }
                Spacer()
            }
            .padding(18)
        }
        .padding(.horizontal, 16)
    }

    private var editor: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Edit profile").font(.headline)
                    .foregroundStyle(Theme.Colors.textPrimary)
                if let msg = model.message {
                    if model.isError { ErrorBanner(message: msg) }
                    else { SuccessBanner(message: msg) }
                }
                GlassField(title: "Display name", text: $model.displayName, autocapitalization: .words)
                GlassField(title: "Avatar URL", text: $model.avatarUrl, keyboard: .URL)
                GlassField(title: "Bio", text: $model.bio, autocapitalization: .sentences)
                PrimaryButton(title: "Save changes", isLoading: model.isSaving) {
                    Task { await model.save() }
                }
            }
            .padding(18)
        }
        .padding(.horizontal, 16)
    }
}
