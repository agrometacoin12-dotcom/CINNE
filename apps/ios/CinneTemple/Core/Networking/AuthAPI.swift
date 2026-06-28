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

    func register(email: String, password: String, displayName: String) async throws -> RegisterResponse {
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
