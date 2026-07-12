//
//  AdminMembersTab.swift
//  CinneTemple
//
//  Studio > Members: search + pagination over /v1/admin/users with
//  confirmation-dialog row actions (promote/demote, suspend/reactivate,
//  force-verify). Self-demotion is hidden (server forbids it anyway).
//

import SwiftUI
import Combine

@MainActor
final class AdminMembersModel: ObservableObject {
    @Published var users: [AdminUser] = []
    @Published var total = 0
    @Published var query = ""
    @Published var loading = false
    @Published var loadingMore = false
    @Published var error: String?
    @Published var actingId: String?

    let api: AdminAPI
    private let take = 50
    private var loaded = false
    private var lastLoadedQuery = ""

    init(api: AdminAPI) { self.api = api }

    func loadIfNeeded() async {
        guard !loaded else { return }
        await reload()
    }

    func reload() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let page = try await api.users(q: query, take: take, skip: 0)
            users = page.users
            total = page.total
            loaded = true
            lastLoadedQuery = query
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    /// Debounced search hook — reloads only when the query actually changed.
    func searchIfNeeded() async {
        guard query != lastLoadedQuery else { return }
        await reload()
    }

    func loadMore() async {
        guard !loadingMore, users.count < total else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await api.users(q: query, take: take, skip: users.count)
            users.append(contentsOf: page.users)
            total = page.total
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    // MARK: Row actions

    func promote(_ user: AdminUser) async {
        var roles = user.roles
        if !roles.contains("user") { roles.append("user") }
        if !roles.contains("admin") { roles.append("admin") }
        await perform(user) { try await self.api.setRoles(userId: user.id, roles: roles) }
    }

    func demote(_ user: AdminUser) async {
        let roles = user.roles.filter { $0 != "admin" }
        await perform(user) {
            try await self.api.setRoles(userId: user.id, roles: roles.isEmpty ? ["user"] : roles)
        }
    }

    func suspend(_ user: AdminUser) async {
        await perform(user) { try await self.api.setStatus(userId: user.id, status: "SUSPENDED") }
    }

    func reactivate(_ user: AdminUser) async {
        await perform(user) { try await self.api.setStatus(userId: user.id, status: "ACTIVE") }
    }

    func forceVerify(_ user: AdminUser) async {
        await perform(user) { try await self.api.verifyUser(userId: user.id) }
    }

    private func perform(_ user: AdminUser, _ action: () async throws -> AdminUser) async {
        actingId = user.id
        error = nil
        defer { actingId = nil }
        do {
            let updated = try await action()
            if let idx = users.firstIndex(where: { $0.id == updated.id }) {
                users[idx] = updated
            }
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }
}

struct AdminMembersTab: View {
    @ObservedObject var model: AdminMembersModel
    @EnvironmentObject private var session: SessionStore

    @State private var actionUser: AdminUser?
    @State private var showActions = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AdminSearchField(placeholder: "Search email or name", text: $model.query)

                if let error = model.error { ErrorBanner(message: error) }

                if model.loading && model.users.isEmpty {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                } else if model.users.isEmpty {
                    AdminEmptyState(icon: "person.2", message: "No members match this search.")
                } else {
                    Text("\(model.total) member\(model.total == 1 ? "" : "s")")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)

                    VStack(spacing: 10) {
                        ForEach(model.users) { user in
                            userRow(user)
                        }
                    }

                    AdminLoadMoreButton(
                        shown: model.users.count,
                        total: model.total,
                        loading: model.loadingMore
                    ) {
                        Task { await model.loadMore() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        .task { await model.loadIfNeeded() }
        .task(id: model.query) {
            // Debounce typing before hitting the API.
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await model.searchIfNeeded()
        }
        .confirmationDialog(
            actionUser.map { $0.displayName ?? $0.email } ?? "Member",
            isPresented: $showActions,
            titleVisibility: .visible,
            presenting: actionUser
        ) { user in
            dialogActions(user)
        } message: { user in
            Text("\(user.email) • \(user.purchases) purchase\(user.purchases == 1 ? "" : "s") • joined \(AdminFormat.date(user.createdAt))")
        }
    }

    // MARK: Row

    private func userRow(_ user: AdminUser) -> some View {
        Button {
            actionUser = user
            showActions = true
        } label: {
            HStack(spacing: 12) {
                initialsBadge(user)

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName ?? user.email)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if user.displayName != nil {
                        Text(user.email)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .lineLimit(1)
                    }
                    HStack(spacing: 5) {
                        if user.isAdmin {
                            AdminPill(text: "ADMIN", color: Theme.Colors.indigoBright)
                        }
                        AdminPill(text: user.status.replacingOccurrences(of: "_", with: " "),
                                  color: AdminPillStyle.userStatus(user.status))
                        if !user.emailVerified {
                            AdminPill(text: "UNVERIFIED", color: Color(hex: 0xFBBF24))
                        }
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 4) {
                    if model.actingId == user.id {
                        ProgressView().tint(.white).controlSize(.small)
                    } else {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 18))
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                    HStack(spacing: 3) {
                        Image(systemName: "ticket")
                            .font(.system(size: 9, weight: .semibold))
                        Text("\(user.purchases)")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            .padding(12)
            .liquidGlass(cornerRadius: Theme.Radius.md)
        }
        .buttonStyle(.plain)
        .disabled(model.actingId != nil)
    }

    private func initialsBadge(_ user: AdminUser) -> some View {
        ZStack {
            Circle().fill(Theme.indigoGradient)
            Text(initials(of: user))
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 40, height: 40)
    }

    private func initials(of user: AdminUser) -> String {
        let source = user.displayName ?? user.email
        let letters = source.split(separator: " ").prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }

    // MARK: Actions

    @ViewBuilder
    private func dialogActions(_ user: AdminUser) -> some View {
        let isSelf = user.id == session.user?.id

        if user.isAdmin {
            // No self-demotion (server returns 403 anyway).
            if !isSelf {
                Button("Remove admin role", role: .destructive) {
                    Task { await model.demote(user) }
                }
            }
        } else {
            Button("Promote to admin") {
                Task { await model.promote(user) }
            }
        }

        if user.isSuspended {
            Button("Reactivate account") {
                Task { await model.reactivate(user) }
            }
        } else if !isSelf {
            Button("Suspend account", role: .destructive) {
                Task { await model.suspend(user) }
            }
        }

        if !user.emailVerified {
            Button("Force-verify email") {
                Task { await model.forceVerify(user) }
            }
        }

        Button("Cancel", role: .cancel) {}
    }
}
