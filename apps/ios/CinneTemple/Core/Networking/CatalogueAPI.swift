//
//  CatalogueAPI.swift
//  CinneTemple
//
//  Typed wrapper over the catalogue & watchlist endpoints (Phase 2).
//

import Foundation

final class CatalogueAPI {
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func browse() async throws -> BrowseResponse {
        try await client.send("v1/catalogue/browse")
    }

    func title(id: String) async throws -> CatalogueTitle {
        try await client.send("v1/catalogue/titles/\(id)")
    }

    func search(query: String) async throws -> SearchResponse {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return try await client.send("v1/catalogue/search?q=\(encoded)")
    }

    func watchlist() async throws -> [WatchlistEntry] {
        try await client.send("v1/watchlist", authenticated: true)
    }

    func addToWatchlist(titleId: String) async throws {
        let _: Empty = try await client.send(
            "v1/watchlist", method: .post, body: AddToWatchlistBody(titleId: titleId),
            authenticated: true
        )
    }

    func removeFromWatchlist(titleId: String) async throws {
        let _: Empty = try await client.send(
            "v1/watchlist/\(titleId)", method: .delete, authenticated: true
        )
    }
}

private struct AddToWatchlistBody: Encodable {
    let titleId: String
}
