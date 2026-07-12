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
    @Published var playbackStatus: PlaybackStatus?
    @Published var buying = false
    @Published var error: String?
    @Published var notice: String?
    @Published var checkout: CheckoutSession?

    private let api: CatalogueAPI
    private let commerce: CommerceAPI
    private let client: APIClient
    let ticketStore: TicketStore
    private let session: SessionStore
    let titleId: String

    init(titleId: String, api: CatalogueAPI, commerce: CommerceAPI, client: APIClient, ticketStore: TicketStore, session: SessionStore) {
        self.titleId = titleId
        self.api = api
        self.commerce = commerce
        self.client = client
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
            playbackStatus = status
            hasAccess = status.hasAccess
        }
    }

    // MARK: CTA state (playback status first, title fields as fallback)

    var isPremiere: Bool { playbackStatus?.premiere ?? title?.premiere ?? false }
    var isPremiereLive: Bool { playbackStatus?.premiereLive ?? title?.isLiveNow ?? false }

    var premiereStartDate: Date? {
        // TicketDates handles the fractional seconds backend timestamps carry.
        TicketDates.parse(playbackStatus?.premiereStartAt ?? title?.premiereStartAt)
    }

    /// Upcoming premiere: scheduled in the future and not yet live.
    var premiereCountdownDate: Date? {
        guard isPremiere, !isPremiereLive, let date = premiereStartDate, date > Date() else { return nil }
        return date
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

    /// Buy the viewer's own pay-once/watch-once ticket via POST /v1/purchases.
    /// Free titles entitle instantly; paid titles present the native checkout
    /// sheet (mock driver) or an in-app Safari checkout (future Paystack).
    /// Returns true only when the viewer is entitled right away.
    func buyTicket() async -> Bool {
        guard let t = title else { return false }
        buying = true
        error = nil
        defer { buying = false }
        do {
            switch try await CheckoutFlow.begin(title: t, commerce: commerce, client: client) {
            case .entitled:
                hasAccess = true
                return true
            case .checkout(let session):
                checkout = session
                return false
            case .giftSent:
                return false
            }
        } catch {
            self.error = (error as? APIError)?.detail ?? "Purchase failed."
            return false
        }
    }

    /// Gift a single-view ticket to another member by email through the same
    /// checkout flow (native mock sheet / Safari for real PSPs).
    func gift(to email: String) async {
        guard let t = title, !email.isEmpty else { return }
        buying = true
        error = nil
        notice = nil
        defer { buying = false }
        do {
            switch try await CheckoutFlow.begin(title: t, beneficiaryEmail: email, commerce: commerce, client: client) {
            case .entitled, .giftSent:
                notice = "Gift sent to \(email). They can watch it now."
            case .checkout(let session):
                checkout = session
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
    @Environment(\.dismiss) private var dismiss
    @State private var route: CinemaRoute?
    @State private var showGiftPrompt = false
    @State private var giftEmail = ""

    init(titleId: String, container: AppContainer) {
        _model = StateObject(wrappedValue: TitleDetailViewModel(
            titleId: titleId,
            api: container.catalogueAPI,
            commerce: container.commerceAPI,
            client: container.apiClient,
            ticketStore: container.ticketStore,
            session: container.session))
    }

    var body: some View {
        ZStack(alignment: .top) {
            Theme.Colors.bgBase.ignoresSafeArea()
            ScrollView {
                if let t = model.title {
                    VStack(alignment: .leading, spacing: 0) {
                        hero(t)
                        content(t).padding(.horizontal, 16).padding(.top, -24)
                    }
                    .padding(.bottom, 40)
                } else if let error = model.error {
                    ErrorBanner(message: error).padding()
                } else {
                    ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 200)
                }
            }
            .scrollIndicators(.hidden)
            .ignoresSafeArea(edges: .top)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await model.load() }
        .sheet(item: $model.checkout) { session in
            CheckoutSheetView(session: session) { paid, watchNow in
                if paid {
                    if session.isGift {
                        model.notice = "Gift sent\(session.beneficiaryEmail.map { " to \($0)" } ?? ""). They can watch it now."
                    } else {
                        model.hasAccess = true
                    }
                }
                model.checkout = nil
                if watchNow {
                    route = model.isPremiere ? .premiere(session.titleId) : .watch(session.titleId)
                }
            }
        }
        .alert("Gift this title", isPresented: $showGiftPrompt) {
            TextField("Recipient's email", text: $giftEmail)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
            Button("Send gift") {
                Task { await model.gift(to: giftEmail.trimmingCharacters(in: .whitespacesAndNewlines)) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They'll get a single-view ticket on their CinneTemple account.")
        }
        .fullScreenCover(item: $route) { route in
            NavigationStack {
                Group {
                    switch route {
                    case .watch(let id): WatchView(titleId: id, container: container)
                    case .premiere(let id): PremiereView(titleId: id, container: container)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Close") { self.route = nil } }
                }
            }
        }
    }

    // MARK: Hero

    private func hero(_ t: CatalogueTitle) -> some View {
        ZStack(alignment: .top) {
            Group {
                if let s = t.heroUrl, let url = URL(string: s) {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: {
                        LinearGradient(colors: [Theme.Colors.indigoDeep.opacity(0.55), Theme.Colors.bgBase], startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                } else {
                    LinearGradient(colors: [Theme.Colors.indigoDeep.opacity(0.55), Theme.Colors.bgBase], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
            .frame(height: 470).frame(maxWidth: .infinity).clipped()

            LinearGradient(
                stops: [.init(color: Theme.Colors.bgBase.opacity(0), location: 0),
                        .init(color: Theme.Colors.bgBase.opacity(0.9), location: 0.75),
                        .init(color: Theme.Colors.bgBase, location: 1)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 300).frame(maxWidth: .infinity).offset(y: 170)

            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 16)).foregroundStyle(.white)
                        .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                }
                Spacer()
                Button { Task { await model.toggleWatchlist() } } label: {
                    Image(systemName: model.inWatchlist ? "heart.fill" : "heart").font(.system(size: 16)).foregroundStyle(.white)
                        .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                }
            }
            .padding(.horizontal, 16).padding(.top, 60)
        }
        .frame(height: 470)
    }

    // MARK: Content

    private func content(_ t: CatalogueTitle) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let notice = model.notice { SuccessBanner(message: notice).padding(.bottom, 12) }
            if let error = model.error { ErrorBanner(message: error).padding(.bottom, 12) }

            Text(t.title).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
            Text(metaText(t)).font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.6)).padding(.top, 6)
            if t.rating > 0 {
                Text("★ \(String(format: "%.1f", t.rating))/10  IMDb")
                    .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.Colors.indigoLight).padding(.top, 6)
            }

            // Upcoming premiere: live countdown chip above the CTA.
            if let premiereDate = model.premiereCountdownDate {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    HStack(spacing: 6) {
                        Image(systemName: "clock").font(.system(size: 12))
                        Text(countdownText(until: premiereDate, now: context.date))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 36).foregroundStyle(Theme.Colors.indigoLight)
                    .liquidGlass(cornerRadius: 10)
                }
                .padding(.top, 16)
            }

            // Single-view policy: one CTA, no downloads of paid video.
            Button {
                if model.hasAccess { route = model.isPremiere ? .premiere(t.id) : .watch(t.id) }
                else { Task { if await model.buyTicket() { route = model.isPremiere ? .premiere(t.id) : .watch(t.id) } } }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "play.fill").font(.system(size: 12))
                    Text(model.buying ? "…" : playLabel(t)).font(.system(size: 14, weight: .semibold))
                }
                .frame(maxWidth: .infinity).frame(height: 46).foregroundStyle(.white)
                .liquidGlass(cornerRadius: 12, tint: Theme.Colors.brand)
            }
            .buttonStyle(PressableButtonStyle())
            .padding(.top, model.premiereCountdownDate == nil ? 16 : 8)

            // Gift a single-view ticket to another member (same checkout flow).
            if model.isAuthenticated {
                Button {
                    giftEmail = ""
                    showGiftPrompt = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "gift").font(.system(size: 12))
                        Text("Send as a gift").font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(Theme.Colors.indigoLight)
                }
                .buttonStyle(PressableButtonStyle())
                .padding(.top, 14)
            }

            Text("Storyline").font(.system(size: 16, weight: .medium)).foregroundStyle(.white).padding(.top, 28)
            Text(t.overview).font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.65)).lineSpacing(4).padding(.top, 12)

            if !t.cast.isEmpty {
                Text("Cast").font(.system(size: 16, weight: .medium)).foregroundStyle(.white).padding(.top, 28)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
                    ForEach(t.cast.prefix(8), id: \.self) { c in
                        Text(castInitials(c)).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                            .frame(width: 44, height: 44).liquidGlass(cornerRadius: 22)
                    }
                }
                .padding(.top, 16)
            }
        }
    }

    /// CTA text from playback status: entitled -> watch; free -> play;
    /// otherwise buy a pay-once watch-once ticket at the Naira price.
    private func playLabel(_ t: CatalogueTitle) -> String {
        if model.hasAccess { return model.isPremiere && !model.isPremiereLive ? "Enter Premiere" : "Play Now" }
        if t.price <= 0 { return "Play Now" }
        return "Get ticket  •  \(t.formattedPrice)"
    }

    private func countdownText(until date: Date, now: Date) -> String {
        let s = max(Int(date.timeIntervalSince(now)), 0)
        let d = s / 86400
        let h = (s % 86400) / 3600
        let m = (s % 3600) / 60
        if d > 0 { return "Premieres in \(d)d \(h)h" }
        if h > 0 { return "Premieres in \(h)h \(m)m" }
        return "Premieres in \(max(m, 1))m"
    }

    private func metaText(_ t: CatalogueTitle) -> String {
        var parts = [String(t.year)]
        if !t.genres.isEmpty { parts.append(t.genres.prefix(2).joined(separator: ", ")) }
        if let r = t.runtimeMinutes, r > 0 { parts.append("\(r / 60)h \(r % 60)m") }
        if let m = t.maturityRating { parts.append(m) }
        return parts.joined(separator: "  •  ")
    }

    private func castInitials(_ name: String) -> String {
        name.split(separator: " ").compactMap { $0.first }.prefix(2).map(String.init).joined().uppercased()
    }
}
