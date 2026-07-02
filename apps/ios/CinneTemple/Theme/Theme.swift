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
        // Figma "CinneTemple" indigo + liquid-glass palette (mirrors web tokens).
        static let bgBase = Color(hex: 0x09090B)       // canvas
        static let track = Color(hex: 0x090B12)        // progress-bar track
        static let bgSidebar = Color(hex: 0x0A0D14)    // sidebar / panels
        static let bgSurface = Color(hex: 0x10131C)    // surface
        static let bgElevated = Color(hex: 0x141824)   // elevated
        static let border = Color(hex: 0x121724)       // hairline borders

        // Accent — indigo
        static let brand = Color(hex: 0x6366F1)        // primary indigo
        static let indigoLight = Color(hex: 0x6C6FFC)  // light
        static let indigoBright = Color(hex: 0x8082FF) // brighter tint (labels)
        static let indigoDeep = Color(hex: 0x4F46E5)   // deep
        static let accent = Color(hex: 0x6C6FFC)

        static let star = Color(hex: 0xFBBF24)         // ratings
        static let danger = Color(hex: 0xC0392B)       // log out / destructive
        static let textPrimary = Color(hex: 0xFFFFFF)
        static let textSecondary = Color(hex: 0x9CA3AF)
    }

    /// The signature indigo gradient used on primary buttons and marks.
    static let indigoGradient = LinearGradient(
        colors: [Colors.indigoLight, Colors.indigoDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

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

    /// Hex initializer, e.g. Color(hex: 0x6366F1).
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
