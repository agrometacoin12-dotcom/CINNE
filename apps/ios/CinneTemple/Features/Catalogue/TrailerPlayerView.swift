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
//  with the native AVKit controls and tears the player down on dismiss.
//

import SwiftUI
import AVKit

struct TrailerPlayerView: View {
    /// Signed, public trailer stream URL from GET …/titles/:id/trailer.
    let urlString: String

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            } else {
                ProgressView().tint(.white)
            }

            // Simple close affordance — fullScreenCover has no nav chrome.
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
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                Spacer()
            }
        }
        .onAppear {
            guard player == nil, let url = URL(string: urlString) else { return }
            let fresh = AVPlayer(url: url)
            player = fresh
            fresh.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }
}
