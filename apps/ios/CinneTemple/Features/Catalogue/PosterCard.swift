//
//  PosterCard.swift
//  CinneTemple
//
//  Poster tile used across rows, search, and watchlist. Async image with a
//  deterministic gradient fallback.
//

import SwiftUI

struct PosterCard: View {
    let item: TitleSummary
    var width: CGFloat = 120

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let urlString = item.posterUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    gradientFallback
                }
            } else {
                gradientFallback
                Text(item.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .padding(8)
            }
        }
        .frame(width: width, height: width * 1.5)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(.white.opacity(0.35), lineWidth: 1.3)
        )
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var gradientFallback: some View {
        LinearGradient(colors: item.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
