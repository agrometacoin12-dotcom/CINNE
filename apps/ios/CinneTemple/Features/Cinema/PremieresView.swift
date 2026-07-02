//
//  PremieresView.swift
//  CinneTemple
//
//  Rail of premieres (live + upcoming). Tapping opens the premiere room.
//

import SwiftUI
import Combine

@MainActor
final class PremieresViewModel: ObservableObject {
    @Published var items: [CatalogueTitle] = []
    @Published var loaded = false
    private let commerce: CommerceAPI
    init(commerce: CommerceAPI) { self.commerce = commerce }

    func load() async {
        items = (try? await commerce.premieres()) ?? []
        loaded = true
    }
}

struct PremieresView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: PremieresViewModel

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: PremieresViewModel(commerce: container.commerceAPI))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.items.isEmpty && model.loaded {
                    ContentUnavailableView("No premieres scheduled", systemImage: "sparkles.tv",
                                           description: Text("Live, ticketed showings will appear here."))
                } else {
                    List(model.items) { p in
                        NavigationLink(value: p) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 8) {
                                    Text(p.title).font(.headline)
                                    if p.isLiveNow {
                                        Text("● LIVE").font(.caption2.bold()).foregroundStyle(.red)
                                    } else {
                                        Text("Upcoming").font(.caption2).foregroundStyle(Theme.Colors.textSecondary)
                                    }
                                }
                                Text(subtitle(p)).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
                            }
                        }
                        .listRowBackground(Color.white.opacity(0.04))
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Premieres")
            .navigationDestination(for: CatalogueTitle.self) { PremiereView(titleId: $0.id, container: container) }
        }
        .task { await model.load() }
    }

    private func subtitle(_ p: CatalogueTitle) -> String {
        let when = p.premiereDate.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "Showtime TBA"
        return "\(when) · \(p.formattedPrice)"
    }
}
