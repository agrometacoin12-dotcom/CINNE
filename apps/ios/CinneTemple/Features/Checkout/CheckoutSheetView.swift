//
//  CheckoutSheetView.swift
//  CinneTemple
//
//  Native branded checkout sheet for the pay-once / watch-once flow.
//  Mock driver → confirm step (GlassCard with title + ₦ amount, Confirm/Cancel);
//  future Paystack → in-sheet Safari; both verify via GET /v1/purchases/verify.
//

import SwiftUI

struct CheckoutSheetView: View {
    @ObservedObject var session: CheckoutSession
    /// Called on every terminal interaction. `paid` — the ticket (or gift) was
    /// granted; `watchNow` — the viewer chose to start watching immediately.
    let onFinish: (_ paid: Bool, _ watchNow: Bool) -> Void

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            switch session.step {
            case .confirm:
                ScrollView { confirmStep.padding(24) }
                    .scrollIndicators(.hidden)
            case .web:
                webStep
            case .verifying:
                statusStack {
                    ProgressView().tint(.white).scaleEffect(1.3)
                    Text("Confirming your payment…")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                    Text("This only takes a moment.")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.6))
                }
            case .success:
                successStep
            case .failed(let message):
                failedStep(message)
            }
        }
        .animation(Theme.Motion.spring, value: session.step)
        .presentationDetents(session.webURL == nil ? [.medium, .large] : [.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(session.step == .verifying)
        .preferredColorScheme(.dark)
    }

    // MARK: Confirm (native mock checkout)

    private var confirmStep: some View {
        VStack(spacing: 18) {
            Image("CLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)
                .shadow(color: Theme.Colors.indigoDeep.opacity(0.4), radius: 14, y: 8)

            VStack(spacing: 6) {
                Text(session.isGift ? "Confirm gift ticket" : "Confirm your ticket")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
                Text("Pay once · watch once")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
            }

            GlassCard {
                VStack(spacing: 14) {
                    HStack {
                        Text(session.titleName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        Spacer(minLength: 0)
                    }
                    if let email = session.beneficiaryEmail {
                        HStack(spacing: 6) {
                            Image(systemName: "gift.fill").font(.system(size: 11))
                            Text(email).lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Theme.Colors.indigoLight)
                    }
                    Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
                    HStack(alignment: .firstTextBaseline) {
                        Text("Total")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Colors.textSecondary)
                        Spacer()
                        Text(session.formattedAmount)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .padding(20)
            }

            VStack(spacing: 12) {
                PrimaryButton(title: "Confirm — \(session.formattedAmount)") {
                    Task { await session.confirm() }
                }
                GlassButton(title: "Cancel") { onFinish(false, false) }
            }
            .padding(.top, 4)

            Text("Ref \(session.reference) · Secured by CinneTemple Pay")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    // MARK: External web checkout (future Paystack)

    private var webStep: some View {
        Group {
            if let url = session.webURL {
                SafariView(url: url) {
                    Task { await session.completeWebCheckout() }
                }
                .ignoresSafeArea()
            } else {
                // Defensive: a web step without a URL can only fail.
                statusStack {
                    Text("The checkout page is unavailable.")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.7))
                    GlassButton(title: "Close") { onFinish(false, false) }
                }
            }
        }
    }

    // MARK: Success

    private var successStep: some View {
        statusStack {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 52))
                .foregroundStyle(Theme.Colors.indigoLight)
                .shadow(color: Theme.Colors.indigoDeep.opacity(0.45), radius: 14, y: 8)

            Text(session.isGift ? "Gift sent" : "Ticket confirmed")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)

            Text(session.isGift
                 ? "\(session.beneficiaryEmail ?? "Your friend") can watch it right away — one single view."
                 : "This is a single-view ticket. Your watch window starts the first time you press play.")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            VStack(spacing: 12) {
                if session.isGift {
                    PrimaryButton(title: "Done") { onFinish(true, false) }
                } else {
                    PrimaryButton(title: "Watch now") { onFinish(true, true) }
                    GlassButton(title: "Later") { onFinish(true, false) }
                }
            }
            .padding(.top, 8)
        }
    }

    // MARK: Failed

    private func failedStep(_ message: String) -> some View {
        statusStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color(hex: 0xF2555A))

            Text("Payment not completed")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)

            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.65))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            VStack(spacing: 12) {
                PrimaryButton(title: "Try again") { session.retry() }
                GlassButton(title: "Close") { onFinish(false, false) }
            }
            .padding(.top, 8)
        }
    }

    // MARK: Shared layout

    private func statusStack<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 14) { content() }
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
