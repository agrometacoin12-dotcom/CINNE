//
//  PlaybackAudioSession.swift
//  CinneTemple
//
//  Configures iOS audio for long-form media. The `.playback` category is not
//  silenced by the Ring/Silent switch and still honours the viewer's selected
//  output route (speaker, headphones, Bluetooth, or AirPlay).
//

import AVFoundation

enum PlaybackAudioSession {
    /// Activate immediately before an AVPlayer starts. Audio-session failures
    /// must not prevent the video from loading; AVPlayer can still recover if
    /// the route becomes available after the initial activation attempt.
    static func activate() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            #if DEBUG
            print("Playback audio-session activation failed: \(error)")
            #endif
        }
    }

    /// Release the session when the player closes so audio interrupted by the
    /// movie may resume. This is best-effort: it fails (e.g. "session is busy")
    /// while a player still has audio I/O running, so callers should stop the
    /// player first. Failures are logged in debug builds rather than hidden.
    static func deactivate() {
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        } catch {
            #if DEBUG
            print("Playback audio-session deactivation failed: \(error)")
            #endif
        }
    }
}
