//
//  SearchView.swift
//  CinneTemple
//

import SwiftUI

struct SearchView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: SearchViewModel

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 12)]

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeSearchViewModel())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(model.results) { item in
                        NavigationLink(value: item) {
                            PosterCard(item: item, width: 104)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)

                if model.isSearching {
                    ProgressView().tint(.white).padding(.top, 20)
                } else if model.results.isEmpty && !model.query.isEmpty {
                    Text("No results for “\(model.query)”.")
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .padding(.top, 40)
                }
            }
            .scrollIndicators(.hidden)
            .navigationTitle("Search")
            .navigationDestination(for: TitleSummary.self) {
                TitleDetailView(titleId: $0.id, container: container)
            }
            .searchable(text: $model.query, prompt: "Movies and series")
        }
    }
}
