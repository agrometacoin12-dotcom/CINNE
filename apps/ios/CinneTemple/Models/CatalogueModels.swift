//
//  CatalogueModels.swift
//  CinneTemple
//
//  Codable models mirroring the backend catalogue contracts (packages/shared).
//

import Foundation
import SwiftUI

struct TitleSummary: Codable, Identifiable, Hashable {
    let id: String
    let type: String
    let title: String
    let year: Int
    let rating: Double
    let genres: [String]
    let posterUrl: String?

    /// Deterministic gradient used when no poster image is available.
    var gradient: [Color] {
        var hash = 0
        for scalar in id.unicodeScalars { hash = (hash &* 31 &+ Int(scalar.value)) % 360 }
        let h1 = Double(abs(hash)) / 360.0
        let h2 = Double(abs(hash + 40) % 360) / 360.0
        return [
            Color(hue: h1, saturation: 0.55, brightness: 0.34),
            Color(hue: h2, saturation: 0.6, brightness: 0.2),
        ]
    }
}

struct CatalogueTitle: Codable, Identifiable, Hashable {
    let id: String
    let type: String
    let title: String
    let year: Int
    let rating: Double
    let genres: [String]
    let posterUrl: String?
    let tagline: String?
    let overview: String
    let runtimeMinutes: Int?
    let seasons: Int?
    let maturityRating: String?
    let heroUrl: String?
    let cast: [String]
    let director: String?
    let categories: [String]
}

struct BrowseRow: Codable, Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let items: [TitleSummary]
}

struct BrowseResponse: Codable, Hashable {
    let hero: CatalogueTitle?
    let rows: [BrowseRow]
}

struct SearchResponse: Codable {
    let query: String
    let results: [TitleSummary]
}

struct WatchlistEntry: Codable, Identifiable, Hashable {
    var id: String { titleId }
    let titleId: String
    let addedAt: String
    let title: TitleSummary?
}
