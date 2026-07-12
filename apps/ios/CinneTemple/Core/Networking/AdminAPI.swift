//
//  AdminAPI.swift
//  CinneTemple
//
//  Typed wrapper over the /v1/admin/* endpoints powering the Studio console.
//  Builds its own URLs (query-string safe) and reuses the shared APIClient's
//  token provider for bearer auth + one-shot refresh on 401 — mirroring the
//  behavior of APIClient.send.
//

import Foundation

// MARK: - Models

/// TitleDetail + admin-only fields (drafts included). Optional-heavy for
/// resilience against payload evolution.
struct AdminTitle: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let type: String?
    let year: Int?
    let rating: Double?
    let genres: [String]?
    let posterUrl: String?
    let tagline: String?
    let overview: String?
    let runtimeMinutes: Int?
    let seasons: Int?
    let maturityRating: String?
    let heroUrl: String?
    let cast: [String]?
    let director: String?
    let categories: [String]?
    let priceMinor: Int?
    let currency: String?
    let durationSeconds: Int?
    let isPremiere: Bool?
    let premiereStartAt: String?
    let premiereLive: Bool?
    let hasVideo: Bool?
    // Admin extras
    let status: String?
    let featured: Bool?
    let videoKey: String?
    let posterKey: String?
    let heroKey: String?
    let popularity: Int?

    var isPublished: Bool { (status ?? "draft") == "published" }
    var isFeatured: Bool { featured ?? false }
    var premiere: Bool { isPremiere ?? false }
    var missingVideo: Bool { videoKey == nil && !(hasVideo ?? false) }
}

struct AdminRevenueBucket: Codable, Hashable {
    let currency: String
    let totalMinor: Int
}

struct AdminStats: Codable, Hashable {
    let users: Int
    let titles: Int
    let published: Int
    let purchases: Int
    let activeEntitlements: Int
    let revenue: [AdminRevenueBucket]

    /// Naira revenue in kobo (falls back to the first bucket).
    var nairaRevenueMinor: Int {
        revenue.first(where: { $0.currency == "NGN" })?.totalMinor
            ?? revenue.first?.totalMinor
            ?? 0
    }
}

struct AdminUser: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let displayName: String?
    let roles: [String]
    let status: String
    let emailVerified: Bool
    let createdAt: String
    let purchases: Int

    var isAdmin: Bool { roles.contains("admin") }
    var isSuspended: Bool { status == "SUSPENDED" }
}

struct AdminUsersPage: Codable {
    let total: Int
    let users: [AdminUser]
}

struct AdminPurchase: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let userEmail: String
    let userDisplayName: String?
    let titleId: String
    let titleName: String
    let amountMinor: Int
    let currency: String
    let provider: String
    let status: String
    let isGift: Bool
    let entitlementStatus: String?
    let createdAt: String
    let paidAt: String?
}

struct AdminPurchasesPage: Codable {
    let total: Int
    let items: [AdminPurchase]
}

struct AdminAuditEntry: Codable, Identifiable, Hashable {
    let id: String
    let actorId: String?
    let actorEmail: String?
    let action: String
    let entity: String?
    let entityId: String?
    let metadata: JSONValue?
    let ip: String?
    let createdAt: String
}

struct AdminAuditPage: Codable {
    let total: Int
    let items: [AdminAuditEntry]
}

struct PresignedUpload: Codable {
    let enabled: Bool
    let key: String
    let uploadUrl: String
    let headers: [String: String]
}

struct AdminUploadStat: Codable {
    let exists: Bool
    let size: Int?
}

struct AdminDeleteResult: Codable {
    let deleted: Bool
    let id: String
    let soldTickets: Int
}

// MARK: - JSONValue

