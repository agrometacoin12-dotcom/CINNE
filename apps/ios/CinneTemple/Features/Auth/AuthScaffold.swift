//
//  AuthScaffold.swift
//  CinneTemple
//
//  Shared layout for auth screens: a centered glass panel with title/subtitle.
//

import SwiftUI

struct AuthScaffold<Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()

            // Poster collage + scrim (Figma auth backdrop)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                ForEach(0..<15, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 6)
                        .fill(LinearGradient(
                            colors: [
                                Color(hue: Double((i * 37) % 360) / 360, saturation: 0.5, brightness: 0.35),
                                Color(hue: Double((i * 37 + 40) % 360) / 360, saturation: 0.6, brightness: 0.22),
                            ],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(height: 180)
                }
            }
            .opacity(0.25).ignoresSafeArea()
            Color.black.opacity(0.55).ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.indigoGradient)
                        Image(systemName: "play.fill").font(.system(size: 24)).foregroundStyle(.white)
                    }
                    .frame(width: 56, height: 56)
                    .shadow(color: Theme.Colors.indigoDeep.opacity(0.4), radius: 12, y: 6)
                    .padding(.top, 40)

                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(title)
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(Theme.Colors.textPrimary)
                            if let subtitle {
                                Text(subtitle)
                                    .font(.system(size: 13))
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                            content
                                .padding(.top, 18)
                        }
                        .padding(24)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
    }
}

struct ErrorBanner: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.Colors.brand.opacity(0.25),
                       in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .strokeBorder(Theme.Colors.brand.opacity(0.5), lineWidth: 1)
            )
    }
}

struct SuccessBanner: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.green.opacity(0.22),
                       in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .strokeBorder(Color.green.opacity(0.5), lineWidth: 1)
            )
    }
}
