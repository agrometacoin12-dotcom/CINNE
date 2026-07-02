//
//  NotificationsView.swift
//  CinneTemple
//
//  Notifications — exact Figma (node 42:15304): back / title / Clear all top bar,
//  Today & Earlier sections of glass notification rows (promo row indigo-tinted).
//

import SwiftUI

struct NotificationsView: View {
    @Environment(\.dismiss) private var dismiss

    private struct Note: Identifiable { let id = UUID(); let icon: String; let title: String; let body: String; let time: String; var promo = false }

    private let today: [Note] = [
        Note(icon: "film", title: "New on Cinnetemple", body: "Alita: Battle Angel is now streaming", time: "2h"),
        Note(icon: "play.circle", title: "New episode", body: "Spider-Verse S1 E5 just dropped", time: "5h"),
    ]
    private let earlier: [Note] = [
        Note(icon: "arrow.down.circle", title: "Download complete", body: "The Wolf of Wall Street is ready to watch offline", time: "1d"),
        Note(icon: "star.fill", title: "Lifetime offer", body: "Pay once, watch forever — 40% off today only", time: "2d", promo: true),
    ]

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.left").font(.system(size: 16)).foregroundStyle(.white)
                                .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                        }
                        Spacer()
                        Text("Notifications").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                        Spacer()
                        Text("Clear all").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.Colors.indigoLight)
                    }
                    .padding(.bottom, 24)

                    Text("Today").font(.system(size: 13)).foregroundStyle(.white.opacity(0.5))
                    VStack(spacing: 12) { ForEach(today) { row($0) } }.padding(.top, 12)

                    Text("Earlier").font(.system(size: 13)).foregroundStyle(.white.opacity(0.5)).padding(.top, 28)
                    VStack(spacing: 12) { ForEach(earlier) { row($0) } }.padding(.top, 12)
                }
                .padding(.horizontal, 16).padding(.top, 12)
            }
            .scrollIndicators(.hidden)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func row(_ n: Note) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(n.promo ? Theme.Colors.brand.opacity(0.4) : Color.white.opacity(0.08))
                Image(systemName: n.icon).font(.system(size: 15)).foregroundStyle(.white)
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(n.title).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                Text(n.body).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
            }
            Spacer()
            Text(n.time).font(.system(size: 11)).foregroundStyle(.white.opacity(0.4))
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .liquidGlass(cornerRadius: 14, tint: n.promo ? Theme.Colors.brand : nil)
    }
}
