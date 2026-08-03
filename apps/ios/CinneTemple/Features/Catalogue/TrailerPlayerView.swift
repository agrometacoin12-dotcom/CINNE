//
//  TrailerPlayerView.swift
//  CinneTemple
//
//  Plain, throwaway marketing player for a title's PUBLIC trailer.
//
//  Trailers are marketing, not paid content: this player deliberately uses
//  NONE of the paid-playback machinery. No per-viewer watermark, no ScreenGuard
//  capture blanking, no PlaybackProgressReporter heartbeats, and no watch-once /
//  entitlement / viewing-window logic. It simply streams the signed trailer URL
//  with the native AVKit transport and tears the player down on dismiss.
//
//  Chrome parity with the film player: the close + fullscreen affordances live in
//  an auto-hiding top bar (tap toggles it; it auto-hides ~3.5s after the last
//  interaction) that matches VideoPlayer's own auto-hiding transport. Fullscreen
//  rotates the app into landscape via the shared PlayerRotator; there is no
//  screen-lock here (trailers are short). Orientation restores to portrait on
//  dismiss.
//

import SwiftUI
import AVKit
import Combine

struct TrailerPlayerView: View {
    /// Signed, public trailer stream URL from GET …/titles/:id/trailer.
    let urlString: String

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    /// Auto-hiding top chrome (close + fullscreen).
    @State private var chromeVisible = true
    @State private var lastInteraction = Date()
    /// True once rotated into landscape fullscreen.
    @State private var landscape = false

    private let uiTick = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            } else {
                ProgressView().tint(.white)
            }

            // Auto-hiding top bar: glass close (left) + glass fullscreen (right).
            if chromeVisible {
                VStack {
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .liquidGlass(cornerRadius: 20)
                        }
                        .buttonStyle(.plain)
                        Spacer()
                        Button { toggleFullScreen() } label: {
                            Image(systemName: landscape ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .liquidGlass(cornerRadius: 20)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    Spacer()
                }
                .transition(.opacity)
            }
        }
        .contentShape(Rectangle())
        // Recognised alongside VideoPlayer's own tap so the native transport still
        // toggles; this just mirrors that onto our top chrome.
        .simultaneousGesture(
            TapGesture().onEnded {
                withAnimation(.easeInOut(duration: 0.15)) { chromeVisible.toggle() }
                lastInteraction = Date()
            }
        )
        .onReceive(uiTick) { _ in
            // Auto-hide only while playing, so the close button stays reachable
            // when the viewer pauses.
            guard let player, player.timeControlStatus == .playing else { return }
            if chromeVisible, Date().timeIntervalSince(lastInteraction) > 3.5 {
                withAnimation(.easeInOut(duration: 0.25)) { chromeVisible = false }
            }
        }
        .onAppear {
            guard player == nil, let url = URL(string: urlString) else { return }
            let fresh = AVPlayer(url: url)
            player = fresh
            fresh.play()
            lastInteraction = Date()
        }
        .onDisappear {
            player?.pause()
            player = nil
            // Restore the app-wide portrait default when the trailer closes.
            PlayerRotator.reset()
        }
    }

    /// Enter / exit fullscreen landscape. The trailer is already a full-screen
    /// cover, so this only rotates the scene.
    private func toggleFullScreen() {
        if landscape {
            landscape = false
            PlayerRotator.reset()
        } else {
            landscape = true
            PlayerRotator.enterLandscape()
        }
        // Keep the chrome up right after rotating, regardless of the simultaneous
        // container tap that also fired on this press (runs after the gesture).
        Task { @MainActor in
            withAnimation(.easeInOut(duration: 0.15)) { chromeVisible = true }
            lastInteraction = Date()
        }
    }
}
