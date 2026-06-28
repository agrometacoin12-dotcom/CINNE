//
//  BiometricAuthenticator.swift
//  CinneTemple
//
//  Face ID / Touch ID unlock via LocalAuthentication.
//

import Foundation
import LocalAuthentication

struct BiometricAuthenticator {
    enum Biometry { case faceID, touchID, none }

    func availableBiometry() -> Biometry {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default: return .none
        }
    }

    var label: String {
        switch availableBiometry() {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .none: return "Biometrics"
        }
    }

    /// Prompts the user to authenticate. Returns true on success.
    func authenticate(reason: String = "Unlock CinneTemple") async -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = "Enter Passcode"
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthentication, localizedReason: reason
            )
        } catch {
            return false
        }
    }
}
