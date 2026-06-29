//
//  TitleDetailView.swift
//  CinneTemple
//

import SwiftUI
import Combine
import UIKit

@MainActor
final class TitleDetailViewModel: ObservableObject {
    @Published var title: CatalogueTitle?
    @Published var inWatchlist = false
    @Published var isWorking = false
    @Published var hasAccess = false
    @Published var buying = false
    @Published var error: String?
    @Published var notice: String?
    @Published var giftCheckoutURL: URL?

    private let api: CatalogueAPI
    private let commerce: CommerceAPI
    let ticketStore: TicketStore
    private let session: SessionStore
    let titleId: String

    init(titleId: String, api: CatalogueAPI, commerce: CommerceAPI, ticketStore: TicketStore, session: SessionStore) {
        self.titleId = titleId
        self.api = api
        self.commerce = commerce
        self.ticketStore = ticketStore
        self.session = session
    }

    var isAuthenticated: Bool { session.phase == .authenticated }

    func load() async {
        do { title = try await api.title(id: titleId) }
        catch let err { self.error = (err as? APIError)?.detail ?? "Could not load title." }
        if isAuthenticated, let list = try? await api.watchlist() {
            inWatchlist = list.contains { $0.titleId == titleId }
        }
        if isAuthenticated, let status = try? await commerce.playbackStatus(titleId: titleId) {
            hasAccess = status.hasAccess
        }
    }

    func toggleWatchlist() async {
        guard isAuthenticated else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            if inWatchlist {
                try await api.removeFromWatchlist(titleId: titleId)
                inWatchlist = false
            } else {
                try await api.addToWatchlist(titleId: titleId)
                inWatchlist = true
            }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            self.error = (error as? APIError)?.detail
        }
    }

    /// Buy the viewer's own ticket. Free titles entitle via the server; paid
    /// titles go through StoreKit (App Store In-App Purchase).
    func buyTicket() async -> Bool {
        guard let t = title else { return false }
        buying = true
        error = nil
        defer { buying = false }
        if t.price <= 0 {
            do {
                let r = try await commerce.purchase(titleId: t.id)
                if r.isPaid { hasAccess = true; return true }
                error = "Could not unlock this title."
                return false
            } catch {
                self.error = (error as? APIError)?.detail ?? "Purchase failed."
                return false
            }
        }
        await ticketStore.buyTicket(for: t)
        switch ticketStore.state {
        case .success:
            hasAccess = true
            ticketStore.reset()
            return true
        case .failed(let message):
            error = message
            ticketStore.reset()
            return false
        default:
            return false
        }
    }

    /// Gift a ticket to another member by email (server purchase flow). For paid
    /// gifts on web checkout, the returned URL is opened in the browser.
    func gift(to email: String) async {
        guard let t = title else { return }
        buying = true
        error = nil
        notice = nil
        defer { buying = false }
        do {
            let r = try await commerce.purchase(titleId: t.id, beneficiaryEmail: email)
            if r.isPaid {
                notice = "Gift sent to \(email). They can watch it now."
            } else if let urlString = r.authorizationUrl, let url = URL(string: urlString) {
                giftCheckoutURL = url
            } else {
                error = "Could not start the gift purchase."
            }
        } catch {
            self.error = (error as? APIError)?.detail ?? "Gift failed."
        }
    }
}

enum CinemaRoute: Identifiable {
    case watch(String)
    case premiere(String)
    var id: String {
        switch self {
        case .watch(let id): return "watch-\(id)"
        case .premiere(let id): return "premiere-\(id)"
        }
    }
}

struct TitleDetailView: View {
    @StateObject private var model: TitleDetailViewModel
    @Environment(\.appContainer) private var container
    @Environment(\.openURL) private var openURL
    @State private var route: CinemaRoute?
    @State private var giftOpen = false
    @State private var giftEmail = ""

    init(titleId: String, container: AppContainer) {
        _model = StateObject(wrappedValue: TitleDetailViewModel(
            titleId: titleId,
            api: container.catalogueAPI,
            commerce: container.commerceAPI,
            ticketStore: container.ticketStore,
            session: container.session))
    }

