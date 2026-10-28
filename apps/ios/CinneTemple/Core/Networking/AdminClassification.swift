//
//  AdminClassification.swift
//  CinneTemple
//
//  Models for the admin classification endpoints
//  (`GET /v1/admin/taxonomy`, `GET/PUT /v1/admin/titles/:id/classification`)
//  plus the editable draft that turns edits into a minimal PUT body: only
//  changed keys are sent, cleared nullable fields are sent as JSON null.
//  See docs/content-classification.md ("Admin API").
//

import Foundation

// MARK: - Taxonomy

struct AdminTaxonomy: Codable, Hashable {
    struct Named: Codable, Hashable, Identifiable {
        let slug: String
        let name: String
        var id: String { slug }
    }

    struct Genre: Codable, Hashable, Identifiable {
        let slug: String
        let name: String
        let subgenres: [Named]
        var id: String { slug }

        init(slug: String, name: String, subgenres: [Named]) {
            self.slug = slug
            self.name = name
            self.subgenres = subgenres
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            slug = try c.decode(String.self, forKey: .slug)
            name = try c.decode(String.self, forKey: .name)
            subgenres = try c.decodeIfPresent([Named].self, forKey: .subgenres) ?? []
        }
    }

    /// `kind`: MOOD | THEME | SETTING | CHARACTER | STORY (tags),
    /// EDITORIAL | SYSTEM (collections).
    struct Kinded: Codable, Hashable, Identifiable {
        let slug: String
        let name: String
        let kind: String
        var id: String { slug }
    }

    struct Option: Codable, Hashable, Identifiable {
        let value: String
        let label: String
        var id: String { value }
    }

    struct Language: Codable, Hashable, Identifiable {
        let code: String
        let name: String
        var id: String { code }
    }

    let genres: [Genre]
    let tags: [Kinded]
    let industries: [Named]
    let collections: [Kinded]
    let formats: [Option]
    let audiences: [Option]
    let accessTypes: [Option]
    let languages: [Language]
    let decades: [String]

    /// Display order for tag groups.
    static let tagKindOrder = ["MOOD", "THEME", "SETTING", "CHARACTER", "STORY"]

    static func tagKindLabel(_ kind: String) -> String {
        switch kind {
        case "MOOD": return "Mood"
        case "THEME": return "Theme"
        case "SETTING": return "Setting"
        case "CHARACTER": return "Character"
        case "STORY": return "Story"
        default: return kind.capitalized
        }
    }

    /// Tags grouped by kind, known kinds first in `tagKindOrder`.
    var tagGroups: [(kind: String, tags: [Kinded])] {
        let kinds = Self.tagKindOrder + Set(tags.map(\.kind)).subtracting(Self.tagKindOrder).sorted()
        return kinds.compactMap { kind in
            let group = tags.filter { $0.kind == kind }
            return group.isEmpty ? nil : (kind, group)
        }
    }

    var editorialCollections: [Kinded] { collections.filter { $0.kind == "EDITORIAL" } }
    var systemCollections: [Kinded] { collections.filter { $0.kind == "SYSTEM" } }

    /// Display name for a genre or subgenre slug ("Horror › Psychological").
    func genreLabel(_ slug: String) -> String {
        for genre in genres {
            if genre.slug == slug { return genre.name }
            if let sub = genre.subgenres.first(where: { $0.slug == slug }) {
                return "\(genre.name) › \(sub.name)"
            }
        }
        return slug
    }

    /// Top-level genre slug for a genre or subgenre slug.
    func parentGenre(of slug: String) -> Genre? {
        genres.first { $0.slug == slug || $0.subgenres.contains(where: { $0.slug == slug }) }
    }

    func formatLabel(_ value: String) -> String {
        formats.first { $0.value == value }?.label ?? value
    }

    func accessLabel(_ value: String) -> String {
        accessTypes.first { $0.value == value }?.label ?? value
    }

    func languageName(_ code: String) -> String {
        languages.first { $0.code == code }?.name ?? code
    }

    init(genres: [Genre] = [], tags: [Kinded] = [], industries: [Named] = [],
         collections: [Kinded] = [], formats: [Option] = [], audiences: [Option] = [],
         accessTypes: [Option] = [], languages: [Language] = [], decades: [String] = []) {
        self.genres = genres
        self.tags = tags
        self.industries = industries
        self.collections = collections
        self.formats = formats
        self.audiences = audiences
        self.accessTypes = accessTypes
        self.languages = languages
        self.decades = decades
    }

