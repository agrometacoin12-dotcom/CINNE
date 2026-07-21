//
//  WatchView.swift
//  CinneTemple
//
//  Authorizes playback (server enforces the entitlement + single-view window)
//  and presents the secure player. Start failures map to the watch-once
//  contract: 403 no-access → used-ticket / buy-ticket state with a repurchase
//  CTA, 403 "Premiere begins <ISO>" → countdown, 404 → not available yet.
//

import SwiftUI
import Combine

@MainActor
final class WatchViewModel: ObservableObject {

    /// Full-screen states for a refused playback start.
    enum Denial: Equatable {
        /// 403 no-access after a previously started/consumed ticket.
        case ticketUsed
        /// 403 no-access with no prior viewing — never bought (or gift pending).
        case needsTicket(detail: String)
        /// 403 "Premiere begins <ISO>" — show a countdown, no purchase CTA here.
        case premiereCountdown(startISO: String?, detail: String)
        /// 404 — unpublished / no video yet / source unavailable. No CTA.
        case notAvailable(detail: String)
        /// 403 on an episode start — consumed or window closed. Watch-once is
        /// per episode, so no repurchase CTA; the server message explains.
        case episodeUnavailable(detail: String)
    }

    @Published var session: PlaybackSession?
    @Published var error: String?
    @Published var denial: Denial?
    @Published var loading = true
    @Published var purchasing = false
    @Published var purchaseError: String?
    @Published var checkout: CheckoutSession?
    /// Friendly alert for an episode 403 on start ("This episode has already
    /// been watched." / window closed) — shown once, then the player closes.
    @Published var episodeAlert: String?
    @Published private(set) var reporter: PlaybackProgressReporter?

    private let commerce: CommerceAPI
    private let catalogue: CatalogueAPI
    private let client: APIClient
    private weak var tokenProvider: TokenProviding?
    let titleId: String
    /// Set when playing one episode of a series; nil keeps the movie flow.
    let episodeId: String?
    let resumeSeconds: Int?

    init(titleId: String,
         episodeId: String?,
         resumeSeconds: Int?,
         commerce: CommerceAPI,
         catalogue: CatalogueAPI,
         client: APIClient,
         tokenProvider: TokenProviding?) {
        self.titleId = titleId
        self.episodeId = episodeId
        self.resumeSeconds = resumeSeconds
        self.commerce = commerce
        self.catalogue = catalogue
        self.client = client
        self.tokenProvider = tokenProvider
    }

    func start() async {
        loading = true
        error = nil
        denial = nil
        defer { loading = false }
        do {
            let started = try await commerce.playbackStart(titleId: titleId, episodeId: episodeId)
            session = started
            reporter = PlaybackProgressReporter(
                titleId: titleId,
                episodeId: started.episodeId ?? episodeId,
                fallbackDurationSeconds: started.durationSeconds,
                tokenProvider: tokenProvider
            )
        } catch let e as APIError {
            await classify(e)
        } catch {
            self.error = "Could not start playback."
        }
    }

    /// Maps the problem+json start failure onto the watch-once states.
    private func classify(_ e: APIError) async {
        switch e.status {
        case 403 where e.detail.hasPrefix("Premiere begins"):
            let iso = e.detail
                .replacingOccurrences(of: "Premiere begins", with: "")
                .trimmingCharacters(in: .whitespaces)
            denial = .premiereCountdown(startISO: iso.isEmpty ? nil : iso, detail: e.detail)
        case 403 where episodeId != nil
            && (e.detail.localizedCaseInsensitiveContains("already been watched")
                || e.detail.localizedCaseInsensitiveContains("viewing window")):
            // Per-episode watch-once refusal only. A 403 for a missing/consumed
            // SERIES entitlement falls through to the entitlement path below,
            // which keeps the repurchase CTA (parity with Android).
            denial = .episodeUnavailable(detail: e.detail)
            episodeAlert = e.detail
        case 403:
            // "No active access to this title. Purchase to watch." — decide
            // between used-up and never-bought from the entitlement history.
            let history = (try? await commerce.entitlements()) ?? []
            let usedBefore = history.contains {
                $0.titleId == titleId &&
                ($0.status == "CONSUMED" || $0.status == "EXPIRED" || $0.startedAt != nil)
            }
            denial = usedBefore ? .ticketUsed : .needsTicket(detail: e.detail)
        case 404:
            denial = .notAvailable(detail: e.detail)
        default:
            error = e.detail
        }
    }

