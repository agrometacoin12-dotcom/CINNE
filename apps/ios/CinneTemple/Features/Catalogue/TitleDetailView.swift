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
    @Published var error: String?

    private let api: CatalogueAPI
    private let session: SessionStore
    let titleId: String

    init(titleId: String, api: CatalogueAPI, session: SessionStore) {
        self.titleId = titleId
        self.api = api
        self.session = session
    }

    var isAuthenticated: Bool { session.phase == .authenticated }

    func load() async {
        do { title = try await api.title(id: titleId) }
        catch let err { self.error = (err as? APIError)?.detail ?? "Could not load title." }
        if isAuthenticated, let list = try? await api.watchlist() {
            inWatchlist = list.contains { $0.titleId == titleId }
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
}

struct TitleDetailView: View {
    @StateObject private var model: TitleDetailViewModel

    init(titleId: String, container: AppContainer) {
        _model = StateObject(wrappedValue: TitleDetailViewModel(
            titleId: titleId, api: container.catalogueAPI, session: container.session))
    }

    var body: some View {
        ScrollView {
            if let t = model.title {
                VStack(alignment: .leading, spacing: 16) {
                    banner(t)
                    VStack(alignment: .leading, spacing: 14) {
                        meta(t)
                        Text(t.overview)
                            .foregroundStyle(Theme.Colors.textPrimary)
                        actions
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
            Text(t.title).font(.largeTitle.bold()).foregroundStyle(.white).padding(16)
        }
        .frame(height: 240)
        .clipped()
    }

    private func meta(_ t: CatalogueTitle) -> some View {
        HStack(spacing: 10) {
            Text(t.type.capitalized)
            Text(String(t.year))
            Text("★ \(String(format: "%.1f", t.rating))")
            if let m = t.maturityRating {
                Text(m).padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            if let r = t.runtimeMinutes { Text("\(r) min") }
            if let s = t.seasons { Text("\(s) season\(s > 1 ? "s" : "")") }
        }
        .font(.caption)
        .foregroundStyle(Theme.Colors.textSecondary)
    }

    private var actions: some View {
        HStack(spacing: 12) {
            PrimaryButton(title: "▶  Play") {}
                .frame(maxWidth: 160)
            if model.isAuthenticated {
                GlassButton(title: model.inWatchlist ? "✓ My List" : "+ My List") {
                    Task { await model.toggleWatchlist() }
                }
                .frame(maxWidth: 160)
            }
        }
    }

    private func details(_ t: CatalogueTitle) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let d = t.director {
                detailRow("Director", d)
            }
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
