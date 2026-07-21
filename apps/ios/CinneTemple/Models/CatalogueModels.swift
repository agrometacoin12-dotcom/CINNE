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

/// Viewer-facing episode inside a season (mirrors episodeSummarySchema).
/// Raw video keys are never exposed — only `hasVideo`. `consumed` is present
/// only when the title-detail request carried a Bearer token.
struct EpisodeSummary: Codable, Identifiable, Hashable {
    let id: String
    let number: Int
    let name: String
    let overview: String?
    let runtimeMinutes: Int?
    let hasVideo: Bool
    let consumed: Bool?

    var isConsumed: Bool { consumed ?? false }
}

/// One season of a series (mirrors seasonSummarySchema).
struct SeasonSummary: Codable, Identifiable, Hashable {
    let id: String
    let number: Int
    let name: String?
    let episodes: [EpisodeSummary]

    /// Chip label: custom name when set, otherwise "Season N".
    var displayName: String { name?.isEmpty == false ? name! : "Season \(number)" }
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

    /// Present only on PUBLISHED series: the seasons/episodes tree. Optional so
    /// movie payloads (and older cached ones) decode exactly as before.
    let seasonsList: [SeasonSummary]?

    var price: Int { priceMinor ?? 0 }
    var displayCurrency: String { currency ?? "NGN" }
    var premiere: Bool { isPremiere ?? false }
    var isLiveNow: Bool { premiereLive ?? false }
    var canStream: Bool { hasVideo ?? false }

    var formattedPrice: String { CinemaFormatting.price(price, currency: displayCurrency) }

    /// Parsed via TicketDates: backend ISO-8601 dates usually carry fractional
    /// seconds, which the default formatter rejects.
    var premiereDate: Date? { TicketDates.parse(premiereStartAt) }

    // MARK: Series episode picker helpers

    var isSeries: Bool { type == "series" }

    /// Seasons with at least the shape the picker needs; empty for movies.
    var seasonList: [SeasonSummary] { seasonsList ?? [] }

    /// Any episode with a video at all (drives the series CTA enabled state).
    var hasPlayableEpisode: Bool {
        seasonList.contains { $0.episodes.contains { $0.hasVideo } }
    }

    /// The first playable, not-yet-watched episode across all seasons — the
    /// target of the entitled-series main CTA ("Play S<season> E<num>").
    var firstUnwatchedPlayable: (season: SeasonSummary, episode: EpisodeSummary)? {
        for season in seasonList {
            if let ep = season.episodes.first(where: { $0.hasVideo && !$0.isConsumed }) {
                return (season, ep)
            }
        }
        return nil
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
