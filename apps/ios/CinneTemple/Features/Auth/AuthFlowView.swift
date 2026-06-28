//
//  AuthFlowView.swift
//  CinneTemple
//
//  Hosts the unauthenticated navigation stack (landing → sign in / sign up …).
//

import SwiftUI

enum AuthRoute: Hashable {
    case login
    case register
    case verify(email: String)
    case forgotPassword
    case resetPassword(email: String)
}

struct AuthFlowView: View {
    @StateObject private var model: AuthViewModel
    @State private var path: [AuthRoute] = []

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeAuthViewModel())
    }

    var body: some View {
        NavigationStack(path: $path) {
            LandingView(path: $path)
                .navigationDestination(for: AuthRoute.self) { route in
                    destination(for: route)
                        .environmentObject(model)
                }
        }
        .environmentObject(model)
        .tint(Theme.Colors.brand)
    }

    @ViewBuilder
    private func destination(for route: AuthRoute) -> some View {
        switch route {
        case .login:
            LoginView(path: $path)
        case .register:
            RegisterView(path: $path)
        case .verify(let email):
            VerifyEmailView(path: $path, email: email)
        case .forgotPassword:
            ForgotPasswordView(path: $path)
        case .resetPassword(let email):
            ResetPasswordView(path: $path, email: email)
        }
    }
}
