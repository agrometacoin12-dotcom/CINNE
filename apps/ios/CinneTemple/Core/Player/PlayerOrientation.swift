//
//  PlayerOrientation.swift
//  CinneTemple
//
//  Fullscreen rotation plumbing for the video players. The app itself is a
//  PORTRAIT phone app: `AppOrientation.mask` defaults to `.portrait` and is read
//  synchronously by PushAppDelegate.application(_:supportedInterfaceOrientationsFor:)
//  so the rest of the UI never rotates. The film + trailer players widen the mask
//  and ask the window scene to rotate while they are on screen, then restore
//  portrait on dismiss. This is player CHROME only — it touches no entitlement,
//  watch-once, watermark, or ScreenGuard logic.
//

import UIKit

/// The interface orientations the app currently permits. Read synchronously from
/// the app delegate (main thread) and mutated only from the main actor by
/// `PlayerRotator`; `nonisolated(unsafe)` keeps that read legal without an actor
/// hop while remaining a single, main-thread-owned value in practice.
enum AppOrientation {
    nonisolated(unsafe) static var mask: UIInterfaceOrientationMask = .portrait
}

/// Reusable rotation helper shared by SecurePlayerView (film) and
/// TrailerPlayerView. All work happens on the main actor and touches only the
/// key window scene's geometry — never any playback or entitlement state.
@MainActor
enum PlayerRotator {
    /// The foreground-active window scene (falls back to the first available).
    private static var activeScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }

    /// Enter fullscreen landscape: allow both landscape orientations and rotate
    /// the scene to landscape. The device may still flip between the two
    /// landscapes while fullscreen.
    static func enterLandscape() {
        AppOrientation.mask = .landscape
        request(.landscapeRight)
    }

    /// Return to the app-wide portrait default and rotate back to portrait.
    static func reset() {
        AppOrientation.mask = .portrait
        request(.portrait)
    }

    /// Freeze rotation at whatever orientation is on screen right now (the
    /// YouTube-style screen lock) so a stray physical rotate can't flip the
    /// frame mid-watch. Does NOT request a geometry change — it only narrows the
    /// permitted set to the current single orientation.
    static func freezeCurrent() {
        guard let scene = activeScene else { AppOrientation.mask = .portrait; return }
        switch scene.interfaceOrientation {
        case .landscapeLeft: AppOrientation.mask = .landscapeLeft
        case .landscapeRight: AppOrientation.mask = .landscapeRight
        case .portraitUpsideDown: AppOrientation.mask = .portraitUpsideDown
        default: AppOrientation.mask = .portrait
        }
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    /// Re-widen the permitted set after unlocking, back to the mode we were in
    /// (landscape if the player was fullscreen, else portrait).
    static func unfreeze(toLandscape landscape: Bool) {
        AppOrientation.mask = landscape ? .landscape : .portrait
        activeScene?.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    private static func request(_ orientations: UIInterfaceOrientationMask) {
        guard let scene = activeScene else { return }
        if #available(iOS 16.0, *) {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations))
        }
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
}
