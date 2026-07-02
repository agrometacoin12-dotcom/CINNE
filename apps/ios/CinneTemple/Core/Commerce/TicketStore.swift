//
//  TicketStore.swift
//  CinneTemple
//
//  StoreKit 2 pay-per-view. Pay-per-view tickets are modelled as consumable
//  products at fixed price points (configured in App Store Connect). On a
//  successful purchase the signed transaction is verified server-side
//  (`/v1/purchases/apple`), which grants the single-view entitlement.
//

import Foundation
import Combine
import StoreKit

@MainActor
final class TicketStore: ObservableObject {

    enum PurchaseState: Equatable {
        case idle
        case purchasing
        case success(titleId: String)
        case failed(String)
    }

    @Published private(set) var products: [Product] = []
    @Published var state: PurchaseState = .idle

    private let commerce: CommerceAPI
    private var updatesTask: Task<Void, Never>?

    /// Consumable price-tier product identifiers. Create matching products in
    /// App Store Connect; their store price is the source of truth for charges.
    static let productIDs: [String] = (1...20).map { "com.cinnetemple.ticket.tier\($0)" }

    init(commerce: CommerceAPI) {
        self.commerce = commerce
        // Always listen for transactions (Ask-to-Buy approvals, restores, etc.).
        updatesTask = listenForTransactions()
    }

    deinit { updatesTask?.cancel() }

    func loadProducts() async {
        let loaded = (try? await Product.products(for: Self.productIDs)) ?? []
        products = loaded.sorted { $0.price < $1.price }
    }

    /// The cheapest product whose price covers the title's price; falls back to
    /// the most expensive if none is high enough.
    func product(forMinor minor: Int) -> Product? {
        let target = Decimal(minor) / 100
        return products.first { $0.price >= target } ?? products.last
    }

    func buyTicket(for title: CatalogueTitle) async {
        state = .purchasing
        if products.isEmpty { await loadProducts() }
        guard let product = product(forMinor: title.price) else {
            state = .failed("Ticket pricing isn’t available right now.")
            return
        }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                // Server verifies the JWS and grants the single-view entitlement.
                _ = try await commerce.confirmApple(
                    titleId: title.id,
                    transactionId: String(transaction.id),
                    signedTransaction: verification.jwsRepresentation
                )
                await transaction.finish()
                state = .success(titleId: title.id)
            case .userCancelled:
                state = .idle
            case .pending:
                state = .failed("Your purchase is pending approval.")
            @unknown default:
                state = .idle
            }
        } catch let apiError as APIError {
            state = .failed(apiError.detail)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func reset() { state = .idle }

    // MARK: - Helpers

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe): return safe
        case .unverified: throw TicketError.unverified
        }
    }

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached {
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                }
            }
        }
    }
}

enum TicketError: LocalizedError {
    case unverified
    var errorDescription: String? { "We couldn’t verify that purchase with the App Store." }
}
