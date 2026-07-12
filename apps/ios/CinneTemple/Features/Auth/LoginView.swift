//
//  LoginView.swift
//  CinneTemple
//
//  Sign In — exact Figma (node 42:13463): poster-wall backdrop, C logo, glass
//  card with "Welcome back" / "Sign in to continue watching", Email + Password
//  glass fields, indigo "Sign In", an "or" divider, glass Apple / Google
//  buttons, and a "Don't have an account?  Sign Up" footer.
//

import SwiftUI

struct LoginView: View {
    @Binding var path: [AuthRoute]
    @EnvironmentObject private var model: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        AuthScaffold(title: "Welcome back", subtitle: "Sign in to continue watching") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Email", text: $email, keyboard: .emailAddress,
                           textContentType: .emailAddress)
                GlassField(title: "Password", text: $password, isSecure: true,
                           textContentType: .password)

                Button("Forgot password?") { path.append(.forgotPassword) }
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.Colors.indigoLight)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                PrimaryButton(title: "Sign In", isLoading: model.isLoading) {
                    Task { _ = await model.login(email: email, password: password) }
                }
                .disabled(email.isEmpty || password.isEmpty)

                // or divider — 42:13475
                HStack(spacing: 10) {
                    Rectangle().fill(.white.opacity(0.15)).frame(height: 1)
                    Text("or").font(.system(size: 12)).foregroundStyle(.white.opacity(0.5))
                    Rectangle().fill(.white.opacity(0.15)).frame(height: 1)
                }
                .padding(.top, 2)

                SocialAuthButton(icon: "apple.logo", label: "Continue with Apple") {
                    Task { await model.signInWithApple() }
                }
                SocialAuthButton(icon: "g.circle", label: "Continue with Google") {
                    Task { await model.signInWithGoogle() }
                }

                HStack(spacing: 4) {
                    Text("Don't have an account?").foregroundStyle(.white.opacity(0.6))
                    Button("Sign Up") { path.append(.register) }
                        .foregroundStyle(.white.opacity(0.6)).fontWeight(.semibold)
                }
                .font(.system(size: 13))
                .padding(.top, 4)
            }
        }
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Glass social sign-in button — Figma "Continue with Apple / Google" (42:13477).
struct SocialAuthButton: View {
    let icon: String
    let label: String
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold))
                Text(label).font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(.white.opacity(0.9))
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .liquidGlass(cornerRadius: 12)
        }
        .buttonStyle(PressableButtonStyle())
    }
}
