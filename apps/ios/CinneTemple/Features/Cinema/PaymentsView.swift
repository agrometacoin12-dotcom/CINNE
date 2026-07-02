//
//  PaymentsView.swift
//  CinneTemple
//
//  Payments — exact Figma (nodes 42:15375 / 42:15449): plan selection with radios +
//  unlock list, then a Payment Details form (Bank Transfer / Card Payment tabs).
//  The card form is presentational — real payments route through StoreKit / Paystack.
//

import SwiftUI

struct PaymentsView: View {
    @Environment(\.dismiss) private var dismiss
    var onDone: () -> Void = {}

    @State private var step = 1
    @State private var plan = "lifetime"
    @State private var method = "card"
    @State private var billedTo = ""
    @State private var holder = ""
    @State private var cardNumber = ""
    @State private var cvv = ""
    @State private var expiry = ""

    private struct Plan: Identifiable { let id: String; let name: String; let desc: String; let price: String; var promo = false }
    private let plans = [
        Plan(id: "monthly", name: "Monthly Plan", desc: "The Wolf of Wall Street is ready…", price: "$12/Month"),
        Plan(id: "lifetime", name: "Lifetime offer", desc: "Pay once, watch forever — 40% off today only", price: "", promo: true),
        Plan(id: "quarterly", name: "Quarterly Plan", desc: "The Wolf of Wall Street is …", price: "$12/Quarter"),
        Plan(id: "annual", name: "Annual Plan", desc: "The Wolf of Wall Street is ready…", price: "$12/Year"),
    ]
    private let unlock = [
        "Unlimited access to all movies and shows, anytime",
        "Watch without ads for an uninterrupted experience",
        "Exclusive early releases and bonus content",
        "Download favorites for offline viewing",
        "One-time payment with no recurring fees",
        "Priority customer support whenever you need it",
    ]

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Button { step == 2 ? (step = 1) : dismiss() } label: {
                            Image(systemName: "chevron.left").font(.system(size: 16)).foregroundStyle(.white)
                                .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                        }
                        Spacer()
                        Text("Payments").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                        Spacer()
                        Color.clear.frame(width: 40, height: 40)
                    }
                    .padding(.bottom, 20)

                    Text("Activate Your CinneTemple Subscription").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)

                    if step == 1 { planStep } else { detailStep }
                }
                .padding(.horizontal, 16).padding(.top, 12)
            }
            .scrollIndicators(.hidden)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var planStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 12) {
                ForEach(plans) { p in
                    Button { plan = p.id } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().stroke(plan == p.id ? Color.white : Color.white.opacity(0.5), lineWidth: 2).frame(width: 20, height: 20)
                                if plan == p.id { Circle().fill(.white).frame(width: 10, height: 10) }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                                Text(p.desc).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                            }
                            Spacer()
                            if !p.price.isEmpty { Text(p.price).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)) }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .liquidGlass(cornerRadius: 14, tint: plan == p.id ? Theme.Colors.brand : nil)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 20)

            Text("Here's what you'll unlock").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).padding(.top, 28)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(unlock, id: \.self) { u in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•").foregroundStyle(Theme.Colors.indigoLight)
                        Text(u).font(.system(size: 13)).foregroundStyle(.white.opacity(0.7))
                    }
                }
            }
            .padding(.top, 12)

            Button { step = 2 } label: {
                Text("Proceed").font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 48).liquidGlass(cornerRadius: 12, tint: Theme.Colors.brand)
            }
            .buttonStyle(PressableButtonStyle()).padding(.top, 28)
        }
    }

    private var detailStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Payment Details").font(.system(size: 16, weight: .bold)).foregroundStyle(.white).padding(.top, 20)
            HStack(spacing: 24) {
                ForEach(["bank", "card"], id: \.self) { m in
                    Button { method = m } label: {
                        Text(m == "bank" ? "Bank Transfer" : "Card Payment")
                            .font(.system(size: 13, weight: method == m ? .semibold : .regular))
                            .foregroundStyle(method == m ? Color.white : Color.white.opacity(0.5))
                            .overlay(alignment: .bottom) {
                                if method == m { Rectangle().fill(Theme.Colors.indigoLight).frame(height: 2).offset(y: 8) }
                            }
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.top, 16).padding(.bottom, 8)
            Divider().overlay(Color.white.opacity(0.1))

            if method == "card" {
                VStack(spacing: 16) {
                    GlassField(title: "Billed to", text: $billedTo, autocapitalization: .words)
                    GlassField(title: "Card Holder's Name", text: $holder, autocapitalization: .words)
                    GlassField(title: "Card Number", text: $cardNumber, keyboard: .numberPad)
                    HStack(spacing: 16) {
                        GlassField(title: "CVV", text: $cvv, keyboard: .numberPad)
                        GlassField(title: "Expiry Date", text: $expiry, keyboard: .numbersAndPunctuation)
                    }
                }
                .padding(.top, 20)
            } else {
                Text("Transfer to the account shown after you tap Proceed. We'll confirm automatically.")
                    .font(.system(size: 13)).foregroundStyle(.white.opacity(0.7))
                    .frame(maxWidth: .infinity).padding(24).liquidGlass(cornerRadius: 12).padding(.top, 20)
            }

            HStack {
                Text("Total to be Billed").font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
                Spacer()
                Text("$12/Year").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
            }
            .padding(.top, 24)

            Button { onDone(); dismiss() } label: {
                Text("Proceed").font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 48).liquidGlass(cornerRadius: 12, tint: Theme.Colors.brand)
            }
            .buttonStyle(PressableButtonStyle()).padding(.top, 16)
        }
    }
}
