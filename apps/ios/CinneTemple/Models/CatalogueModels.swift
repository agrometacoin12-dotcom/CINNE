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

    // Mobile-cinema commerce / premiere fields (optional for resilience against
    // older cached payloads; read via the convenience accessors below).
    let priceMinor: Int?
    let currency: String?
    let durationSeconds: Int?
    let isPremiere: Bool?
    let premiereStartAt: String?
    let premiereLive: Bool?
    let hasVideo: Bool?

    var price: Int { priceMinor ?? 0 }
    var displayCurrency: String { currency ?? "NGN" }
    var premiere: Bool { isPremiere ?? false }
    var isLiveNow: Bool { premiereLive ?? false }
    var canStream: Bool { hasVideo ?? false }

    var formattedPrice: String { CinemaFormatting.price(price, currency: displayCurrency) }

    var premiereDate: Date? {
        guard let s = premiereStartAt else { return nil }
        return ISO8601DateFormatter().date(from: s)
    }
}

/// Shared price/currency formatting for the mobile cinema.
enum CinemaFormatting {
    static func price(_ minor: Int, currency: String) -> String {
        if minor <= 0 { return "Free" }
        let major = Double(minor) / 100.0
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency
        return f.string(from: NSNumber(value: major)) ?? "\(currency) \(String(format: "%.2f", major))"
    }
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
