//
//  SearchView.swift
//  CinneTemple
//
//  Search — exact Figma (node 42:13705): glass search field, Recent glass chips,
//  and a Trending Now 2-column poster grid.
//

import SwiftUI

struct SearchView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: SearchViewModel
    @State private var trending: [TitleSummary] = []

    private let recent = ["Spiderman", "Parasite", "Sci-Fi movies"]
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeSearchViewModel())
    }

    private var grid: [TitleSummary] { model.query.isEmpty ? trending : model.results }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.bgBase.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Search field
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundStyle(.white.opacity(0.6))
                            TextField("", text: $model.query, prompt: Text("Search for movies, shows....").foregroundColor(.white.opacity(0.6)))
                                .font(.system(size: 13)).foregroundStyle(.white).tint(Theme.Colors.brand)
                                .autocorrectionDisabled().textInputAutocapitalization(.never)
                        }
                        .padding(.horizontal, 15).frame(height: 44)
                        .liquidGlass(cornerRadius: 11.5)

                        if model.query.isEmpty {
                            Text("Recent").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).padding(.top, 24)
                            HStack(spacing: 10) {
                                ForEach(recent, id: \.self) { r in
                                    Button { model.query = r } label: {
                                        Text(r).font(.system(size: 12)).foregroundStyle(.white.opacity(0.85))
                                            .padding(.horizontal, 16).padding(.vertical, 8)
                                            .liquidGlass(cornerRadius: 20)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.top, 12)
                        }

                        Text(model.query.isEmpty ? "Trending Now" : "Results")
                            .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).padding(.top, 24)

                        if model.isSearching {
                            ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 20)
                        } else if model.results.isEmpty && !model.query.isEmpty {
                            VStack(spacing: 6) {
                                Text("🔍").font(.system(size: 34))
                                Text("No results for “\(model.query)”.").font(.system(size: 13)).foregroundStyle(.white.opacity(0.7))
                            }
                            .frame(maxWidth: .infinity).padding(.top, 40)
                        }

                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(grid) { item in
                                NavigationLink(value: item) { trendingTile(item) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 12)
                    }
                    .padding(.horizontal, 16).padding(.top, 12)
                }
                .scrollIndicators(.hidden)
                .navigationDestination(for: TitleSummary.self) { TitleDetailView(titleId: $0.id, container: container) }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { if trending.isEmpty, let b = try? await container.catalogueAPI.browse() { trending = b.rows.flatMap { $0.items } } }
        }
    }

    private func trendingTile(_ item: TitleSummary) -> some View {
        Group {
            if let s = item.posterUrl, let url = URL(string: s) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: {
                    LinearGradient(colors: item.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            } else {
                LinearGradient(colors: item.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .aspectRatio(2.0/3.0, contentMode: .fill)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.35), lineWidth: 1.3))
    }
}
