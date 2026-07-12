//
//  SafariView.swift
//  CinneTemple
//
//  SFSafariViewController wrapper for external (non-mock) checkout pages —
//  the future Paystack flow. `onDone` fires when the sheet's Done button
//  dismisses Safari so the purchase can be verified on return.
//

import SwiftUI
import SafariServices

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    var onDone: () -> Void = {}

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredBarTintColor = UIColor(Theme.Colors.bgBase)
        controller.preferredControlTintColor = UIColor(Theme.Colors.brand)
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        private let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onDone() }
    }
}
