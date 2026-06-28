//
//  HomeView.swift
//  CinneTemple
//
//  Netflix-style home backed by the live catalogue: featured hero + curated
//  rows, offline-first with pull-to-refresh. Tapping a poster opens detail.
//

import SwiftUI

struct HomeView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: CatalogueViewModel

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeCatalogueViewModel())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if let hero = model.browse?.hero {
                        heroView(hero)
                    }
                    ForEach(model.browse?.rows ?? []) { row in
                        rowView(row)
                    }
                    if model.browse == nil && model.isLoading {
                        ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 80)
                    }
                    if let error = model.errorMessage, model.browse == nil {
                        ErrorBanner(message: error).padding(.horizontal, 16)
                    }
                }
                .padding(.vertical, 12)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("CinneTemple")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: TitleSummary.self) { TitleDetailView(titleId: $0.id, container: container) }
            .navigationDestination(for: CatalogueTitle.self) { TitleDetailView(titleId: $0.id, container: container) }
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }

    private func heroView(_ hero: CatalogueTitle) -> some View {
        NavigationLink(value: hero) {
            GlassCard(cornerRadius: Theme.Radius.lg) {
                VStack(alignment: .leading, spacing: 8) {
                    if let tagline = hero.tagline {
                        Text(tagline.uppercased())
                            .font(.caption).fontWeight(.semibold)
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                    Text(hero.title)
                        .font(.largeTitle.bold())
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(hero.genres.prefix(3).joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.textSecondary)
                    Text(hero.overview)
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.textPrimary.opacity(0.9))
                        .lineLimit(3)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .frame(minHeight: 220)
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    private func rowView(_ row: BrowseRow) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(row.title)
                .font(.headline)
                .foregroundStyle(Theme.Colors.textPrimary)
                .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(row.items) { item in
                        NavigationLink(value: item) {
                            PosterCard(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}
