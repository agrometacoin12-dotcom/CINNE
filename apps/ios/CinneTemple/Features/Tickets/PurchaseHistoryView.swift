//
//  PurchaseHistoryView.swift
//  CinneTemple
//
//  Purchase history (GET /v1/purchases) — replaces the orphaned presentational
//  PaymentsView. Reached from My Tickets' history toolbar button.
//

import SwiftUI
import Combine

@MainActor
final class PurchaseHistoryViewModel: ObservableObject {
    @Published var items: [PurchaseRecord] = []
    @Published var coinItems: [CoinPurchaseRecord] = []
    @Published var loaded = false
    @Published var error: String?
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        do {
            async let tickets = client.purchaseHistory()
            async let coins = client.coinPurchaseHistory()
            let result = try await (tickets, coins)
            items = result.0
            coinItems = result.1
            error = nil
        }
        catch let e as APIError { self.error = e.detail }
        catch { self.error = "Could not load your purchases." }
        loaded = true
    }
}

struct PurchaseHistoryView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model: PurchaseHistoryViewModel

    init(client: APIClient) {
        _model = StateObject(wrappedValue: PurchaseHistoryViewModel(client: client))
    }

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(.red)
                Button("Retry") { Task { await model.load() } }
            }
            if !model.loaded { ProgressView("Loading purchases…") }
            if model.loaded && model.items.isEmpty && model.coinItems.isEmpty && model.error == nil {
                ContentUnavailableView("No purchases yet", systemImage: "creditcard",
                    description: Text("Your coin purchases and movie tickets appear here."))
            }
            if !model.coinItems.isEmpty {
                Section("Coin purchases") {
                    ForEach(model.coinItems) { purchase in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("\(purchase.coins.formatted()) coins").font(.headline)
                                Spacer()
                                Text(statusLabel(purchase.status)).foregroundStyle(statusColor(purchase.status))
                            }
                            Text(purchase.source + (purchase.environment == "Sandbox" ? " · Test purchase" : " · Live purchase"))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(dateLabel(purchase.createdAt)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !model.items.isEmpty {
                Section("Movie tickets") {
                    ForEach(model.items) { purchase in row(purchase) }
                }
            }
        }
        .refreshable { await model.load() }
        .navigationTitle("Purchases")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
    }

    private func row(_ purchase: PurchaseRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(purchase.titleName)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                Text(CheckoutFormatting.amount(purchase.amountMinor, currency: purchase.currency))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
            }
            HStack(spacing: 6) {
                Text(statusLabel(purchase.status))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor(purchase.status))
                if purchase.isGift {
                    Text("· Gift")
                        .font(.caption)
                        .foregroundStyle(Theme.Colors.indigoLight)
                }
                Spacer()
                Text(dateLabel(purchase.createdAt))
                    .font(.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "PAID": return "Paid"
        case "PENDING": return "Pending"
        case "FAILED": return "Failed"
        case "REFUNDED": return "Refunded"
        default: return status.capitalized
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "PAID": return .green
        case "FAILED": return Color(hex: 0xF2555A)
        case "REFUNDED": return Theme.Colors.star
        default: return Theme.Colors.textSecondary
        }
    }

    private func dateLabel(_ raw: String) -> String {
        guard let date = TicketDates.parse(raw) else { return "" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
