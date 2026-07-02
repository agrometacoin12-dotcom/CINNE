//
//  AuthViewModel.swift
//  CinneTemple
//
//  MVVM view model backing the authentication flows. Owns form-independent
//  auth operations and surfaces loading/error state to the views.
//

import Foundation
import Combine
import SwiftUI
import UIKit

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api: AuthAPI
    private let session: SessionStore

    init(api: AuthAPI, session: SessionStore) {
        self.api = api
        self.session = session
    }

    private func run(_ operation: () async throws -> Void) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await operation()
            return true
        } catch let error as APIError {
            errorMessage = error.detail
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func register(email: String, password: String, displayName: String) async -> Bool {
        await run {
            _ = try await api.register(email: email, password: password, displayName: displayName)
        }
    }

    func verifyEmail(email: String, code: String) async -> Bool {
        await run { try await api.verifyEmail(email: email, code: code) }
    }

    func login(email: String, password: String) async -> Bool {
        await run {
            let pair = try await api.login(email: email, password: password, deviceId: session.deviceId)
            await session.completeLogin(with: pair)
        }
    }

    func forgotPassword(email: String) async -> Bool {
        await run { try await api.forgotPassword(email: email) }
    }

    func resetPassword(email: String, code: String, newPassword: String) async -> Bool {
        await run { try await api.resetPassword(email: email, code: code, newPassword: newPassword) }
    }
}

/// Local, client-side validation mirroring the backend rules.
enum Validators {
    static func isValidEmail(_ email: String) -> Bool {
        let pattern = #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#
        return email.range(of: pattern, options: .regularExpression) != nil
    }

    static func passwordIssue(_ password: String) -> String? {
        if password.count < 8 { return "At least 8 characters." }
        if password.range(of: "[A-Z]", options: .regularExpression) == nil { return "Add an uppercase letter." }
        if password.range(of: "[a-z]", options: .regularExpression) == nil { return "Add a lowercase letter." }
        if password.range(of: "[0-9]", options: .regularExpression) == nil { return "Add a number." }
        if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) == nil { return "Add a symbol." }
        return nil
    }
}
