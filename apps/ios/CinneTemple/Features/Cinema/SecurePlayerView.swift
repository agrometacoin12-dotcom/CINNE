//
//  SecurePlayerView.swift
//  CinneTemple
//
//  Entitlement-gated player with native anti-piracy: blanks the content while
//  the screen is being recorded/mirrored, burns a drifting per-viewer
//  watermark, and enforces the single-view window with a countdown + lockout.
//
//  Custom overlay per the cross-platform design contract §12 (identical to
//  Android's SecurePlayer): glass back circle + centered title + CC circle on
//  top, expiry chip top-left, center transport (−15s / big indigo play-pause /
//  +15s), and a bottom panel with the progress bar + timecodes. Controls
//  toggle on tap and auto-hide after 3.5s of playback.
//

import SwiftUI
import AVKit
import Combine

struct SecurePlayerView: View {
    let session: PlaybackSession
    /// Watch-progress heartbeats (10s beat + pause/end/disappear flushes) and
    /// the one-shot resume seek; nil disables reporting (e.g. previews).
    var reporter: PlaybackProgressReporter? = nil
    /// Continue-watching resume point; seeks once when the item is ready.
    var resumeSeconds: Int? = nil

    @Environment(\.dismiss) private var dismiss
    @StateObject private var screenGuard = ScreenGuard()
    @State private var player: AVPlayer?
    @State private var watermarkOffset: CGSize = .zero
    @State private var remaining: String?
    @State private var locked = false

    // Custom transport state
    @State private var controlsVisible = true
    @State private var isPlaying = false
    @State private var positionSeconds: Double = 0
    @State private var durationSeconds: Double = 0
    @State private var scrubbing = false
    @State private var scrubPosition: Double = 0

    private let drift = Timer.publish(every: 4, on: .main, in: .common).autoconnect()
    private let ticker = Timer.publish(every: 30, on: .main, in: .common).autoconnect()
    private let uiTick = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
    /// Auto-hide deadline: controls disappear 3.5s after the last interaction.
    @State private var lastInteraction = Date()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                if locked {
                    lockedOverlay
                } else if screenGuard.isCaptured {
                    captureBlockedOverlay
                } else if let player {
                    PlayerLayerView(player: player)
                }

                if !locked && !screenGuard.isCaptured {
                    watermark
                        .offset(watermarkOffset)
                        .animation(.easeInOut(duration: 1.2), value: watermarkOffset)
                        .allowsHitTesting(false)
                }

