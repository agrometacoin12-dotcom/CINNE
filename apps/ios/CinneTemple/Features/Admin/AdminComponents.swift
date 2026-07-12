//
//  AdminComponents.swift
//  CinneTemple
//
//  Shared building blocks for the Studio admin console: pills, stat cards,
//  search field, load-more footer, and ₦/date formatting helpers.
//

import SwiftUI

// MARK: - Formatting

enum AdminFormat {
    /// ₦ from kobo (minor units). Whole amounts drop decimals: ₦1,500.
    static func naira(_ minor: Int) -> String {
        let major = Double(minor) / 100.0
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = ","
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = major.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
        let text = f.string(from: NSNumber(value: major)) ?? String(format: "%.2f", major)
        return "₦\(text)"
    }

    /// Product rule: 0 kobo is "Free".
    static func price(_ minor: Int) -> String {
        minor <= 0 ? "Free" : naira(minor)
    }

    static func megabytes(_ bytes: Int) -> String {
        let mb = Double(bytes) / 1_048_576.0
        if mb >= 1024 { return String(format: "%.2f GB", mb / 1024) }
        return String(format: "%.1f MB", mb)
    }

    /// Compact display for backend ISO-8601 timestamps (with or without
    /// fractional seconds).
    static func date(_ iso: String?) -> String {
        guard let iso, !iso.isEmpty else { return "—" }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let d = withFraction.date(from: iso) ?? plain.date(from: iso) else { return iso }
        return d.formatted(date: .abbreviated, time: .shortened)
    }

    static func isoDate(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    static func friendly(_ error: Error) -> String {
        (error as? APIError)?.detail ?? error.localizedDescription
    }
}

// MARK: - Pills

/// Compact status capsule used across the console (thumb-scannable states).
struct AdminPill: View {
    let text: String
    var color: Color = Theme.Colors.textSecondary

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .kerning(0.4)
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
            .overlay(Capsule().strokeBorder(color.opacity(0.35), lineWidth: 1))
    }
}

enum AdminPillStyle {
    static func purchaseStatus(_ status: String) -> Color {
        switch status {
        case "PAID": return Color(hex: 0x34D399)
        case "PENDING": return Color(hex: 0xFBBF24)
        case "FAILED": return Color(hex: 0xF87171)
        case "REFUNDED": return Theme.Colors.textSecondary
        default: return Theme.Colors.textSecondary
        }
    }

    static func entitlement(_ status: String) -> Color {
        switch status {
        case "ACTIVE": return Color(hex: 0x34D399)
        case "CONSUMED": return Theme.Colors.indigoBright
        case "EXPIRED": return Theme.Colors.textSecondary
        case "REVOKED": return Color(hex: 0xF87171)
        default: return Theme.Colors.textSecondary
        }
    }

    static func userStatus(_ status: String) -> Color {
        switch status {
        case "ACTIVE": return Color(hex: 0x34D399)
        case "SUSPENDED": return Color(hex: 0xF87171)
        case "PENDING_VERIFICATION": return Color(hex: 0xFBBF24)
        default: return Theme.Colors.textSecondary
        }
    }
}

// MARK: - Stat card

struct AdminStatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .kerning(0.6)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
        .padding(14)
        .frame(width: 132, alignment: .leading)
        .liquidGlass(cornerRadius: Theme.Radius.md)
    }
}

// MARK: - Search field

struct AdminSearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Colors.textSecondary)
            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.brand)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                .strokeBorder(.white.opacity(0.25), lineWidth: 1)
        )
    }
}

// MARK: - Load more footer

struct AdminLoadMoreButton: View {
    let shown: Int
    let total: Int
    let loading: Bool
    let action: () -> Void

    var body: some View {
        if shown < total {
            Button(action: action) {
                HStack(spacing: 8) {
                    if loading {
                        ProgressView().tint(.white).controlSize(.small)
                    } else {
                        Image(systemName: "arrow.down.circle")
                    }
                    Text("Load more (\(shown) of \(total))")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(Theme.Colors.indigoBright)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .liquidGlass(cornerRadius: Theme.Radius.md)
            }
            .buttonStyle(PressableButtonStyle())
            .disabled(loading)
        }
    }
}

// MARK: - Empty state

struct AdminEmptyState: View {
    let icon: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 30))
                .foregroundStyle(Theme.Colors.textSecondary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }
}