/// A JSON tree value. Used both to *encode* PATCH bodies where explicit
/// `null` (clear-field) must be distinguishable from an omitted key, and to
/// *decode* free-form audit metadata.
enum JSONValue: Codable, Hashable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let i = try? c.decode(Int.self) {
            self = .int(i)
        } else if let d = try? c.decode(Double.self) {
            self = .double(d)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else if let o = try? c.decode([String: JSONValue].self) {
            self = .object(o)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    /// Human-readable multi-line rendering (for the audit metadata expander).
    func pretty(indent: Int = 0) -> String {
        let pad = String(repeating: "  ", count: indent)
        switch self {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .int(let i): return String(i)
        case .double(let d): return String(d)
        case .string(let s): return s
        case .array(let a):
            if a.isEmpty { return "[]" }
            return a.map { "\(pad)- \($0.pretty(indent: indent + 1))" }.joined(separator: "\n")
        case .object(let o):
            if o.isEmpty { return "{}" }
            return o.keys.sorted().map { key in
                let v = o[key] ?? .null
                switch v {
                case .object, .array:
                    return "\(pad)\(key):\n\(v.pretty(indent: indent + 1))"
                default:
                    return "\(pad)\(key): \(v.pretty(indent: indent + 1))"
                }
            }.joined(separator: "\n")
        }
    }
}

// MARK: - AdminAPI

final class AdminAPI {
    private let client: APIClient
    private let baseURL: URL
    private let urlSession: URLSession

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(client: APIClient, baseURL: URL = AppConfig.apiBaseURL, urlSession: URLSession = .shared) {
        self.client = client
        self.baseURL = baseURL
        self.urlSession = urlSession
    }

    // MARK: Stats & movies

    func stats() async throws -> AdminStats {
        try await send("v1/admin/stats")
    }

    func movies() async throws -> [AdminTitle] {
        try await send("v1/admin/movies")
    }

    func movie(id: String) async throws -> AdminTitle {
        try await send("v1/admin/movies/\(id)")
    }

    /// Create. Fields map: omitted key = server default.
    func createMovie(fields: [String: JSONValue]) async throws -> AdminTitle {
        try await send("v1/admin/movies", method: "POST", bodyData: try encoder.encode(fields))
    }

    /// Patch semantics: omitted = unchanged, explicit `.null` = clear.
    func updateMovie(id: String, fields: [String: JSONValue]) async throws -> AdminTitle {
        try await send("v1/admin/movies/\(id)", method: "PATCH", bodyData: try encoder.encode(fields))
    }

    func deleteMovie(id: String) async throws -> AdminDeleteResult {
        try await send("v1/admin/movies/\(id)", method: "DELETE")
    }

    func setFeatured(id: String, featured: Bool) async throws -> AdminTitle {
        try await send("v1/admin/movies/\(id)/featured", method: "PUT",
                       bodyData: try encoder.encode(["featured": JSONValue.bool(featured)]))
    }

    func setPremiere(id: String, isPremiere: Bool, premiereStartAt: String?) async throws -> AdminTitle {
        var body: [String: JSONValue] = ["isPremiere": .bool(isPremiere)]
        if let premiereStartAt { body["premiereStartAt"] = .string(premiereStartAt) }
        return try await send("v1/admin/movies/\(id)/premiere", method: "PUT",
                              bodyData: try encoder.encode(body))
    }

    // MARK: Uploads

    func presignUpload(kind: String, contentType: String) async throws -> PresignedUpload {
        try await send("v1/admin/uploads/presign", method: "POST",
                       bodyData: try encoder.encode(["kind": JSONValue.string(kind),
                                                     "contentType": JSONValue.string(contentType)]))
    }

    func uploadStat(key: String) async throws -> AdminUploadStat {
        try await send("v1/admin/uploads/stat", query: [URLQueryItem(name: "key", value: key)])
    }

    /// Streams a single PUT of the file to the HMAC-presigned URL with the
    /// EXACT presigned headers (Content-Type is inside the signature).
    /// No bearer token; no chunking/multipart.
    func upload(
        file: URL,
        to presigned: PresignedUpload,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws {
        guard let url = URL(string: presigned.uploadUrl) else {
            throw APIError.network("Invalid upload URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.timeoutInterval = 4 * 3600
        for (name, value) in presigned.headers {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 3600
        config.timeoutIntervalForResource = 4 * 3600
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }

        let delegate = UploadProgressDelegate(onProgress: progress)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.upload(for: request, fromFile: file, delegate: delegate)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("Invalid response")
        }
        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? decoder.decode(APIError.self, from: data) { throw apiError }
            throw APIError(status: http.statusCode, title: "Upload failed",
                           detail: "Upload failed (\(http.statusCode)).")
        }
    }

    // MARK: Members

    func users(q: String, take: Int = 50, skip: Int = 0) async throws -> AdminUsersPage {
        var query = [URLQueryItem(name: "take", value: String(take)),
                     URLQueryItem(name: "skip", value: String(skip))]
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { query.insert(URLQueryItem(name: "q", value: trimmed), at: 0) }
        return try await send("v1/admin/users", query: query)
    }

    /// REPLACES the whole role set (server forbids removing your own admin role).
    func setRoles(userId: String, roles: [String]) async throws -> AdminUser {
        try await send("v1/admin/users/\(userId)/roles", method: "PUT",
                       bodyData: try encoder.encode(["roles": JSONValue.array(roles.map { .string($0) })]))
    }

    func setStatus(userId: String, status: String) async throws -> AdminUser {
        try await send("v1/admin/users/\(userId)/status", method: "PUT",
                       bodyData: try encoder.encode(["status": JSONValue.string(status)]))
    }

    func verifyUser(userId: String) async throws -> AdminUser {
        try await send("v1/admin/users/\(userId)/verify", method: "POST")
    }

    // MARK: Sales & audit

    func purchases(q: String, status: String?, take: Int = 50, skip: Int = 0) async throws -> AdminPurchasesPage {
        var query = [URLQueryItem(name: "take", value: String(take)),
                     URLQueryItem(name: "skip", value: String(skip))]
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { query.insert(URLQueryItem(name: "q", value: trimmed), at: 0) }
        if let status, !status.isEmpty { query.insert(URLQueryItem(name: "status", value: status), at: 0) }
        return try await send("v1/admin/purchases", query: query)
    }

    func audit(take: Int = 50, skip: Int = 0) async throws -> AdminAuditPage {
        try await send("v1/admin/audit", query: [URLQueryItem(name: "take", value: String(take)),
                                                 URLQueryItem(name: "skip", value: String(skip))])
    }

    // MARK: Plumbing

    private func makeURL(_ path: String, query: [URLQueryItem]) throws -> URL {
        guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.network("Invalid API base URL.")
        }
        var basePath = comps.path
        if basePath.hasSuffix("/") { basePath.removeLast() }
        comps.path = basePath + "/" + path
        if !query.isEmpty { comps.queryItems = query }
        guard let url = comps.url else { throw APIError.network("Could not build request URL.") }
        return url
    }

    private func send<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        method: String = "GET",
        bodyData: Data? = nil,
        retryOn401: Bool = true
    ) async throws -> Response {
        var request = URLRequest(url: try makeURL(path, query: query))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = client.tokenProvider?.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = bodyData

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("Invalid response")
        }

        if http.statusCode == 401, retryOn401,
           let provider = client.tokenProvider, await provider.refreshTokens() {
            return try await send(path, query: query, method: method,
                                  bodyData: bodyData, retryOn401: false)
        }

        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? decoder.decode(APIError.self, from: data) {
                throw apiError
            }
            throw APIError(status: http.statusCode, title: "Error",
                           detail: "Request failed (\(http.statusCode)).")
        }

        if data.isEmpty, let empty = Empty() as? Response {
            return empty
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.network("Could not read server response.")
        }
    }
}

/// Reports PUT body progress for large media uploads.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    private let onProgress: @Sendable (Double) -> Void
    init(onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64,
                    totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}
