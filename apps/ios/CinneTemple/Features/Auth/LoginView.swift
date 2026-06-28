//
//  LoginView.swift
//  CinneTemple
//

import SwiftUI

struct LoginView: View {
    @Binding var path: [AuthRoute]
    @EnvironmentObject private var model: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        AuthScaffold(title: "Welcome back", subtitle: "Sign in to continue.") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Email", text: $email, keyboard: .emailAddress,
                           textContentType: .emailAddress)
                GlassField(title: "Password", text: $password, isSecure: true,
                           textContentType: .password)

                Button("Forgot password?") { path.append(.forgotPassword) }
                    .font(.footnote)
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                PrimaryButton(title: "Sign in", isLoading: model.isLoading) {
                    Task { _ = await model.login(email: email, password: password) }
                }
                .disabled(email.isEmpty || password.isEmpty)

                HStack {
                    Text("New to CinneTemple?").foregroundStyle(Theme.Colors.textSecondary)
                    Button("Create an account") { path.append(.register) }
                        .foregroundStyle(Theme.Colors.textPrimary).fontWeight(.semibold)
                }
                .font(.subheadline)
                .padding(.top, 4)
            }
        }
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
    }
}
