//
//  ContinueWatchingAPI.swift
//  CinneTemple
//
//  Typed access to the resume-playback endpoints:
//    GET    /v1/playback/continue          — the Continue Watching rail
//    DELETE /v1/playback/:titleId/progress — remove an item from the rail
//

import Foundation

/// One resumable title, as returned by GET /v1/playback/continue.
struct ContinueWatchingItem: Decodable, Identifiable, Hashable {
    var id: String { titleId }
    let titleId: String
    let title: String
    let posterUrl: String?
    let heroUrl: String?
    let positionSeconds: Int
    let durationSeconds: Int
    let progress: Double
    let updatedAt: String

    /// "1h 23m left" / "12m left" — from real progress data.
    var remainingText: String {
        let remaining = max(durationSeconds - positionSeconds, 0)
        let h = remaining / 3600
        let m = (remaining % 3600) / 60
        if h > 0 { return "\(h)h \(m)m left" }
        return "\(max(m, 1))m left"
    }
}

extension APIClient {
    /// Titles the user can resume (usable entitlement, <95% watched), newest first.
    func continueWatching() async throws -> [ContinueWatchingItem] {
        try await send("v1/playback/continue", authenticated: true)
    }

    /// Clears saved progress so the title leaves the Continue Watching rail.
    func clearPlaybackProgress(titleId: String) async throws {
        let _: Empty = try await send(
            "v1/playback/\(titleId)/progress", method: .delete, authenticated: true
        )
    }
}