    /// Buys a fresh single-view ticket through the shared checkout flow
    /// (instant grant for free titles, native mock sheet / Safari otherwise),
    /// then retries playback.
    func repurchase() async {
        guard !purchasing else { return }
        purchasing = true
        purchaseError = nil
        defer { purchasing = false }
        do {
            let title = try await catalogue.title(id: titleId)
            switch try await CheckoutFlow.begin(title: title, commerce: commerce, client: client) {
            case .entitled, .giftSent:
                await start()
            case .checkout(let session):
                checkout = session
            }
        } catch let e as APIError {
            purchaseError = e.detail
        } catch {
            purchaseError = "Could not start the purchase."
        }
    }
}

struct WatchView: View {
    @StateObject private var model: WatchViewModel
    @Environment(\.dismiss) private var dismiss

    init(titleId: String, episodeId: String? = nil, container: AppContainer, resumeSeconds: Int? = nil) {
        _model = StateObject(wrappedValue: WatchViewModel(
            titleId: titleId,
            episodeId: episodeId,
            resumeSeconds: resumeSeconds,
            commerce: container.commerceAPI,
            catalogue: container.catalogueAPI,
            client: container.apiClient,
            tokenProvider: container.session
        ))
    }

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            if let session = model.session {
                VStack(spacing: 12) {
                    SecurePlayerView(session: session,
                                     reporter: model.reporter,
                                     resumeSeconds: model.resumeSeconds)
                        .padding(.horizontal, 8)
                    Text("Single-view ticket. Downloads, screenshots and screen recording aren’t permitted; your account is watermarked on the stream.")
                        .font(.caption2)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                    Spacer()
                }
                .padding(.top, 12)
            } else if let denial = model.denial {
                denialView(denial)
            } else if let error = model.error {
                ErrorBanner(message: error).padding()
            } else {
                ProgressView().tint(.white)
            }
        }
        .navigationTitle(model.session?.displayTitle ?? "Now playing")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.start() }
        .sheet(item: $model.checkout) { session in
            CheckoutSheetView(session: session) { paid, _ in
                model.checkout = nil
                if paid { Task { await model.start() } }
            }
        }
        // Episode watch-once refusal: friendly alert, then close the player so
        // the refreshed title detail shows the updated consumed state.
        .alert(
            "Episode unavailable",
            isPresented: Binding(
                get: { model.episodeAlert != nil },
                set: { if !$0 { model.episodeAlert = nil } }
            )
        ) {
            Button("OK") {
                model.episodeAlert = nil
                dismiss()
            }
        } message: {
            Text(model.episodeAlert ?? "This episode has already been watched.")
        }
    }

    // MARK: - Watch-once denial states

    @ViewBuilder
    private func denialView(_ denial: WatchViewModel.Denial) -> some View {
        VStack(spacing: 14) {
            Spacer()
            switch denial {
            case .ticketUsed:
                stateHeader(icon: "ticket.fill",
                            title: "Single view used",
                            message: "You’ve used your single view — buy another ticket to rewatch.")
                purchaseCTA(label: "Buy another ticket")

            case .needsTicket(let detail):
                stateHeader(icon: "ticket",
                            title: "No ticket yet",
                            message: detail)
                purchaseCTA(label: "Buy a ticket")

            case .premiereCountdown(let startISO, let detail):
                stateHeader(icon: "sparkles.tv",
                            title: "Premiere hasn’t started",
                            message: startISO == nil ? detail : "This title unlocks for ticket holders when the premiere goes live.")
                if let startISO {
                    VStack(spacing: 6) {
                        Text("Premiere begins in")
                            .font(.subheadline)
                            .foregroundStyle(Theme.Colors.textSecondary)
                        CountdownText(iso: startISO)
                    }
                    .padding(.top, 2)
                }

            case .notAvailable(let detail):
                stateHeader(icon: "film.stack",
                            title: "Not available yet",
                            message: detail)

            case .episodeUnavailable(let detail):
                stateHeader(icon: "checkmark.seal.fill",
                            title: "Episode unavailable",
                            message: detail)
            }

            if let purchaseError = model.purchaseError {
                ErrorBanner(message: purchaseError)
                    .padding(.horizontal, 24)
            }
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func stateHeader(icon: String, title: String, message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(Theme.Colors.indigoLight)
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)
        }
    }

    private func purchaseCTA(label: String) -> some View {
        Button {
            Task { await model.repurchase() }
        } label: {
            Group {
                if model.purchasing {
                    ProgressView().tint(.white)
                } else {
                    Text(label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .liquidGlass(cornerRadius: 13, tint: Theme.Colors.brand)
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(model.purchasing)
        .padding(.horizontal, 24)
        .padding(.top, 8)
    }
}
