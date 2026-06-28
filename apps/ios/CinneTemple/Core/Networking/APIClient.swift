//
//  APIClient.swift
//  CinneTemple
//
//  Thin async/await HTTP client over URLSession. Knows nothing about auth flows;
//  it just sends requests and decodes responses, attaching a bearer token when
//  a token provider is supplied.
//

import Foundation

/// Supplies the current access token and a way to refresh it on a 401.
protocol TokenProviding: AnyObject {
    func currentAccessToken() -> String?
    func refreshTokens() async -> Bool
}

struct Empty: Codable {}

final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    weak var tokenProvider: TokenProviding?

    private lazy var decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    private lazy var encoder: JSONEncoder = {
        let e = JSONEncoder()
        return e
    }()

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    enum Method: String { case get = "GET", post = "POST", patch = "PATCH", delete = "DELETE" }

    /// Performs a request, decoding `Response`. Retries once after a token
    /// refresh if the server returns 401 on an authenticated call.
    func send<Response: Decodable>(
        _ path: String,
        method: Method = .get,
        body: (any Encodable)? = nil,
        authenticated: Bool = false,
        retryOn401: Bool = true
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if authenticated, let token = tokenProvider?.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("Invalid response")
        }

        if http.statusCode == 401, authenticated, retryOn401,
           let provider = tokenProvider, await provider.refreshTokens() {
            return try await send(path, method: method, body: body,
                                  authenticated: authenticated, retryOn401: false)
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

/// Type-erasing wrapper so heterogeneous request bodies can be encoded.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) { self.encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
