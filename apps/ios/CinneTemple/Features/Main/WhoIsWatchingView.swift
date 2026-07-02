//
//  WhoIsWatchingView.swift
//  CinneTemple
//
//  Who's Watching — exact Figma (node 42:14753): poster-collage backdrop + scrim,
//  "Who's watching?" heading, a 2×2 grid of round colored-initial profiles plus an
//  "Add profile" tile, and a glass "Manage Profiles" pill.
//

import SwiftUI

struct WhoIsWatchingView: View {
    @EnvironmentObject private var session: SessionStore
    var onContinue: () -> Void = {}

    private struct Profile: Identifiable { let id = UUID(); let initials: String; let name: String; let color: Color }

    private var profiles: [Profile] {
        let me = (session.user?.profile?.displayName ?? session.user?.email ?? "You").split(separator: " ").first.map(String.init) ?? "You"
        return [
            Profile(initials: String(me.prefix(2)).uppercased(), name: me, color: Color(hex: 0x6366F1)),
            Profile(initials: "SG", name: "Shams", color: Color(hex: 0x8A5A34)),
            Profile(initials: "KD", name: "Kids", color: Color(hex: 0x2F7D5B)),
        ]
    }

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                ForEach(0..<15, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 6)
                        .fill(LinearGradient(colors: [
                            Color(hue: Double((i * 37) % 360) / 360, saturation: 0.5, brightness: 0.35),
                            Color(hue: Double((i * 37 + 40) % 360) / 360, saturation: 0.6, brightness: 0.22),
                        ], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(height: 180)
                }
            }
            .opacity(0.25).ignoresSafeArea()
            Color.black.opacity(0.55).ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer().frame(height: 110)
                Text("Who's watching?").font(.system(size: 28, weight: .bold)).foregroundStyle(.white)
                Text("Pick a profile to continue").font(.system(size: 13)).foregroundStyle(.white.opacity(0.6)).padding(.top, 4)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 32) {
                    ForEach(profiles) { p in
                        Button { onContinue() } label: { profileTile(p.initials, p.name, p.color) }
                            .buttonStyle(.plain)
                    }
                    VStack(spacing: 10) {
                        ZStack {
                            Circle().fill(.white.opacity(0.06))
                            Image(systemName: "plus").font(.system(size: 28)).foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(width: 104, height: 104)
                        Text("Add profile").font(.system(size: 14)).foregroundStyle(.white.opacity(0.6))
                    }
                }
                .padding(.top, 40).padding(.horizontal, 40)

                Button { } label: {
                    Text("Manage Profiles").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 24).padding(.vertical, 12)
                        .liquidGlass(cornerRadius: 12)
                }
                .padding(.top, 56)
                Spacer()
            }
        }
    }

    private func profileTile(_ initials: String, _ name: String, _ color: Color) -> some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(color)
                Text(initials).font(.system(size: 30, weight: .bold)).foregroundStyle(.white)
            }
            .frame(width: 104, height: 104)
            Text(name).font(.system(size: 14)).foregroundStyle(.white.opacity(0.85))
        }
    }
}
