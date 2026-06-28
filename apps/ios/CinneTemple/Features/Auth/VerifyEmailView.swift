//
//  VerifyEmailView.swift
//  CinneTemple
//

import SwiftUI

struct VerifyEmailView: View {
    @Binding var path: [AuthRoute]
    let email: String
    @EnvironmentObject private var model: AuthViewModel
    @State private var code = ""

    var body: some View {
        AuthScaffold(title: "Verify your email",
                     subtitle: "We sent a 6-digit code to \(email).") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Verification code", text: $code, keyboard: .numberPad,
                           textContentType: .oneTimeCode)

                PrimaryButton(title: "Verify and continue", isLoading: model.isLoading) {
                    Task {
                        if await model.verifyEmail(email: email, code: code) {
                            // Pop back to login so the user can sign in.
                            path = [.login]
                        }
                    }
                }
                .disabled(code.count < 6)
            }
        }
        .navigationTitle("Verify")
        .navigationBarTitleDisplayMode(.inline)
    }
}
