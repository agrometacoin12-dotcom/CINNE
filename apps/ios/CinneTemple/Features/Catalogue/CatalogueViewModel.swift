//
//  CatalogueViewModel.swift
//  CinneTemple
//
//  Drives the Home/browse screen. Hydrates from the offline cache first, then
//  refreshes from the network (offline-first).
//

import Foundation
import Combine

@MainActor
final class CatalogueViewModel: ObservableObject {
    @Published var browse: BrowseResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private static let cacheKey = "browse"
    private let api: CatalogueAPI
    private let cache: OfflineCache

    init(api: CatalogueAPI, cache: OfflineCache) {
        self.api = api
        self.cache = cache
        self.browse = cache.load(BrowseResponse.self, for: Self.cacheKey)
    }

    func load() async {
        if browse == nil { isLoading = true }
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result = try await api.browse()
            browse = result
            cache.save(result, for: Self.cacheKey)
        } catch {
            // Keep showing cached content if we have it; otherwise surface error.
            if browse == nil {
                errorMessage = (error as? APIError)?.detail ?? "Could not load catalogue."
            }
        }
    }
}

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query = "" { didSet { scheduleSearch() } }
    @Published var results: [TitleSummary] = []
    @Published var isSearching = false

    private let api: CatalogueAPI
    private var task: Task<Void, Never>?

    init(api: CatalogueAPI) { self.api = api }

    private func scheduleSearch() {
        task?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { results = []; return }
        task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000) // debounce
            guard let self, !Task.isCancelled else { return }
            await self.run(q)
        }
    }

    private func run(_ q: String) async {
        isSearching = true
        defer { isSearching = false }
        if let res = try? await api.search(query: q) {
            results = res.results
        }
    }
}

@MainActor
final class WatchlistViewModel: ObservableObject {
    @Published var items: [WatchlistEntry] = []
    @Published var isLoading = false

    private let api: CatalogueAPI
    init(api: CatalogueAPI) { self.api = api }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        if let list = try? await api.watchlist() { items = list }
    }

    func remove(titleId: String) async {
        try? await api.removeFromWatchlist(titleId: titleId)
        items.removeAll { $0.titleId == titleId }
    }
}
