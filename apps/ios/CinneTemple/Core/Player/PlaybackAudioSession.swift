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
    /// movie may resume. This is best-effort because another system route can
    /// legitimately be changing at the same time.
    static func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }
}
