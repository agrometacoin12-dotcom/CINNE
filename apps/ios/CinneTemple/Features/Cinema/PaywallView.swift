//
//  PaywallView.swift
//  CinneTemple
//
//  Go Premium paywall — exact Figma (node 65:585): indigo glow backdrop, glass
//  close button, "Go Premium" title + "Unlock the full temple experience",
//  three glass plan cards (Basic / Standard / Premium with a MOST POPULAR
//  crown chip), an indigo "Start 30-day free trial" button and the
//  cancel/restore/terms footnote.
//

import SwiftUI

struct PaywallPlan: Identifiable {
    let id: String
    let name: String
    let price: String
    let features: [String]
    var popular = false
}

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selected = "premium"

    private let plans: [PaywallPlan] = [
        .init(id: "basic", name: "Basic", price: "$4.99",
              features: ["720p streaming", "1 screen at a time", "Mobile & tablet"]),
        .init(id: "standard", name: "Standard", price: "$9.99",
              features: ["1080p Full HD", "2 screens at once", "Downloads included"]),
        .init(id: "premium", name: "Premium", price: "$14.99",
              features: ["4K HDR + spatial audio", "4 screens at once", "Live premieres & chat", "Downloads included"],
              popular: true),
    ]

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()

            // Glow — 65:586
            RadialGradient(colors: [Theme.Colors.brand.opacity(0.35), .clear],
                           center: .top, startRadius: 20, endRadius: 420)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Close — 65:587
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .liquidGlass(cornerRadius: 18)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)

                Text("Go Premium")
                    .font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
                    .padding(.top, 2)
                Text("Unlock the full temple experience")
                    .font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
                    .padding(.top, 6)

                ScrollView {
                    VStack(spacing: 16) {
                        ForEach(plans) { plan in planCard(plan) }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 22)
                }
                .scrollIndicators(.hidden)

                Button {} label: {
                    Text("Start 30-day free trial")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .liquidGlass(cornerRadius: 13, tint: Theme.Colors.brand)
                }
                .buttonStyle(PressableButtonStyle())
                .padding(.horizontal, 24)
                .padding(.top, 12)

                Text("Cancel anytime  •  Restore purchase  •  Terms apply")
                    .font(.system(size: 11)).foregroundStyle(.white.opacity(0.45))
                    .padding(.top, 16)
                    .padding(.bottom, 12)
            }
        }
    }

    // Plan card — 345×150 (Premium 190) rounded glass with check rows.
    private func planCard(_ plan: PaywallPlan) -> some View {
        Button { selected = plan.id } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(plan.name)
                        .font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                    Spacer()
                    Text(plan.price)
                        .font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    Text("/mo")
                        .font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
                }
                VStack(alignment: .leading, spacing: 11) {
                    ForEach(plan.features, id: \.self) { f in
                        HStack(spacing: 9) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(Theme.Colors.indigoLight)
                            Text(f).font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }
                .padding(.top, 16)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 16, tint: selected == plan.id ? Theme.Colors.brand : nil)
            .overlay(alignment: .topTrailing) {
                if plan.popular {
                    HStack(spacing: 4) {
                        Image(systemName: "crown.fill").font(.system(size: 9))
                        Text("MOST POPULAR").font(.system(size: 9, weight: .bold)).tracking(0.6)
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10).frame(height: 24)
                    .background(Theme.Colors.brand.opacity(0.85), in: Capsule())
                    .offset(x: -12, y: -10)
                }
            }
        }
        .buttonStyle(PressableButtonStyle())
    }
}
