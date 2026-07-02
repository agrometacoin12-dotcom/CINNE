//
//  ProfileView.swift
//  CinneTemple
//
//  Profile — exact Figma (node 42:13833): heading, avatar + name + email + Premium
//  tag, grouped glass settings list, My List poster row, red Sign Out.
//

import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: SessionStore
    private let container: AppContainer
    @State private var list: [WatchlistEntry] = []
    @State private var showPaywall = false

    init(container: AppContainer) { self.container = container }

    private var isPremium: Bool {
        (session.user?.isAdmin ?? false) || (session.user?.roles.contains("premium") ?? false) || (session.user?.roles.contains("admin") ?? false)
    }

    private struct Row: Identifiable { let id = UUID(); let icon: String; let label: String }
    private let rows = [
        Row(icon: "bell", label: "Notifications"),
        Row(icon: "arrow.down.circle", label: "Downloads"),
        Row(icon: "globe", label: "Language"),
        Row(icon: "questionmark.circle", label: "Help & Support"),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.bgBase.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Profile").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)

                        // Header
                        HStack(spacing: 16) {
                            ZStack {
                                Circle().fill(Theme.indigoGradient)
                                Text(session.user?.initials ?? "?").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                            }
                            .frame(width: 56, height: 56)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.user?.profile?.displayName ?? "Your profile").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                                Text(session.user?.email ?? "").font(.system(size: 13)).foregroundStyle(.white.opacity(0.55))
                                Text(isPremium ? "Premium  •  renews Aug 2026" : "Free plan").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Colors.indigoLight)
                            }
                            Spacer()
                            if !isPremium {
                                Button { showPaywall = true } label: {
                                    Text("Go Premium").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                                        .padding(.horizontal, 12).frame(height: 32)
                                        .liquidGlass(cornerRadius: 16, tint: Theme.Colors.brand)
                                }
                                .buttonStyle(PressableButtonStyle())
                            }
                        }
                        .padding(.top, 20)
                        .sheet(isPresented: $showPaywall) { PaywallView() }

                        // Grouped list
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, r in
                                NavigationLink { destination(r.label) } label: {
                                    HStack(spacing: 14) {
                                        Image(systemName: r.icon).font(.system(size: 18)).foregroundStyle(.white.opacity(0.8)).frame(width: 22)
                                        Text(r.label).font(.system(size: 15)).foregroundStyle(.white)
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

                        // My List
                        if !list.isEmpty {
                            HStack {
                                Text("My List").font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                                Spacer()
                                Text("See all").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.Colors.indigoLight)
                            }
                            .padding(.top, 28)
                            ScrollView(.horizontal) {
                                HStack(spacing: 12) {
                                    ForEach(list) { e in
                                        if let t = e.title {
                                            NavigationLink(value: t) { poster(t) }.buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            .scrollIndicators(.hidden).padding(.top, 12)
                        }

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
                .navigationDestination(for: TitleSummary.self) { TitleDetailView(titleId: $0.id, container: container) }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { if list.isEmpty { list = (try? await container.catalogueAPI.watchlist()) ?? [] } }
        }
    }

    @ViewBuilder private func destination(_ label: String) -> some View {
        switch label {
        case "Notifications": NotificationsView()
        case "Downloads": DownloadsView()
        default: SettingsView(container: container)
        }
    }

    private func poster(_ t: TitleSummary) -> some View {
        Group {
            if let s = t.posterUrl, let url = URL(string: s) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: {
                    LinearGradient(colors: t.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            } else {
                LinearGradient(colors: t.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .frame(width: 110, height: 165)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.35), lineWidth: 1.3))
    }
}