                // Corner badge — always burned in while playing.
                if !locked && !screenGuard.isCaptured {
                    VStack {
                        Spacer()
                        HStack(spacing: 4) {
                            Spacer()
                            Image("CLogo")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 14)
                                .opacity(0.3)
                            Text("CinneTemple · \(session.watermark)")
                                .font(.system(size: 9))
                                .foregroundStyle(.white.opacity(0.3))
                        }
                    }
                    .padding(8)
                    .allowsHitTesting(false)
                }

                if !locked && !screenGuard.isCaptured && controlsVisible {
                    controlsOverlay
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                guard !locked else { return }
                withAnimation(.easeInOut(duration: 0.15)) { controlsVisible.toggle() }
                lastInteraction = Date()
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
        .onDisappear {
            player?.pause()
            // Final beat + tear down the periodic time observer while the
            // player is guaranteed alive (AVFoundation requires removal
            // before the player goes away). setUp() re-attaches on reappear.
            reporter?.detach()
        }
        .onChange(of: screenGuard.isCaptured) { _, captured in
            if captured { player?.pause() } else if !locked { player?.play() }
        }
        .onReceive(ticker) { _ in updateRemaining() }
        .onReceive(uiTick) { _ in syncTransportState() }
    }

    // MARK: - Contract §12 overlay

    private var controlsOverlay: some View {
        VStack(spacing: 0) {
            // Top bar — glass back circle, centered title, glass CC circle.
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 16)).foregroundStyle(.white)
                        .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                }
                .buttonStyle(.plain)
                Spacer()
                // Movies show the title; episode sessions show the episode name.
                Text(session.displayTitle).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                Spacer()
                Text("CC").font(.system(size: 12)).foregroundStyle(.white)
                    .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
            }
            .padding(.horizontal, 16).padding(.top, 8)

            // Expiry chip — top-left, under the bar.
            if let remaining {
                HStack {
                    Text(remaining)
                        .font(.caption2)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(.black.opacity(0.5), in: Capsule())
                        .foregroundStyle(.white.opacity(0.85))
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.top, 8)
            }

            Spacer()

            // Center transport: −15s / big indigo play-pause / +15s.
            HStack(spacing: 28) {
                transportButton(icon: "gobackward.15", size: 44, iconSize: 18) {
                    seek(by: -15)
                }
                Button { togglePlayPause() } label: {
                    ZStack {
                        Circle().fill(Theme.Colors.brand.opacity(0.85))
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 64, height: 64)
                    .shadow(color: Theme.Colors.indigoDeep.opacity(0.5), radius: 10, y: 4)
                }
                .buttonStyle(.plain)
                transportButton(icon: "goforward.15", size: 44, iconSize: 18) {
                    seek(by: 15)
                }
            }

            Spacer()

            // Bottom panel: progress + timecodes on a dark strip.
            HStack(spacing: 8) {
                Text(Self.timecode(scrubbing ? scrubPosition : positionSeconds))
                    .font(.system(size: 11)).monospacedDigit()
                    .foregroundStyle(.white.opacity(0.9))
                Slider(
                    value: Binding(
                        get: { scrubbing ? scrubPosition : min(positionSeconds, max(durationSeconds, 1)) },
                        set: { scrubPosition = $0 }
                    ),
                    in: 0...max(durationSeconds, 1)
                ) { editing in
                    if editing {
                        scrubbing = true
                    } else {
                        player?.seek(to: CMTime(seconds: scrubPosition, preferredTimescale: 600))
                        positionSeconds = scrubPosition
                        scrubbing = false
                    }
                    lastInteraction = Date()
                }
                .tint(Theme.Colors.indigoLight)
                Text(Self.timecode(durationSeconds))
                    .font(.system(size: 11)).monospacedDigit()
                    .foregroundStyle(.white.opacity(0.9))
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(.black.opacity(0.35))
        }
        .transition(.opacity)
    }

    private func transportButton(icon: String, size: CGFloat, iconSize: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Circle().fill(.black.opacity(0.45))
                Image(systemName: icon).font(.system(size: iconSize)).foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Transport actions

    private func togglePlayPause() {
        guard let player else { return }
        if isPlaying { player.pause() } else { player.play() }
        isPlaying.toggle()
        lastInteraction = Date()
    }

    private func seek(by delta: Double) {
        guard let player else { return }
        var target = player.currentTime().seconds + delta
        target = max(0, durationSeconds > 0 ? min(target, durationSeconds) : target)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        positionSeconds = target
        lastInteraction = Date()
    }

    /// 0.5s UI tick: sync position/duration/playing state and auto-hide the
    /// controls 3.5s after the last interaction while playback runs.
    private func syncTransportState() {
        guard let player else { return }
        isPlaying = player.timeControlStatus == .playing
        if !scrubbing {
            let pos = player.currentTime().seconds
            if pos.isFinite { positionSeconds = max(0, pos) }
        }
        if let d = player.currentItem?.duration.seconds, d.isFinite, d > 0 {
            durationSeconds = d
        } else if durationSeconds == 0 {
            durationSeconds = Double(session.durationSeconds)
        }
        if controlsVisible, isPlaying, !scrubbing,
           Date().timeIntervalSince(lastInteraction) > 3.5 {
            withAnimation(.easeInOut(duration: 0.25)) { controlsVisible = false }
        }
    }

    // MARK: - Watermark + guard overlays

    private var watermark: some View {
        VStack(spacing: 3) {
            Image("CLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 48)
                .opacity(0.25)
            Text(session.watermark)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.35))
                .shadow(color: .black.opacity(0.6), radius: 2)
        }
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

    // MARK: - Lifecycle

    private func setUp() {
        if player == nil, let url = URL(string: session.url) {
            let fresh = AVPlayer(url: url)
            player = fresh
            reporter?.attach(to: fresh, resumeSeconds: resumeSeconds)
        } else if let player {
            // Reappearing after onDisappear tore the observers down — resume
            // heartbeats (the one-shot resume seek has already been handled).
            reporter?.attach(to: player)
        }
        durationSeconds = Double(session.durationSeconds)
        updateRemaining()
        if !locked && !screenGuard.isCaptured {
            player?.play()
            isPlaying = true
        }
        lastInteraction = Date()
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

    /// "1:23:45" / "12:05" player timecodes (matches Android formatTimecode).
    static func timecode(_ seconds: Double) -> String {
        let total = Int(max(0, seconds.isFinite ? seconds : 0))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}

/// Controller-less video surface: bare AVPlayerLayer so the contract-§12
/// custom overlay is the only control chrome.
private struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    final class LayerHostView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerHostView {
        let view = LayerHostView()
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: LayerHostView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }
}
