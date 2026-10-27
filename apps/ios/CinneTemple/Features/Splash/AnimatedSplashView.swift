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
import Combine
import SwiftUI

struct AnimatedSplashView: View {
    let onFinished: () -> Void
    var maximumDuration: Double = 6
    var configureAudioSession = true
    var fitVideo = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var player: AVPlayer?
    @State private var finished = false
    /// The clip opens a shade more violet than the launch colour; a short
    /// fade-in hides that step.
    @State private var videoOpacity = 0.0

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            if let player, !reduceMotion {
                SplashPlayerLayer(player: player, fitVideo: fitVideo)
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
        .task {
            start()
            do {
                try await Task.sleep(for: .seconds(player == nil ? 0.8 : maximumDuration))
                try Task.checkCancellation()
                finish()
            } catch { /* Disappearance cancels the timeout. */ }
        }
        // SwiftUI owns and cancels this subscription with the view. Ignore all
        // other players, including a film that starts while the splash fades.
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { note in
            guard let item = player?.currentItem, note.object as? AVPlayerItem === item else { return }
            finish()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { finish() }
        }
        .onChange(of: reduceMotion) { _, reduced in
            if reduced { finish() }
        }
        .onDisappear {
            player?.pause()
            player?.replaceCurrentItem(with: nil)
            player = nil
        }
        .accessibilityElement()
        .accessibilityLabel("CinneTemple")
        .accessibilityAddTraits(.isImage)
    }

    private func start() {
        guard !finished, player == nil else { return }
        guard !reduceMotion, let url = Bundle.main.url(forResource: "splash", withExtension: "mp4") else {
            return
        }
        // .ambient: the whoosh respects the Ring/Silent switch and mixes with
        // (never interrupts) whatever the viewer is already listening to.
        if configureAudioSession {
            try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        }
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.isMuted = false
        player = p
        p.play()
        withAnimation(.easeOut(duration: 0.3)) { videoOpacity = 1 }
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
    let fitVideo: Bool

    func makeUIView(context: Context) -> PlayerView {
        let v = PlayerView()
        v.playerLayer.player = player
        v.playerLayer.videoGravity = fitVideo ? .resizeAspect : .resizeAspectFill
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {
        uiView.playerLayer.player = player
    }

    static func dismantleUIView(_ uiView: PlayerView, coordinator: ()) {
        uiView.playerLayer.player = nil
    }

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