    // Lenient: a missing list decodes as empty.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        genres = try c.decodeIfPresent([Genre].self, forKey: .genres) ?? []
        tags = try c.decodeIfPresent([Kinded].self, forKey: .tags) ?? []
        industries = try c.decodeIfPresent([Named].self, forKey: .industries) ?? []
        collections = try c.decodeIfPresent([Kinded].self, forKey: .collections) ?? []
        formats = try c.decodeIfPresent([Option].self, forKey: .formats) ?? []
        audiences = try c.decodeIfPresent([Option].self, forKey: .audiences) ?? []
        accessTypes = try c.decodeIfPresent([Option].self, forKey: .accessTypes) ?? []
        languages = try c.decodeIfPresent([Language].self, forKey: .languages) ?? []
        decades = try c.decodeIfPresent([String].self, forKey: .decades) ?? []
    }
}

// MARK: - Classification DTO

struct AdminClassification: Codable, Hashable {
    struct Industry: Codable, Hashable, Identifiable {
        let slug: String
        let name: String
        /// "manual" | "auto"
        let source: String
        var id: String { slug }
        var isAuto: Bool { source.lowercased() == "auto" }
    }

    struct Placement: Codable, Hashable, Identifiable {
        let slug: String
        let title: String
        let eligible: Bool
        let reason: String?
        var id: String { slug }
    }

    let titleId: String
    let type: String
    let contentFormat: String?
    let effectiveFormat: String
    let genres: [String]
    let tags: [String]
    let collections: [String]
    let industries: [Industry]
    let audience: String?
    let ageRating: String?
    let ratingJurisdiction: String?
    let releaseDate: String?
    let accessType: String?
    let effectiveAccess: String
    let productionCountries: [String]
    let originalLanguages: [String]
    let audioLanguages: [String]
    let availableFrom: String?
    let availableUntil: String?
    let seriesComplete: Bool
    let placement: [Placement]

    var isSeries: Bool { type == "series" }
    var autoIndustries: [Industry] { industries.filter(\.isAuto) }
    var manualIndustrySlugs: [String] { industries.filter { !$0.isAuto }.map(\.slug) }

    // Lenient on lists and booleans so a partially rolled-out backend still loads.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titleId = try c.decode(String.self, forKey: .titleId)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "movie"
        contentFormat = try c.decodeIfPresent(String.self, forKey: .contentFormat)
        effectiveFormat = try c.decodeIfPresent(String.self, forKey: .effectiveFormat)
            ?? contentFormat ?? (type == "series" ? "TV_SERIES" : "FEATURE_FILM")
        genres = try c.decodeIfPresent([String].self, forKey: .genres) ?? []
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
        collections = try c.decodeIfPresent([String].self, forKey: .collections) ?? []
        industries = try c.decodeIfPresent([Industry].self, forKey: .industries) ?? []
        audience = try c.decodeIfPresent(String.self, forKey: .audience)
        ageRating = try c.decodeIfPresent(String.self, forKey: .ageRating)
        ratingJurisdiction = try c.decodeIfPresent(String.self, forKey: .ratingJurisdiction)
        releaseDate = try c.decodeIfPresent(String.self, forKey: .releaseDate)
        accessType = try c.decodeIfPresent(String.self, forKey: .accessType)
        effectiveAccess = try c.decodeIfPresent(String.self, forKey: .effectiveAccess) ?? accessType ?? "PAY_PER_VIEW"
        productionCountries = try c.decodeIfPresent([String].self, forKey: .productionCountries) ?? []
        originalLanguages = try c.decodeIfPresent([String].self, forKey: .originalLanguages) ?? []
        audioLanguages = try c.decodeIfPresent([String].self, forKey: .audioLanguages) ?? []
        availableFrom = try c.decodeIfPresent(String.self, forKey: .availableFrom)
        availableUntil = try c.decodeIfPresent(String.self, forKey: .availableUntil)
        seriesComplete = try c.decodeIfPresent(Bool.self, forKey: .seriesComplete) ?? false
        placement = try c.decodeIfPresent([Placement].self, forKey: .placement) ?? []
    }
}

// MARK: - Draft

/// Editable copy of a classification. `payload(comparedTo:)` produces the
/// PUT body containing only what changed.
struct AdminClassificationDraft: Equatable {
    var contentFormat: String?
    /// Genre/subgenre slugs in selection order (the server keeps the order).
    var genres: [String]
    var tags: [String]
    var collections: [String]
    /// MANUAL industries only; AUTO ones are derived by the server.
    var manualIndustries: [String]
    var audience: String?
    var ageRating: String
    var ratingJurisdiction: String
    /// 'YYYY-MM-DD'
    var releaseDate: String?
    var accessType: String?
    var productionCountries: [String]
    var originalLanguages: [String]
    var audioLanguages: [String]
    /// ISO timestamps.
    var availableFrom: String?
    var availableUntil: String?
    var seriesComplete: Bool

