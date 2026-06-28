//
//  APIError.swift
//  CinneTemple
//

import Foundation

/// Normalized API error surfaced to view models. Mirrors the backend's
/// RFC 7807 `application/problem+json` shape where available.
struct APIError: Error, LocalizedError, Decodable {
    let status: Int
    let title: String
    let detail: String

    var errorDescription: String? { detail }

    init(status: Int, title: String, detail: String) {
        self.status = status
        self.title = title
        self.detail = detail
    }

    // Decoded from the backend problem+json body.
    private enum CodingKeys: String, CodingKey { case status, title, detail, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.status = (try? c.decode(Int.self, forKey: .status)) ?? 0
        self.title = (try? c.decode(String.self, forKey: .title)) ?? "Error"
        if let detail = try? c.decode(String.self, forKey: .detail) {
            self.detail = detail
        } else if let message = try? c.decode(String.self, forKey: .message) {
            self.detail = message
        } else {
            self.detail = "Something went wrong."
        }
    }

    static let unauthorized = APIError(status: 401, title: "Unauthorized", detail: "Please sign in again.")
    static func network(_ message: String) -> APIError {
        APIError(status: -1, title: "Network", detail: message)
    }
}
