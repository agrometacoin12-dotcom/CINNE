//
//  ResetPasswordView.swift
//  CinneTemple
//

import SwiftUI

struct ResetPasswordView: View {
    @Binding var path: [AuthRoute]
    let email: String
    @EnvironmentObject private var model: AuthViewModel
    @State private var code = ""
    @State private var newPassword = ""

    private var canSubmit: Bool {
        code.count >= 6 && Validators.passwordIssue(newPassword) == nil
    }

    var body: some View {
        AuthScaffold(title: "Set a new password",
                     subtitle: "Enter the code we emailed you and choose a new password.") {
            VStack(spacing: 16) {
                if let error = model.errorMessage {
                    ErrorBanner(message: error)
                }
                GlassField(title: "Reset code", text: $code, keyboard: .numberPad,
                           textContentType: .oneTimeCode)
                GlassField(title: "New password", text: $newPassword, isSecure: true,
                           textContentType: .newPassword)

                if let issue = newPassword.isEmpty ? nil : Validators.passwordIssue(newPassword) {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(Theme.Colors.brand)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(title: "Update password", isLoading: model.isLoading) {
                    Task {
                        if await model.resetPassword(email: email, code: code, newPassword: newPassword) {
                            path = [.login]
                        }
                    }
                }
                .disabled(!canSubmit)
            }
        }
        .navigationTitle("Reset password")
        .navigationBarTitleDisplayMode(.inline)
    }
}
