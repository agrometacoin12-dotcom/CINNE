//
//  ScreenGuard.swift
//  CinneTemple
//
//  Native anti-piracy signals. `isCaptured` is true when the screen is being
//  recorded or mirrored (AirPlay) — the player blanks its content in that state.
//  `screenshotCount` increments on screenshot so the UI can react. Full
//  protection (content excluded from recordings) requires FairPlay DRM; this is
//  the best-effort layer until that lands.
//

import Foundation
import UIKit
import Combine

@MainActor
final class ScreenGuard: ObservableObject {
    @Published private(set) var isCaptured: Bool = UIScreen.main.isCaptured
    @Published private(set) var screenshotCount: Int = 0

    private var observers: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default

        observers.append(
            center.addObserver(forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.isCaptured = UIScreen.main.isCaptured }
            }
        )
        observers.append(
            center.addObserver(forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.screenshotCount += 1 }
            }
        )
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }
}
