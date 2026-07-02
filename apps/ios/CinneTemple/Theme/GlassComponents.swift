//
//  GlassComponents.swift
//  CinneTemple
//
//  Reusable Liquid Glass building blocks: frosted card, primary/glass buttons,
//  and a styled text field — all using native materials.
//

import SwiftUI
import UIKit

/// The signature "liquid glass" surface treatment — a frosted material with a
/// bright top-left inner highlight and a metallic hairline rim, approximating
/// the Figma inset-shadow spec within SwiftUI's capabilities.
struct LiquidGlass: ViewModifier {
    var cornerRadius: CGFloat = Theme.Radius.md
    /// Optional indigo tint (used for active / primary glass surfaces).
    var tint: Color? = nil

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return content
            .background(.ultraThinMaterial, in: shape)
            .background((tint ?? .clear).opacity(tint == nil ? 0 : 0.30), in: shape)
            .overlay(
                shape.stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.55), .white.opacity(0.05), .white.opacity(0.22)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
            )
            .overlay(
                shape.stroke(.white.opacity(0.06), lineWidth: 3).blur(radius: 3).mask(shape)
            )
            .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }
}

extension View {
    /// Apply the liquid-glass surface. Pass `tint:` for an indigo-tinted variant.
    func liquidGlass(cornerRadius: CGFloat = Theme.Radius.md, tint: Color? = nil) -> some View {
        modifier(LiquidGlass(cornerRadius: cornerRadius, tint: tint))
    }
}

/// A frosted translucent surface — the core Liquid Glass element.
struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = Theme.Radius.md
    @ViewBuilder var content: Content

    var body: some View {
        content.liquidGlass(cornerRadius: cornerRadius)
    }
}

/// Primary call-to-action button with brand fill and press feedback.
struct PrimaryButton: View {
    let title: String
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        }) {
            ZStack {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(title).fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Theme.indigoGradient, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(.white.opacity(0.25), lineWidth: 1)
            )
            .foregroundStyle(.white)
            .shadow(color: Theme.Colors.indigoDeep.opacity(0.45), radius: 14, y: 8)
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(isLoading)
    }
}

/// Indigo-tinted liquid-glass button — the "Play Now" style CTA.
struct IndigoGlassButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        }) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(.white)
            .liquidGlass(cornerRadius: Theme.Radius.md, tint: Theme.Colors.brand)
        }
        .buttonStyle(PressableButtonStyle())
    }
}

/// Secondary glass button.
struct GlassButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        }) {
            Text(title)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .foregroundStyle(Theme.Colors.textPrimary)
                .liquidGlass(cornerRadius: Theme.Radius.md)
        }
        .buttonStyle(PressableButtonStyle())
    }
}

/// A labeled, glassy text field.
struct GlassField: View {
    let title: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboard: UIKeyboardType = .default
    var textContentType: UITextContentType?
    var autocapitalization: TextInputAutocapitalization = .never

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(Theme.Colors.textSecondary)
            Group {
                if isSecure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                }
            }
            .keyboardType(keyboard)
            .textContentType(textContentType)
            .textInputAutocapitalization(autocapitalization)
            .autocorrectionDisabled()
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                    .strokeBorder(.white.opacity(0.25), lineWidth: 1)
            )
            .foregroundStyle(Theme.Colors.textPrimary)
            .tint(Theme.Colors.brand)
        }
    }
}

/// Subtle scale-on-press style used across buttons.
struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(Theme.Motion.snappy, value: configuration.isPressed)
    }
}
