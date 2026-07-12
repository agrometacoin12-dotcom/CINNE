//
//  PlaybackProgressReporter.swift
//  CinneTemple
//
//  Fire-and-forget watch-progress heartbeats — PUT /v1/playback/{titleId}/progress
//  every ~10s while playing, plus on pause, on disappear, and when playback ends.
//  The server uses these beats for Continue Watching and for the watch-once
//  trigger (progress ≥ 0.95 consumes the active entitlement), so delivery is
//  best-effort by design: failures are silent and never interrupt playback.
//  Also owns the one-shot resume seek for continue-watching entries.
//

import Foundation
import AVFoundation
import Combine

/// Ack shape of PUT /v1/playback/{titleId}/progress (decoded for completeness;
/// the reporter never surfaces it).
struct PlaybackProgressAck: Decodable {
    let titleId: String
    let positionSeconds: Int
    let durationSeconds: Int
    let progress: Double
    let updatedAt: String
}

@MainActor
final class PlaybackProgressReporter: ObservableObject {

    private let titleId: String
    /// Session-provided duration, used when the player item's duration is
    /// indefinite/unknown (the API rejects durationSeconds ≤ 0).
    private let fallbackDurationSeconds: Int
    private weak var tokenProvider: TokenProviding?
    private let baseURL: URL

    private weak var player: AVPlayer?
    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    private var pendingResumeSeconds: Int?
    private var didHandleResume = false
    private var hasStartedPlaying = false
    private var lastSentPosition = -1

    init(titleId: String,
         fallbackDurationSeconds: Int,
         tokenProvider: TokenProviding?,
         baseURL: URL = AppConfig.apiBaseURL) {
        self.titleId = titleId
        self.fallbackDurationSeconds = fallbackDurationSeconds
        self.tokenProvider = tokenProvider
        self.baseURL = baseURL
    }

    deinit {
        // AVFoundation requires removing periodic observers before the player
        // goes away; player is held weakly so it may already be gone.
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
    }

    // MARK: - Wiring

    /// Hooks the reporter onto a freshly created player. Call once per player.
    func attach(to player: AVPlayer, resumeSeconds: Int? = nil) {
        detachObservers()
        self.player = player
        pendingResumeSeconds = (resumeSeconds ?? 0) > 1 ? resumeSeconds : nil
        didHandleResume = pendingResumeSeconds == nil
        hasStartedPlaying = false
        lastSentPosition = -1

        // ~10s heartbeat while the clock runs.
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 10, preferredTimescale: 600),
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.flush() }
        }

        // Beat on every pause so the server-side resume point stays fresh.
        player.publisher(for: \.timeControlStatus)
            .removeDuplicates()
            .sink { [weak self] status in
                guard let self else { return }
                switch status {
                case .playing:
                    self.hasStartedPlaying = true
                case .paused where self.hasStartedPlaying:
                    self.flush()
                default:
                    break
                }
            }
            .store(in: &cancellables)

        // Final beat when playback reaches the end — lands at ≥ 0.95 progress,
        // which consumes the single-view entitlement (idempotent server-side).
        NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)
            .sink { [weak self] note in
                guard let self,
                      let item = note.object as? AVPlayerItem,
                      item === self.player?.currentItem else { return }
                self.flush(playbackEnded: true)
            }
            .store(in: &cancellables)

        // One-shot resume seek once the item is ready to play.
        if pendingResumeSeconds != nil {
            player.publisher(for: \.currentItem?.status)
                .compactMap { $0 }
                .filter { $0 == .readyToPlay }
                .first()
                .sink { [weak self] _ in self?.performResumeSeek() }
                .store(in: &cancellables)
        }
    }

    /// Sends a final beat and tears down observation. Safe to call repeatedly.
    func detach() {
        flush()
        detachObservers()
    }

    private func detachObservers() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        cancellables.removeAll()
        player = nil
    }

    // MARK: - Resume

    private func performResumeSeek() {
        guard !didHandleResume, let target = pendingResumeSeconds, let player else { return }
        didHandleResume = true
        pendingResumeSeconds = nil
        // Keep the seek clear of the tail so resuming never instantly trips
        // the 0.95 consumption threshold.
        let ceiling = max(0, resolvedDurationSeconds() - 5)
        let clamped = min(max(0, target), ceiling)
        guard clamped > 1 else { return }
        player.seek(to: CMTime(seconds: Double(clamped), preferredTimescale: 600))
    }

    // MARK: - Heartbeats

    /// Reads the player clock and reports it. Silently skips when the position
    /// is unknown or unchanged. `playbackEnded` forces a beat at full duration.
    func flush(playbackEnded: Bool = false) {
        guard let player, player.currentItem != nil else { return }
        // Don't stomp the server-side resume point with an early 0s beat
        // before the resume seek has landed.
        guard didHandleResume || playbackEnded else { return }

        let duration = resolvedDurationSeconds()
        var position: Int
        if playbackEnded {
            position = duration
        } else {
            let raw = player.currentTime().seconds
            guard raw.isFinite else { return }
            position = Int(raw.rounded())
        }
        position = max(0, min(position, duration))

        guard playbackEnded || position != lastSentPosition else { return }
        lastSentPosition = position
        send(positionSeconds: position, durationSeconds: duration)
    }

    private func resolvedDurationSeconds() -> Int {
        if let duration = player?.currentItem?.duration, duration.isNumeric {
            let seconds = duration.seconds
            if seconds.isFinite, seconds >= 1 { return Int(seconds.rounded()) }
        }
        return max(1, fallbackDurationSeconds)
    }

    // MARK: - Transport (fire-and-forget)

    private struct ProgressBody: Encodable {
        let positionSeconds: Int
        let durationSeconds: Int
    }

    private func send(positionSeconds: Int, durationSeconds: Int) {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/playback/\(titleId)/progress"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = tokenProvider?.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try? JSONEncoder().encode(
            ProgressBody(positionSeconds: positionSeconds, durationSeconds: durationSeconds)
        )

        Task { [weak self] in
            guard let (_, response) = try? await URLSession.shared.data(for: request),
                  let http = response as? HTTPURLResponse else { return }
            // Access tokens live 15 minutes; a feature-length watch outlasts
            // them. Refresh once and retry so hearts keep beating — still
            // silent on any failure.
            if http.statusCode == 401,
               let provider = self?.tokenProvider,
               await provider.refreshTokens(),
               let fresh = self?.tokenProvider?.currentAccessToken() {
                var retry = request
                retry.setValue("Bearer \(fresh)", forHTTPHeaderField: "Authorization")
                _ = try? await URLSession.shared.data(for: retry)
            }
        }
    }
}
