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
    @Published var loaded = false
    @Published var error: String?
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func load() async {
        do {
            items = try await client.purchaseHistory()
            error = nil
        }
        catch let e as APIError { self.error = e.detail }
        catch { self.error = "Could not load your purchases." }
        loaded = true
    }
}

struct PurchaseHistoryView: View {
    @StateObject private var model: PurchaseHistoryViewModel

    init(client: APIClient) {
        _model = StateObject(wrappedValue: PurchaseHistoryViewModel(client: client))
    }

    var body: some View {
        Group {
            if let error = model.error, model.items.isEmpty {
                ContentUnavailableView("Couldn't load purchases",
                                       systemImage: "exclamationmark.triangle",
                                       description: Text(error))
            } else if model.items.isEmpty && model.loaded {
                ContentUnavailableView("No purchases yet", systemImage: "creditcard",
                                       description: Text("Tickets you buy appear here."))
            } else {
                List(model.items) { purchase in
                    row(purchase)
                        .listRowBackground(Color.white.opacity(0.04))
                }
                .listStyle(.plain)
                .refreshable { await model.load() }
            }
        }
        .navigationTitle("Purchases")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
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
