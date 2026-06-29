//
//  WatchView.swift
//  CinneTemple
//
//  Authorizes playback (server enforces the entitlement + single-view window)
//  and presents the secure player, or a purchase prompt when there's no ticket.
//

import SwiftUI
import Combine

@MainActor
final class WatchViewModel: ObservableObject {
    @Published var session: PlaybackSession?
    @Published var error: String?
    @Published var denied = false
    @Published var loading = true

    private let commerce: CommerceAPI
    let titleId: String

    init(titleId: String, commerce: CommerceAPI) {
        self.titleId = titleId
        self.commerce = commerce
    }

    func start() async {
        loading = true
        defer { loading = false }
        do {
            session = try await commerce.playbackStart(titleId: titleId)
        } catch let e as APIError {
            error = e.detail
            denied = e.status == 403 || e.status == 404
        } catch {
            self.error = "Could not start playback."
        }
    }
}

struct WatchView: View {
    @StateObject private var model: WatchViewModel
    private let titleId: String

    init(titleId: String, container: AppContainer) {
        self.titleId = titleId
        _model = StateObject(wrappedValue: WatchViewModel(titleId: titleId, commerce: container.commerceAPI))
    }

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            if let session = model.session {
                VStack(spacing: 12) {
                    SecurePlayerView(session: session)
                        .padding(.horizontal, 8)
                    Text("Single-view ticket. Downloads, screenshots and screen recording aren’t permitted; your account is watermarked on the stream.")
                        .font(.caption2)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                    Spacer()
                }
                .padding(.top, 12)
            } else if model.denied {
                ContentUnavailableView {
                    Label("No ticket yet", systemImage: "ticket")
                } description: {
                    Text(model.error ?? "Purchase to watch this title.")
                }
            } else if let error = model.error {
                ErrorBanner(message: error).padding()
            } else {
                ProgressView().tint(.white)
            }
        }
        .navigationTitle(model.session?.title ?? "Now playing")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.start() }
    }
}
