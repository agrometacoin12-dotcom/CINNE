//
//  AnimatedSplashView.swift
//  CinneTemple
//
//  Plays the branded logo reveal (Resources/splash.mp4 — light streaks, then a
//  cinematic whoosh landing as the logo locks in) once per cold launch, then
//  fades into the app. The static launch screen is just the backdrop colour so
//  the hand-off into the clip's dark opening frame is seamless.
//

import AVFoundation
import SwiftUI

struct AnimatedSplashView: View {
    let onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var player: AVPlayer?
    @State private var finished = false
    /// The clip opens a shade more violet than the launch colour; a short
    /// fade-in hides that step.
    @State private var videoOpacity = 0.0

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            if let player, !reduceMotion {
                SplashPlayerLayer(player: player)
                    .ignoresSafeArea()
                    .opacity(videoOpacity)
            } else {
                // Reduce Motion (or a missing clip): the still logo, briefly.
                Image("SplashLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 300)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { finish() } // tap to skip
        .onAppear(perform: start)
        .accessibilityElement()
        .accessibilityLabel("CinneTemple")
        .accessibilityAddTraits(.isImage)
    }

    private func start() {
        guard !reduceMotion, let url = Bundle.main.url(forResource: "splash", withExtension: "mp4") else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { finish() }
            return
        }
        // .ambient: the whoosh respects the Ring/Silent switch and mixes with
        // (never interrupts) whatever the viewer is already listening to.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.isMuted = false
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { _ in finish() }
        player = p
        p.play()
        withAnimation(.easeOut(duration: 0.3)) { videoOpacity = 1 }
        // Safety net: never hold the app hostage if playback stalls.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        player?.pause()
        onFinished()
    }
}

/// AVPlayerLayer with aspect-fill so the 9:16 clip covers any iPhone screen.
private struct SplashPlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerView {
        let v = PlayerView()
        v.playerLayer.player = player
        v.playerLayer.videoGravity = .resizeAspectFill
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {}

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
