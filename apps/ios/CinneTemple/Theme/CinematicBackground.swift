//
//  CinematicBackground.swift
//  CinneTemple
//
//  Slowly drifting brand-tinted aurora behind a dark base — gives the glass
//  surfaces something rich to refract. Respects reduced-motion.
//

import SwiftUI

struct CinematicBackground: View {
    @State private var animate = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()

            blob(color: Theme.Colors.brand.opacity(0.32), size: 460)
                .offset(x: animate ? -120 : -60, y: animate ? -220 : -160)
            blob(color: Theme.Colors.indigoBright.opacity(0.24), size: 420)
                .offset(x: animate ? 150 : 90, y: animate ? -40 : 40)
            blob(color: Theme.Colors.indigoDeep.opacity(0.26), size: 380)
                .offset(x: animate ? -90 : -40, y: animate ? 260 : 300)
        }
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 16).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
    }

    private func blob(color: Color, size: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .blur(radius: 90)
    }
}
