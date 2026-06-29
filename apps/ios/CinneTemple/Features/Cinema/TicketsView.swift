//
//  TicketsView.swift
//  CinneTemple
//
//  The viewer's pay-per-view tickets (entitlements). Active tickets open the
//  secure player.
//

import SwiftUI

@MainActor
final class TicketsViewModel: ObservableObject {
    @Published var items: [EntitlementItem] = []
    @Published var loaded = false
    @Published var error: String?
    private let commerce: CommerceAPI
    init(commerce: CommerceAPI) { self.commerce = commerce }

    func load() async {
        do { items = try await commerce.entitlements() }
        catch let e as APIError { error = e.detail }
        catch { error = "Could not load your tickets." }
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
                        if e.isActive {
                            NavigationLink(value: e.titleId) { row(e) }
                                .listRowBackground(Color.white.opacity(0.04))
                        } else {
                            row(e).listRowBackground(Color.white.opacity(0.04))
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("My Tickets")
            .navigationDestination(for: String.self) { WatchView(titleId: $0, container: container) }
        }
        .task { await model.load() }
    }

    private func row(_ e: EntitlementItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(e.title?.title ?? "Title").font(.headline)
            Text(statusLabel(e)).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
        }
    }

    private func statusLabel(_ e: EntitlementItem) -> String {
        switch e.status {
        case "ACTIVE" where e.startedAt == nil: return "Unused · watch anytime"
        case "ACTIVE": return "Watching · window open"
        case "EXPIRED": return "Window ended"
        default: return e.status.capitalized
        }
    }
}
