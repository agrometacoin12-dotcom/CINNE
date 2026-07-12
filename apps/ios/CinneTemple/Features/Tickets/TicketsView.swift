//
//  TicketsView.swift
//  CinneTemple
//
//  The viewer's pay-once / watch-once tickets (entitlements). Playable tickets
//  open the secure player; started tickets show a live window countdown.
//

import SwiftUI
import Combine

@MainActor
final class TicketsViewModel: ObservableObject {
    @Published var items: [EntitlementItem] = []
    @Published var loaded = false
    @Published var error: String?
    private let commerce: CommerceAPI
    init(commerce: CommerceAPI) { self.commerce = commerce }

    func load() async {
        do {
            items = try await commerce.entitlements()
            error = nil
        }
        catch let e as APIError { self.error = e.detail }
        catch { self.error = "Could not load your tickets." }
        loaded = true
    }
}

struct TicketsView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: TicketsViewModel

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: TicketsViewModel(commerce: container.commerceAPI))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.items.isEmpty && model.loaded {
                    ContentUnavailableView("No tickets yet", systemImage: "ticket",
                                           description: Text("Buy a pay-per-view to watch."))
                } else {
                    List(model.items) { e in
                        if e.isPlayable {
                            NavigationLink(value: e.titleId) { TicketRow(entitlement: e) }
                                .listRowBackground(Color.white.opacity(0.04))
                        } else {
                            TicketRow(entitlement: e)
                                .listRowBackground(Color.white.opacity(0.04))
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await model.load() }
                }
            }
            .navigationTitle("My Tickets")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        PurchaseHistoryView(client: container.apiClient)
                    } label: {
                        Image(systemName: "clock.arrow.circlepath")
                            .foregroundStyle(Theme.Colors.indigoLight)
                    }
                }
            }
            .navigationDestination(for: String.self) { WatchView(titleId: $0, container: container) }
        }
        .task { await model.load() }
    }
}

// MARK: - Row

private struct TicketRow: View {
    let entitlement: EntitlementItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entitlement.title?.title ?? "Title")
                .font(.headline)
                .foregroundStyle(entitlement.isPlayable ? .white : .white.opacity(0.55))
            statusLine
                .font(.caption)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        switch entitlement.ticketState {
        case .ready:
            Text("Ready to watch · single view")
        case .watching:
            if let end = entitlement.expiryDate {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    Text(Self.countdown(until: end, now: context.date))
                        .monospacedDigit()
                }
            } else {
                Text("Watching · window open")
            }
        case .consumed:
            Text("Used — single view")
        case .expired:
            Text("Window ended")
        case .other(let status):
            Text(status.capitalized)
        }
    }

    private static func countdown(until end: Date, now: Date) -> String {
        let remaining = Int(end.timeIntervalSince(now))
        guard remaining > 0 else { return "Window ended" }
        let hours = remaining / 3600
        let minutes = (remaining % 3600) / 60
        if hours > 0 { return "Watching · \(hours)h \(minutes)m left" }
        if minutes > 0 { return "Watching · \(minutes)m left" }
        return "Watching · under a minute left"
    }
}

// MARK: - Entitlement state (pay-once / watch-once)

enum TicketState {
    case ready              // ACTIVE, window not started
    case watching           // ACTIVE, window open
    case consumed           // watched once — access ended
    case expired            // window ended without finishing
    case other(String)      // REVOKED etc.
}

extension EntitlementItem {
    var expiryDate: Date? { TicketDates.parse(expiresAt) }

    var ticketState: TicketState {
        switch status {
        case "ACTIVE" where startedAt == nil: return .ready
        case "ACTIVE":
            if let end = expiryDate, end <= Date() { return .expired }
            return .watching
        case "CONSUMED": return .consumed
        case "EXPIRED": return .expired
        default: return .other(status)
        }
    }

    /// Playable = ACTIVE and still inside the single-view window.
    var isPlayable: Bool {
        switch ticketState {
        case .ready, .watching: return true
        default: return false
        }
    }
}

/// Backend dates arrive as ISO-8601, usually with fractional seconds
/// ("2026-07-12T10:00:00.000Z") which the default formatter rejects.
enum TicketDates {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        return fractional.date(from: raw) ?? plain.date(from: raw)
    }
}
