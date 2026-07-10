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
import GoogleSignIn

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

    /// Native Google Sign-In: present the Google sheet, exchange the resulting
    /// ID token with the backend, and complete the session like email login.
    func signInWithGoogle() async {
        guard let presenter = UIApplication.shared.topMostViewController else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = "Google did not return an identity token. Please try again."
                return
            }
            let pair = try await api.googleSignIn(idToken: idToken)
            await session.completeLogin(with: pair)
        } catch GIDSignInError.canceled {
            // User dismissed the Google sheet — not an error.
        } catch let error as APIError {
            errorMessage = error.detail
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func forgotPassword(email: String) async -> Bool {
        await run { try await api.forgotPassword(email: email) }
    }

    func resetPassword(email: String, code: String, newPassword: String) async -> Bool {
        await run { try await api.resetPassword(email: email, code: code, newPassword: newPassword) }
    }
}

private extension UIApplication {
    /// Top-most view controller from the active scene's key window, used to
    /// present the Google Sign-In sheet.
    var topMostViewController: UIViewController? {
        let keyWindow = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
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
