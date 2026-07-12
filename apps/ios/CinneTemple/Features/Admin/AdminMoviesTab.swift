//
//  AdminMoviesTab.swift
//  CinneTemple
//
//  Studio > Movies: stats header cards + the full catalogue (drafts included)
//  with status pills, one-tap feature toggle, and row-tap editing.
//

import SwiftUI
import Combine

@MainActor
final class AdminMoviesModel: ObservableObject {
    @Published var stats: AdminStats?
    @Published var movies: [AdminTitle] = []
    @Published var loading = false
    @Published var error: String?
    @Published var togglingId: String?

    let api: AdminAPI
    private var loaded = false

    init(api: AdminAPI) { self.api = api }

    func loadIfNeeded() async {
        guard !loaded else { return }
        await load()
    }

    func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            async let s = api.stats()
            async let m = api.movies()
            stats = try await s
            movies = try await m
            loaded = true
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    /// PUT featured. featured:true atomically un-features every other title,
    /// so refresh the whole list afterwards.
    func toggleFeatured(_ movie: AdminTitle) async {
        guard togglingId == nil else { return }
        togglingId = movie.id
        defer { togglingId = nil }
        do {
            _ = try await api.setFeatured(id: movie.id, featured: !movie.isFeatured)
            movies = try await api.movies()
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }
}

struct AdminMoviesTab: View {
    @ObservedObject var model: AdminMoviesModel

    private enum EditorTarget: Identifiable {
        case create
        case edit(AdminTitle)
        var id: String {
            switch self {
            case .create: return "create"
            case .edit(let m): return m.id
            }
        }
    }

    @State private var editorTarget: EditorTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let error = model.error { ErrorBanner(message: error) }

                statsHeader

                HStack {
                    Text("Titles")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                    Spacer()
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        editorTarget = .create
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                            Text("New Title")
                        }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .liquidGlass(cornerRadius: 18, tint: Theme.Colors.brand)
                    }
                    .buttonStyle(PressableButtonStyle())
                }

                if model.loading && model.movies.isEmpty {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                } else if model.movies.isEmpty {
                    AdminEmptyState(icon: "film", message: "No titles yet. Create your first one.")
                } else {
                    VStack(spacing: 10) {
                        ForEach(model.movies) { movie in
                            movieRow(movie)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.load() }
        .task { await model.loadIfNeeded() }
        .sheet(item: $editorTarget) { target in
            switch target {
            case .create:
                AdminMovieEditorView(api: model.api, movie: nil) {
                    Task { await model.load() }
                }
            case .edit(let movie):
                AdminMovieEditorView(api: model.api, movie: movie) {
                    Task { await model.load() }
                }
            }
        }
    }

    // MARK: Stats

    private var statsHeader: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                AdminStatCard(label: "Users", value: statText { String($0.users) })
                AdminStatCard(label: "Titles", value: statText { String($0.titles) })
                AdminStatCard(label: "Published", value: statText { String($0.published) })
                AdminStatCard(label: "Tickets", value: statText { String($0.purchases) })
                AdminStatCard(label: "Revenue", value: statText { AdminFormat.naira($0.nairaRevenueMinor) })
            }
        }
        .scrollIndicators(.hidden)
    }

    private func statText(_ transform: (AdminStats) -> String) -> String {
        guard let stats = model.stats else { return "—" }
        return transform(stats)
    }

    // MARK: Row

    private func movieRow(_ movie: AdminTitle) -> some View {
        Button {
            editorTarget = .edit(movie)
        } label: {
            HStack(spacing: 12) {
                posterThumb(movie)

                VStack(alignment: .leading, spacing: 5) {
                    Text(movie.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(metaLine(movie))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .lineLimit(1)
                    pillRow(movie)
                }

                Spacer(minLength: 8)

                // Feature toggle — exactly one browse hero at most.
                Button {
                    Task { await model.toggleFeatured(movie) }
                } label: {
                    if model.togglingId == movie.id {
                        ProgressView().tint(.white).controlSize(.small)
                            .frame(width: 34, height: 34)
                    } else {
                        Image(systemName: movie.isFeatured ? "star.fill" : "star")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(movie.isFeatured ? Theme.Colors.star : Theme.Colors.textSecondary)
                            .frame(width: 34, height: 34)
                            .background(.white.opacity(0.05), in: Circle())
                    }
                }
                .buttonStyle(PressableButtonStyle())
                .disabled(model.togglingId != nil)

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(12)
            .liquidGlass(cornerRadius: Theme.Radius.md)
        }
        .buttonStyle(.plain)
    }

    private func posterThumb(_ movie: AdminTitle) -> some View {
        Group {
            if let s = movie.posterUrl, let url = URL(string: s) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(Theme.Colors.bgElevated)
                }
            } else {
                ZStack {
                    Rectangle().fill(Theme.Colors.bgElevated)
                    Image(systemName: "film")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
        .frame(width: 44, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(.white.opacity(0.18), lineWidth: 1)
        )
    }

    private func metaLine(_ movie: AdminTitle) -> String {
        var parts: [String] = []
        if let year = movie.year { parts.append(String(year)) }
        parts.append((movie.type ?? "movie").capitalized)
        parts.append(AdminFormat.price(movie.priceMinor ?? 0))
        return parts.joined(separator: " • ")
    }

    private func pillRow(_ movie: AdminTitle) -> some View {
        HStack(spacing: 5) {
            AdminPill(
                text: movie.isPublished ? "PUBLISHED" : "DRAFT",
                color: movie.isPublished ? Color(hex: 0x34D399) : Theme.Colors.textSecondary
            )
            if movie.isFeatured {
                AdminPill(text: "FEATURED", color: Theme.Colors.indigoBright)
            }
            if movie.premiere {
                AdminPill(text: "PREMIERE", color: Color(hex: 0xC084FC))
            }
            if movie.missingVideo {
                AdminPill(text: "NO VIDEO", color: Color(hex: 0xF87171))
            }
        }
    }
}
