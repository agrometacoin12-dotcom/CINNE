//
//  RegisterView.swift
//  CinneTemple
//

import SwiftUI

struct RegisterView: View {
    @Binding var path: [AuthRoute]
    @EnvironmentObject private var model: AuthViewModel
    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""

    private var passwordIssue: String? {
        password.isEmpty ? nil : Validators.passwordIssue(password)
    }

    private var canSubmit: Bool {
        !displayName.isEmpty && Validators.isValidEmail(email) && Validators.passwordIssue(password) == nil
    }

    var body: some View {
        AuthScaffold(title: "Join Cinnetemple", subtitle: "Create an account to start streaming") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Name", text: $displayName,
                           textContentType: .name, autocapitalization: .words)
                GlassField(title: "Email", text: $email, keyboard: .emailAddress,
                           textContentType: .emailAddress)
                GlassField(title: "Password", text: $password, isSecure: true,
                           textContentType: .newPassword)

                if let issue = passwordIssue {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(Theme.Colors.brand)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text("At least 8 characters with upper, lower, number, and symbol.")
                        .font(.footnote)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(title: "Create Account", isLoading: model.isLoading) {
                    Task {
                        if await model.register(email: email, password: password, displayName: displayName) {
                            path.append(.verify(email: email))
                        }
                    }
                }
                .disabled(!canSubmit)

                SocialAuthButton(icon: "apple.logo", label: "Continue with Apple")
                SocialAuthButton(icon: "g.circle", label: "Continue with Google")

                HStack(spacing: 4) {
                    Text("Already have an account?").foregroundStyle(.white.opacity(0.6))
                    Button("Sign In") { if !path.isEmpty { path.removeLast() }; path.append(.login) }
                        .foregroundStyle(.white.opacity(0.6)).fontWeight(.semibold)
                }
                .font(.system(size: 13))
                .padding(.top, 4)
            }
        }
        .navigationTitle("Sign up")
        .navigationBarTitleDisplayMode(.inline)
    }
}