    var body: some View {
        ScrollView {
            if let t = model.title {
                VStack(alignment: .leading, spacing: 16) {
                    banner(t)
                    VStack(alignment: .leading, spacing: 14) {
                        if let notice = model.notice { SuccessBanner(message: notice) }
                        if let error = model.error { ErrorBanner(message: error) }
                        meta(t)
                        Text(t.overview).foregroundStyle(Theme.Colors.textPrimary)
                        actions(t)
                        if giftOpen { giftPanel(t) }
                        details(t)
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            } else if let error = model.error {
                ErrorBanner(message: error).padding()
            } else {
                ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 100)
            }
        }
        .scrollIndicators(.hidden)
        .navigationTitle(model.title?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onChange(of: model.giftCheckoutURL) { _, url in if let url { openURL(url) } }
        .fullScreenCover(item: $route) { route in
            NavigationStack {
                Group {
                    switch route {
                    case .watch(let id): WatchView(titleId: id, container: container)
                    case .premiere(let id): PremiereView(titleId: id, container: container)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") { self.route = nil }
                    }
                }
            }
        }
    }

    private func banner(_ t: CatalogueTitle) -> some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.06, blue: 0.19), Color(red: 0.23, green: 0.06, blue: 0.13)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            if let urlString = t.heroUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
            }
            LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                if t.premiere {
                    Text(t.isLiveNow ? "● LIVE PREMIERE" : "PREMIERE")
                        .font(.caption2.bold())
                        .foregroundStyle(t.isLiveNow ? .red : .white.opacity(0.9))
                }
                Text(t.title).font(.largeTitle.bold()).foregroundStyle(.white)
            }
            .padding(16)
        }
        .frame(height: 240)
        .clipped()
    }

    private func meta(_ t: CatalogueTitle) -> some View {
        HStack(spacing: 10) {
            Text(t.type.capitalized)
            Text(String(t.year))
            if t.rating > 0 { Text("★ \(String(format: "%.1f", t.rating))") }
            if let m = t.maturityRating {
                Text(m).padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            if let r = t.runtimeMinutes { Text("\(r) min") }
            Text(t.formattedPrice).foregroundStyle(Theme.Colors.textPrimary).fontWeight(.semibold)
        }
        .font(.caption)
        .foregroundStyle(Theme.Colors.textSecondary)
    }

    @ViewBuilder private func actions(_ t: CatalogueTitle) -> some View {
        HStack(spacing: 12) {
            if model.hasAccess {
                PrimaryButton(title: t.premiere ? "▶  Enter premiere" : "▶  Watch") {
                    route = t.premiere ? .premiere(t.id) : .watch(t.id)
                }
            } else {
                PrimaryButton(title: buyTitle(t), isLoading: model.buying) {
                    Task {
                        let ok = await model.buyTicket()
                        if ok { route = t.premiere ? .premiere(t.id) : .watch(t.id) }
                    }
                }
            }
            GlassButton(title: "🎁 Gift") { giftOpen.toggle() }
                .frame(maxWidth: 120)
        }
    }

    private func buyTitle(_ t: CatalogueTitle) -> String {
        if t.price <= 0 { return "🎟️  Watch free" }
        if t.premiere && !t.isLiveNow { return "🎟️  Reserve · \(t.formattedPrice)" }
        return "🎟️  Buy ticket · \(t.formattedPrice)"
    }

    private func giftPanel(_ t: CatalogueTitle) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Gift this ticket to another member — they can watch it once.")
                    .font(.caption).foregroundStyle(Theme.Colors.textSecondary)
                GlassField(title: "Recipient email", text: $giftEmail,
                           keyboard: .emailAddress, textContentType: .emailAddress)
                HStack {
                    PrimaryButton(title: "Send gift · \(t.formattedPrice)", isLoading: model.buying) {
                        Task { await model.gift(to: giftEmail.trimmingCharacters(in: .whitespaces)) }
                    }
                    GlassButton(title: "Cancel") { giftOpen = false }
                }
            }
            .padding(14)
        }
    }

    private func details(_ t: CatalogueTitle) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let d = t.director { detailRow("Director", d) }
            detailRow("Genres", t.genres.joined(separator: ", "))
            if !t.cast.isEmpty { detailRow("Cast", t.cast.joined(separator: ", ")) }
        }
        .padding(.top, 4)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            Text(value).font(.subheadline).foregroundStyle(Theme.Colors.textPrimary)
        }
    }
}
