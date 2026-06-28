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
        AuthScaffold(title: "Create your account", subtitle: "Join CinneTemple in seconds.") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Display name", text: $displayName,
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
                    Text("At least 12 characters with upper, lower, number, and symbol.")
                        .font(.footnote)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(title: "Create account", isLoading: model.isLoading) {
                    Task {
                        if await model.register(email: email, password: password, displayName: displayName) {
                            path.append(.verify(email: email))
                        }
                    }
                }
                .disabled(!canSubmit)
            }
        }
        .navigationTitle("Sign up")
        .navigationBarTitleDisplayMode(.inline)
    }
}
