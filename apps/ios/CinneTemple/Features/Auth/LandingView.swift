//
//  LandingView.swift
//  CinneTemple
//
//  Cinematic entry screen with a hero and shimmering poster rows.
//

import SwiftUI

struct LandingView: View {
    @Binding var path: [AuthRoute]
    @State private var appear = false

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                Spacer(minLength: 40)

                VStack(spacing: 14) {
                    Text("CinneTemple")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(colors: [.white, Theme.Colors.brand],
                                           startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                    Text("Your cinema, reimagined.")
                        .font(.title3)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 20)

                posterRows
                    .opacity(appear ? 1 : 0)

                VStack(spacing: 12) {
                    PrimaryButton(title: "Get started") { path.append(.register) }
                    GlassButton(title: "I already have an account") { path.append(.login) }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)

                Text("Passkeys · Biometric login · Private by design")
                    .font(.footnote)
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .padding(.bottom, 30)
            }
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) { appear = true }
        }
    }

    private var posterRows: some View {
        VStack(spacing: 14) {
            ForEach(0..<3, id: \.self) { row in
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(0..<8, id: \.self) { i in
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            Color(hue: Double((row * 60 + i * 24) % 360) / 360, saturation: 0.5, brightness: 0.35),
                                            Color(hue: Double((row * 60 + i * 24 + 40) % 360) / 360, saturation: 0.6, brightness: 0.22),
                                        ],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 96, height: 144)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .strokeBorder(.white.opacity(0.12), lineWidth: 1)
                                )
                        }
                    }
                    .padding(.horizontal, 24)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}
