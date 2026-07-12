//
//  AuthAPI.swift
//  CinneTemple
//
//  Typed wrapper over the auth/identity endpoints (Phase 1).
//

import Foundation

final class AuthAPI {
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func register(email: String, password: String, displayName: String) async throws -> RegisterResult {
        try await client.send(
            "v1/auth/register", method: .post,
            body: RegisterRequest(email: email, password: password, displayName: displayName)
        )
    }

    func verifyEmail(email: String, code: String) async throws {
        let _: Empty = try await client.send(
            "v1/auth/verify-email", method: .post,
            body: VerifyEmailRequest(email: email, code: code)
        )
    }

    func login(email: String, password: String, deviceId: String?) async throws -> TokenPair {
        try await client.send(
            "v1/auth/login", method: .post,
            body: LoginRequest(email: email, password: password, deviceId: deviceId)
        )
    }

    func googleSignIn(idToken: String) async throws -> TokenPair {
        try await client.send(
            "v1/auth/google/native", method: .post,
            body: GoogleSignInRequest(idToken: idToken)
        )
    }

    /// Native Sign in with Apple: exchanges the ASAuthorization identity token
    /// for a first-party session. `fullName` is only present on first sign-in.
    func appleSignIn(identityToken: String, fullName: String?) async throws -> TokenPair {
        try await client.send(
            "v1/auth/apple/native", method: .post,
            body: AppleSignInRequest(identityToken: identityToken, fullName: fullName)
        )
    }

    func refresh(refreshToken: String) async throws -> TokenPair {
        try await client.send(
            "v1/auth/refresh", method: .post,
            body: RefreshRequest(refreshToken: refreshToken)
        )
    }

    func forgotPassword(email: String) async throws {
        let _: Empty = try await client.send(
            "v1/auth/forgot-password", method: .post,
            body: ForgotPasswordRequest(email: email)
        )
    }

    func resetPassword(email: String, code: String, newPassword: String) async throws {
        let _: Empty = try await client.send(
            "v1/auth/reset-password", method: .post,
            body: ResetPasswordRequest(email: email, code: code, newPassword: newPassword)
        )
    }

    func me() async throws -> CurrentUser {
        try await client.send("v1/auth/me", authenticated: true)
    }

    func logout(refreshToken: String) async throws {
        let _: Empty = try await client.send(
            "v1/auth/logout", method: .post,
            body: RefreshRequest(refreshToken: refreshToken), authenticated: true
        )
    }

    func updateProfile(_ body: UpdateProfileRequest) async throws {
        let _: Empty = try await client.send(
            "v1/profile", method: .patch, body: body, authenticated: true
        )
    }

    func sessions() async throws -> [SessionInfo] {
        try await client.send("v1/sessions", authenticated: true)
    }

    func revokeSession(id: String) async throws {
        let _: Empty = try await client.send(
            "v1/sessions/\(id)", method: .delete, authenticated: true
        )
    }
}

// MARK: - Native auth contracts (Phase 2)

/// POST /v1/auth/register response. When the backend has email verification
/// disabled it returns a token pair inline so the client can log in
/// immediately and skip the verify-email screen.
struct RegisterResult: Decodable {
    let userId: String
    let status: String
    let tokens: TokenPair?
}

/// POST /v1/auth/apple/native request body.
struct AppleSignInRequest: Encodable {
    let identityToken: String
    let fullName: String?
}