    init(_ c: AdminClassification) {
        contentFormat = c.contentFormat
        genres = c.genres
        tags = c.tags
        collections = c.collections
        manualIndustries = c.manualIndustrySlugs
        audience = c.audience
        ageRating = c.ageRating ?? ""
        ratingJurisdiction = c.ratingJurisdiction ?? ""
        releaseDate = c.releaseDate.map { Self.dayString($0) }
        accessType = c.accessType
        productionCountries = c.productionCountries
        originalLanguages = c.originalLanguages
        audioLanguages = c.audioLanguages
        availableFrom = c.availableFrom
        availableUntil = c.availableUntil
        seriesComplete = c.seriesComplete
    }

    /// Only the keys whose values differ from `base`. Nullable fields that
    /// were cleared become `.null`. Genres are order-sensitive; other lists
    /// compare as sets. `seriesComplete` is only sent for series.
    func payload(comparedTo base: AdminClassificationDraft, isSeries: Bool) -> [String: JSONValue] {
        var f: [String: JSONValue] = [:]

        func nullable(_ key: String, _ value: String?, _ old: String?) {
            let v = Self.clean(value), o = Self.clean(old)
            guard v != o else { return }
            f[key] = v.map(JSONValue.string) ?? .null
        }
        func list(_ key: String, _ value: [String], _ old: [String], ordered: Bool = false) {
            let changed = ordered ? value != old : Set(value) != Set(old)
            guard changed else { return }
            f[key] = .array(value.map(JSONValue.string))
        }

        nullable("contentFormat", contentFormat, base.contentFormat)
        list("genres", genres, base.genres, ordered: true)
        list("tags", tags, base.tags)
        list("collections", collections, base.collections)
        list("industries", manualIndustries, base.manualIndustries)
        nullable("audience", audience, base.audience)
        nullable("ageRating", ageRating, base.ageRating)
        nullable("ratingJurisdiction", ratingJurisdiction, base.ratingJurisdiction)
        nullable("releaseDate", releaseDate, base.releaseDate)
        nullable("accessType", accessType, base.accessType)
        list("productionCountries", Self.codes(productionCountries, upper: true),
             Self.codes(base.productionCountries, upper: true))
        list("originalLanguages", Self.codes(originalLanguages, upper: false),
             Self.codes(base.originalLanguages, upper: false))
        list("audioLanguages", Self.codes(audioLanguages, upper: false),
             Self.codes(base.audioLanguages, upper: false))
        if !Self.sameInstant(availableFrom, base.availableFrom) {
            f["availableFrom"] = Self.clean(availableFrom).map(JSONValue.string) ?? .null
        }
        if !Self.sameInstant(availableUntil, base.availableUntil) {
            f["availableUntil"] = Self.clean(availableUntil).map(JSONValue.string) ?? .null
        }
        if isSeries, seriesComplete != base.seriesComplete {
            f["seriesComplete"] = .bool(seriesComplete)
        }
        return f
    }

    // MARK: Validation

    /// Human-readable problems that block saving (nil when valid).
    var validationError: String? {
        let badCountries = productionCountries.filter { !Self.isCountryCode($0) }
        if !badCountries.isEmpty {
            return "Production countries must be 2-letter ISO codes (e.g. NG, US): \(badCountries.joined(separator: ", "))."
        }
        if let from = AdminFormat.isoDate(availableFrom), let until = AdminFormat.isoDate(availableUntil),
           until <= from {
            return "“Available until” must be after “Available from”."
        }
        return nil
    }

    static func isCountryCode(_ s: String) -> Bool {
        s.count == 2 && s.allSatisfy { $0.isASCII && $0.isLetter }
    }

    // MARK: Helpers

    static func clean(_ s: String?) -> String? {
        guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }

    static func codes(_ list: [String], upper: Bool) -> [String] {
        var seen = Set<String>()
        return list.compactMap { raw in
            let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { return nil }
            let v = upper ? t.uppercased() : t.lowercased()
            return seen.insert(v).inserted ? v : nil
        }
    }

    /// Parses "ng, us gh" into ["NG", "US", "GH"].
    static func parseCountries(_ text: String) -> [String] {
        codes(text.split(whereSeparator: { $0 == "," || $0 == " " || $0 == ";" }).map(String.init), upper: true)
    }

    /// Compares timestamps by instant so "…T00:00:00Z" equals "…T00:00:00.000Z".
    static func sameInstant(_ a: String?, _ b: String?) -> Bool {
        let a = clean(a), b = clean(b)
        if a == b { return true }
        guard let a, let b, let da = AdminFormat.isoDate(a), let db = AdminFormat.isoDate(b) else { return false }
        return da == db
    }

    /// Normalises a server date (possibly a full timestamp) to 'YYYY-MM-DD'.
    static func dayString(_ s: String) -> String {
        String(s.prefix(10))
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func day(from date: Date) -> String { dayFormatter.string(from: date) }
    static func date(fromDay day: String?) -> Date? {
        guard let day else { return nil }
        return dayFormatter.date(from: dayString(day))
    }

    static func iso(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
