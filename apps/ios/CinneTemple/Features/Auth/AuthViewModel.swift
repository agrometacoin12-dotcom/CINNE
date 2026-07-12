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
import AuthenticationServices

/// Result of a successful registration call — decides the next screen.
enum RegisterOutcome: Equatable {
    /// Backend returned tokens inline; the session is already live.
    case loggedIn
    /// No tokens yet — the user must enter the emailed verification code.
    case needsVerification
}

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

    /// Registers a new account. When the backend returns tokens inline the
    /// session is completed immediately (auto-login) and the verify-email
    /// screen is skipped; otherwise the caller routes to verification.
    /// Returns nil on failure (error surfaced via `errorMessage`).
    func register(email: String, password: String, displayName: String) async -> RegisterOutcome? {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result = try await api.register(email: email, password: password, displayName: displayName)
            if let tokens = result.tokens {
                await session.completeLogin(with: tokens)
                return .loggedIn
            }
            return .needsVerification
        } catch let error as APIError {
            errorMessage = error.detail
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
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

    /// Native Sign in with Apple: run the ASAuthorizationController flow,
    /// exchange the identity token with the backend, and complete the session
    /// like email login. User cancellation is silent; other failures surface
    /// through the ErrorBanner.
    func signInWithApple() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        let coordinator = AppleSignInCoordinator()
        appleSignInCoordinator = coordinator
        defer { appleSignInCoordinator = nil }
        do {
            let credential = try await coordinator.requestCredential()
            guard let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Apple did not return an identity token. Please try again."
                return
            }
            // Only present on the very first authorization for this Apple ID.
            var fullName: String?
            if let components = credential.fullName {
                let formatted = PersonNameComponentsFormatter.localizedString(
                    from: components, style: .default
                ).trimmingCharacters(in: .whitespaces)
                fullName = formatted.isEmpty ? nil : formatted
            }
            let pair = try await api.appleSignIn(identityToken: identityToken, fullName: fullName)
            await session.completeLogin(with: pair)
        } catch let error as ASAuthorizationError where error.code == .canceled {
            // User dismissed the Apple sheet — not an error.
        } catch let error as APIError {
            errorMessage = error.detail
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Keeps the ASAuthorizationController delegate alive for the duration of
    /// the Apple sign-in flow.
    private var appleSignInCoordinator: AppleSignInCoordinator?

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
