//
//  LandingView.swift
//  CinneTemple
//
//  Onboarding / Welcome — exact Figma (node 42:13448): poster-collage backdrop at
//  25% behind a top→bottom scrim, centered indigo play-logo + "Cinnetemple"
//  wordmark, and a bottom liquid-glass panel with title, subtitle, dot pagination,
//  an indigo-glass "Get Started" button, and a sign-in link.
//

import SwiftUI

struct LandingView: View {
    @Binding var path: [AuthRoute]
    @State private var appear = false

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()

            // Poster-wall photo (exact Figma backdrop, 42:13448)
            GeometryReader { geo in
                Image("PosterWall")
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
                    .opacity(0.25)
            }
            .ignoresSafeArea()

            // Scrim
            LinearGradient(
                stops: [
                    .init(color: Theme.Colors.bgBase.opacity(0), location: 0),
                    .init(color: Theme.Colors.bgBase.opacity(0.35), location: 0.45),
                    .init(color: Theme.Colors.bgBase.opacity(0.98), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .overlay(Color.black.opacity(0.45))
            .ignoresSafeArea()

            VStack {
                Spacer().frame(height: 150)
                VStack(spacing: 14) {
                    Image("CLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72, height: 72)
                        .shadow(color: Theme.Colors.indigoDeep.opacity(0.4), radius: 14, y: 8)
                    Text("Cinnetemple").font(.system(size: 30, weight: .bold)).foregroundStyle(.white)
                }
                .opacity(appear ? 1 : 0).offset(y: appear ? 0 : 16)

                Spacer()

                // Welcome panel
                VStack(spacing: 0) {
                    Text("Movies without limits")
                        .font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        .padding(.top, 36)
                    Text("Stream thousands of movies and shows.\nAnywhere, anytime — all in one temple.")
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.65))
                        .multilineTextAlignment(.center).lineSpacing(4)
                        .padding(.top, 12)
                    HStack(spacing: 6) {
                        Capsule().fill(Theme.Colors.indigoLight).frame(width: 18, height: 6)
                        Circle().fill(.white.opacity(0.25)).frame(width: 6, height: 6)
                        Circle().fill(.white.opacity(0.25)).frame(width: 6, height: 6)
                    }
                    .padding(.top, 16)

                    Button { path.append(.register) } label: {
                        Text("Get Started").font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .liquidGlass(cornerRadius: 12, tint: Theme.Colors.brand)
                    }
                    .buttonStyle(PressableButtonStyle())
                    .padding(.top, 20)

                    Button { path.append(.login) } label: {
                        Text("I already have an account")
                            .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.Colors.indigoLight)
                    }
                    .padding(.vertical, 18)
                }
                .padding(.horizontal, 16)
                .liquidGlass(cornerRadius: 20)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.6)) { appear = true } }
    }
}
