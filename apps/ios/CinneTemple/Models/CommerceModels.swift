//
//  CommerceModels.swift
//  CinneTemple
//
//  Codable models for the mobile-cinema commerce surface: pay-per-view,
//  entitlements, playback authorization, and premiere live chat.
//

import Foundation

struct PurchaseResult: Decodable {
    let status: String          // paid | pending | failed | already_entitled
    let titleId: String
    let reference: String?
    let amountMinor: Int?
    let currency: String?
    let authorizationUrl: String?
    let isGift: Bool?

    var isPaid: Bool { status == "paid" || status == "already_entitled" }
}

struct VerifyResult: Decodable {
    let status: String
    let titleId: String
}

struct EntitlementItem: Decodable, Identifiable {
    var id: String { titleId + (startedAt ?? "") }
    let titleId: String
    let status: String          // ACTIVE | EXPIRED | CONSUMED | REVOKED
    let startedAt: String?
    let expiresAt: String?
    let title: TitleSummary?

    var isActive: Bool { status == "ACTIVE" }
}

struct PlaybackSession: Decodable {
    let titleId: String
    /// Present when playback targeted one episode of a series.
    let episodeId: String?
    let title: String
    /// Present on episode sessions — shown in the player HUD instead of the
    /// series title alone.
    let episodeName: String?
    let url: String
    let durationSeconds: Int
    let watermark: String
    let sessionId: String
    let expiresAt: String?

    /// Parsed via TicketDates: backend ISO-8601 dates usually carry fractional
    /// seconds, which the default formatter rejects.
    var expiryDate: Date? { TicketDates.parse(expiresAt) }

    /// HUD title: the episode name for episode sessions, else the title.
    var displayTitle: String { episodeName ?? title }
}

struct PlaybackStatus: Decodable {
    let titleId: String
    /// Present when the status query targeted one episode of a series.
    let episodeId: String?
    let hasAccess: Bool
    let started: Bool
    /// Episode watch-once state; present on episode status responses only.
    let consumed: Bool?
    let expiresAt: String?
    let premiere: Bool
    let premiereLive: Bool
    let premiereStartAt: String?
}

struct ChatMessage: Decodable, Identifiable, Equatable {
    let id: String
    let author: String
    let body: String
    let userId: String
    let createdAt: String
}

struct PremiereRoom: Decodable {
    let titleId: String
    let title: String
    let live: Bool
    let premiereStartAt: String?
    let canChat: Bool
    let entitled: Bool
}
