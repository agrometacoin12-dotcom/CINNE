//
//  WatchlistView.swift
//  CinneTemple
//

import SwiftUI

struct WatchlistView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: WatchlistViewModel

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 12)]

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeWatchlistViewModel())
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.items.isEmpty {
                    ProgressView().tint(.white)
                } else if model.items.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(model.items) { entry in
                                if let summary = entry.title {
                                    VStack(spacing: 6) {
                                        NavigationLink(value: summary) {
                                            PosterCard(item: summary, width: 104)
                                        }
                                        .buttonStyle(.plain)
                                        Button("Remove") {
                                            Task { await model.remove(titleId: entry.titleId) }
                                        }
                                        .font(.caption2)
                                        .foregroundStyle(Theme.Colors.textSecondary)
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("My List")
            .navigationDestination(for: TitleSummary.self) {
                TitleDetailView(titleId: $0.id, container: container)
            }
            .task { await model.load() }
            .refreshable { await model.load() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bookmark")
                .font(.system(size: 44))
                .foregroundStyle(Theme.Colors.textSecondary)
            Text("Your list is empty")
                .font(.headline)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Add titles from any detail screen.")
                .font(.subheadline)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
    }
}
