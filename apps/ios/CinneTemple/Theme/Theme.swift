//
//  Theme.swift
//  CinneTemple
//
//  Design tokens for the Netflix-style + Liquid Glass language (mirrors
//  docs/UI_DESIGN.md and the web Tailwind preset).
//

import SwiftUI

enum Theme {
    enum Colors {
        static let bgBase = Color(red: 0.039, green: 0.039, blue: 0.043)      // #0A0A0B
        static let bgElevated = Color(red: 0.078, green: 0.078, blue: 0.090)  // #141417
        static let brand = Color(red: 0.898, green: 0.035, blue: 0.078)       // #E50914
        static let accent = Color(red: 1.0, green: 0.231, blue: 0.188)        // #FF3B30
        static let textPrimary = Color(red: 0.961, green: 0.961, blue: 0.969) // #F5F5F7
        static let textSecondary = Color(red: 0.631, green: 0.631, blue: 0.667) // #A1A1AA
    }

    enum Radius {
        static let sm: CGFloat = 10
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
    }

    enum Motion {
        static let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)
        static let snappy = Animation.spring(response: 0.3, dampingFraction: 0.8)
    }
}

extension Color {
    static let ctBrand = Theme.Colors.brand
    static let ctTextSecondary = Theme.Colors.textSecondary
}
