//
//  SecurePlayerView.swift
//  CinneTemple
//
//  Entitlement-gated AVKit player with native anti-piracy: blanks the content
//  while the screen is being recorded/mirrored, burns a drifting per-viewer
//  watermark, and enforces the single-view window with a countdown + lockout.
//

import SwiftUI
import AVKit
import Combine

struct SecurePlayerView: View {
    let session: PlaybackSession

    @StateObject private var screenGuard = ScreenGuard()
    @State private var player: AVPlayer?
    @State private var watermarkOffset: CGSize = .zero
    @State private var remaining: String?
    @State private var locked = false

    private let drift = Timer.publish(every: 4, on: .main, in: .common).autoconnect()
    private let ticker = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                if locked {
                    lockedOverlay
                } else if screenGuard.isCaptured {
                    captureBlockedOverlay
                } else if let player {
                    VideoPlayer(player: player)
                        .disabled(false)
                }

                if !locked && !screenGuard.isCaptured {
                    watermark
                        .offset(watermarkOffset)
                        .animation(.easeInOut(duration: 1.2), value: watermarkOffset)
                        .allowsHitTesting(false)
                }

                VStack {
                    HStack {
                        if let remaining {
                            Text(remaining)
                                .font(.caption2)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.black.opacity(0.5), in: Capsule())
                                .foregroundStyle(.white.opacity(0.85))
                        }
                        Spacer()
                    }
                    Spacer()
                    HStack {
                        Spacer()
                        Text("CinneTemple · \(session.watermark)")
                            .font(.system(size: 9))
                            .foregroundStyle(.white.opacity(0.3))
                            .padding(8)
                    }
                }
                .allowsHitTesting(false)
            }
            .onReceive(drift) { _ in
                let w = geo.size.width, h = geo.size.height
                watermarkOffset = CGSize(
                    width: .random(in: -w/3...w/3),
                    height: .random(in: -h/3...h/3)
                )
            }
        }
        .aspectRatio(16.0/9.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .onAppear(perform: setUp)
        .onDisappear { player?.pause() }
        .onChange(of: screenGuard.isCaptured) { _, captured in
            if captured { player?.pause() } else if !locked { player?.play() }
        }
        .onReceive(ticker) { _ in updateRemaining() }
    }

    private var watermark: some View {
        Text(session.watermark)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(.white.opacity(0.35))
            .shadow(color: .black.opacity(0.6), radius: 2)
    }

    private var captureBlockedOverlay: some View {
        VStack(spacing: 10) {
            Image(systemName: "eye.slash.fill").font(.largeTitle)
            Text("Playback paused")
                .font(.headline)
            Text("Screen recording and mirroring aren’t allowed during playback.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 30)
        }
        .foregroundStyle(.white)
    }

    private var lockedOverlay: some View {
        VStack(spacing: 8) {
            Image(systemName: "hourglass").font(.largeTitle)
            Text("Your viewing window has ended").font(.headline)
            Text("This was a single-view ticket. Purchase again to rewatch.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 30)
        }
        .foregroundStyle(.white)
    }

    private func setUp() {
        if player == nil, let url = URL(string: session.url) {
            player = AVPlayer(url: url)
        }
        updateRemaining()
        if !locked && !screenGuard.isCaptured { player?.play() }
    }

    private func updateRemaining() {
        guard let expiry = session.expiryDate else { remaining = nil; return }
        let secs = expiry.timeIntervalSinceNow
        if secs <= 0 {
            locked = true
            player?.pause()
            remaining = nil
            return
        }
        let h = Int(secs) / 3600, m = (Int(secs) % 3600) / 60
        remaining = h > 0 ? "\(h)h \(m)m left" : "\(m)m left"
    }
}
