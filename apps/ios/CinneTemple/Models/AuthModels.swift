//
//  AuthModels.swift
//  CinneTemple
//
//  Codable models mirroring the backend auth contracts (packages/shared).
//

import Foundation

// MARK: - Requests

struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let displayName: String
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let deviceId: String?
}

struct VerifyEmailRequest: Encodable {
    let email: String
    let code: String
}

struct ForgotPasswordRequest: Encodable {
    let email: String
}

struct ResetPasswordRequest: Encodable {
    let email: String
    let code: String
    let newPassword: String
}

struct RefreshRequest: Encodable {
    let refreshToken: String
}

struct UpdateProfileRequest: Encodable {
    var displayName: String?
    var avatarUrl: String?
    var bio: String?
    var locale: String?
}

// MARK: - Responses

struct TokenPair: Codable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresIn: Int
}

struct RegisterResponse: Decodable {
    let userId: String
    let status: String
}

enum UserStatus: String, Codable {
    case pendingVerification = "PENDING_VERIFICATION"
    case active = "ACTIVE"
    case suspended = "SUSPENDED"
    case deactivated = "DEACTIVATED"
}

struct UserProfile: Codable, Hashable {
    let displayName: String
    let avatarUrl: String?
    let locale: String
}

struct CurrentUser: Codable, Hashable, Identifiable {
    let id: String
    let email: String
    let emailVerified: Bool
    let mfaEnabled: Bool
    let status: UserStatus
    let roles: [String]
    let isAdmin: Bool?
    let profile: UserProfile?

    var initials: String {
        let source = profile?.displayName ?? email
        let parts = source.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }
}

struct SessionInfo: Codable, Identifiable, Hashable {
    let id: String
    let deviceId: String?
    let userAgent: String?
    let ip: String?
    let createdAt: String
    let expiresAt: String
}
