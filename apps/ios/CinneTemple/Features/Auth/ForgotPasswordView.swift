//
//  ForgotPasswordView.swift
//  CinneTemple
//

import SwiftUI

struct ForgotPasswordView: View {
    @Binding var path: [AuthRoute]
    @EnvironmentObject private var model: AuthViewModel
    @State private var email = ""
    @State private var sent = false

    var body: some View {
        AuthScaffold(title: "Reset your password",
                     subtitle: "We'll email you a code to set a new password.") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                if sent {
                    SuccessBanner(message: "If an account exists for \(email), a reset code is on its way.")
                    PrimaryButton(title: "Enter reset code") {
                        path.append(.resetPassword(email: email))
                    }
                } else {
                    GlassField(title: "Email", text: $email, keyboard: .emailAddress,
                               textContentType: .emailAddress)
                    PrimaryButton(title: "Send reset code", isLoading: model.isLoading) {
                        Task {
                            if await model.forgotPassword(email: email) { sent = true }
                        }
                    }
                    .disabled(!Validators.isValidEmail(email))
                }
            }
        }
        .navigationTitle("Forgot password")
        .navigationBarTitleDisplayMode(.inline)
    }
}
