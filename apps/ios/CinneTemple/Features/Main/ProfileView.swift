//
//  ProfileView.swift
//  CinneTemple
//
//  Profile — reached from the Home top-right avatar (design contract §2):
//  account header, then grouped glass rows Settings / Studio (admins only) /
//  Purchase history, and a red Sign Out. Pushed on the presenter's
//  NavigationStack — no stack of its own. No plan/subscription UI —
//  CinneTemple is pay-once watch-once.
//

import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: SessionStore
    private let container: AppContainer

    init(container: AppContainer) { self.container = container }

    private enum Row: String, CaseIterable, Identifiable {
        case settings = "Settings"
        case studio = "Studio"
        case purchaseHistory = "Purchase history"

        var id: String { rawValue }
        var icon: String {
            switch self {
            case .settings: return "gearshape"
            case .studio: return "film.stack"
            case .purchaseHistory: return "creditcard"
            }
        }
    }

    /// Contract order: Settings, Studio (admins only), Purchase history.
    private var visibleRows: [Row] {
        session.user?.isAdmin == true ? Row.allCases : [.settings, .purchaseHistory]
    }

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Profile").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)

                    // Account header
                    HStack(spacing: 16) {
                        ZStack {
                            Circle().fill(Theme.indigoGradient)
                            Text(session.user?.initials ?? "?").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                        }
                        .frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.user?.profile?.displayName ?? "Your profile").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                            Text(session.user?.email ?? "").font(.system(size: 13)).foregroundStyle(.white.opacity(0.55))
                            // Pay-once watch-once: no plans, no renewals.
                            Text(session.user?.isAdmin == true ? "Admin" : "Pay once, watch once").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Colors.indigoLight)
                        }
                        Spacer()
                    }
                    .padding(.top, 20)

                    // Grouped glass list — Settings / Studio (admins) / Purchase history.
                    VStack(spacing: 0) {
                        ForEach(Array(visibleRows.enumerated()), id: \.element.id) { idx, row in
                            NavigationLink { destination(row) } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: row.icon).font(.system(size: 18)).foregroundStyle(.white.opacity(0.8)).frame(width: 22)
                                    Text(row.rawValue).font(.system(size: 15)).foregroundStyle(.white)
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.white.opacity(0.4))
                                }
                                .padding(.horizontal, 16).padding(.vertical, 16)
                                .overlay(alignment: .top) { if idx > 0 { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) } }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .liquidGlass(cornerRadius: 16)
                    .padding(.top, 24)

                    // Sign out
                    Button { Task { await session.signOut() } } label: {
                        Text("Sign Out").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(hex: 0xF2555A))
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(Color(hex: 0xBF1515).opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: 0xBF1515).opacity(0.25), lineWidth: 1))
                    }
                    .padding(.top, 28)
                }
                .padding(.horizontal, 20).padding(.top, 16)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    @ViewBuilder private func destination(_ row: Row) -> some View {
        switch row {
        case .settings: SettingsView(container: container)
        case .studio: AdminDashboardView(container: container)
        case .purchaseHistory: PurchaseHistoryView(client: container.apiClient)
        }
    }
}
