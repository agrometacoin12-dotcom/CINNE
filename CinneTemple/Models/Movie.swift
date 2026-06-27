//
//  Movie.swift
//  CinneTemple
//
//  The core data model for a film.
//

import SwiftUI

/// A single film in the CinneTemple catalogue.
struct Movie: Identifiable, Codable, Hashable {
    let id: UUID
    var title: String
    var year: Int
    var genres: [String]
    /// Runtime in minutes.
    var runtime: Int
    /// Average rating out of 10.
    var rating: Double
    var director: String
    var cast: [String]
    var overview: String
    /// Whether the film is currently showing in cinemas (vs. catalogue only).
    var nowShowing: Bool

    init(
        id: UUID = UUID(),
        title: String,
        year: Int,
        genres: [String],
        runtime: Int,
        rating: Double,
        director: String,
        cast: [String],
        overview: String,
        nowShowing: Bool = false
    ) {
        self.id = id
        self.title = title
        self.year = year
        self.genres = genres
        self.runtime = runtime
        self.rating = rating
        self.director = director
        self.cast = cast
        self.overview = overview
        self.nowShowing = nowShowing
    }

    /// A human-friendly runtime such as "2h 28m".
    var runtimeText: String {
        let hours = runtime / 60
        let minutes = runtime % 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }

    /// Rating formatted to one decimal place, e.g. "8.6".
    var ratingText: String {
        String(format: "%.1f", rating)
    }

    /// A short, comma-separated list of the headline genres.
    var genreSummary: String {
        genres.prefix(3).joined(separator: " · ")
    }

    /// A deterministic pair of colours used to render the placeholder poster,
    /// derived from the title so each film keeps a stable look.
    var posterColors: [Color] {
        let palette: [[Color]] = [
            [Color(red: 0.10, green: 0.12, blue: 0.28), Color(red: 0.45, green: 0.20, blue: 0.55)],
            [Color(red: 0.55, green: 0.13, blue: 0.20), Color(red: 0.92, green: 0.45, blue: 0.20)],
            [Color(red: 0.05, green: 0.25, blue: 0.30), Color(red: 0.10, green: 0.55, blue: 0.55)],
            [Color(red: 0.12, green: 0.16, blue: 0.45), Color(red: 0.30, green: 0.50, blue: 0.85)],
            [Color(red: 0.30, green: 0.10, blue: 0.30), Color(red: 0.70, green: 0.25, blue: 0.45)],
            [Color(red: 0.20, green: 0.22, blue: 0.10), Color(red: 0.60, green: 0.55, blue: 0.20)],
            [Color(red: 0.10, green: 0.10, blue: 0.14), Color(red: 0.35, green: 0.35, blue: 0.45)],
            [Color(red: 0.40, green: 0.15, blue: 0.10), Color(red: 0.80, green: 0.40, blue: 0.25)]
        ]
        let index = abs(title.hashValue) % palette.count
        return palette[index]
    }

    /// Initials used as a typographic motif on the placeholder poster.
    var posterInitials: String {
        let words = title.split(separator: " ")
        let letters = words.prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }
}
