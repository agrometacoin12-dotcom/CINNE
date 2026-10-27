import Foundation
import Combine
import StoreKit

/// StoreKit coin purchases. Apple transactions finish only after server credit.
@MainActor
final class TicketStore: ObservableObject {
    static let packs = [500, 1000, 2500, 5000]
    static let productIDs = packs.map { "com.cinnetemple.coins.\($0)" }
    @Published private(set) var products: [Product] = []
    @Published private(set) var balance = 0
    @Published private(set) var sandboxPurchases = false
    @Published private(set) var isSandboxStore = false
    @Published private(set) var purchasing = false
    @Published private(set) var loadingProducts = false
    @Published private(set) var productLoadError: String?
    private let productLoader: ([String]) async throws -> [Product]
    @Published var message: String?
    private let sandboxEnvironment: () async throws -> Bool
    private let commerce: CommerceAPI
    private let session: SessionStore
    private var updatesTask: Task<Void, Never>?
    private var sessionObservation: AnyCancellable?
    private var processing = Set<UInt64>()

    init(commerce: CommerceAPI, session: SessionStore,
         sandboxEnvironment: @escaping () async throws -> Bool = {
             let result = try await AppTransaction.shared
             guard case .verified(let app) = result else {
                 throw APIError(status: 503, title: "App Store", detail: "Could not verify the app purchase environment. Reconnect to the App Store and retry.")
             }
             return app.environment == .sandbox
         },
         productLoader: @escaping ([String]) async throws -> [Product] = { try await Product.products(for: $0) }) {
        self.sandboxEnvironment = sandboxEnvironment
        self.productLoader = productLoader
        self.commerce = commerce
        self.session = session
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard !Task.isCancelled else { return }
                await self?.deliver(update)
            }
        }
        sessionObservation = session.$phase.sink { [weak self] phase in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.balance = 0
                if phase != .authenticated { self.sandboxPurchases = false }
                if phase == .authenticated { await self.recover() }
            }
        }
    }
    deinit { updatesTask?.cancel() }

    func loadProducts() async {
        guard !loadingProducts else { return }
        loadingProducts = true
        productLoadError = nil
        defer { loadingProducts = false }
        // Product discovery belongs to Apple and must not depend on a wallet
        // request succeeding. buy() still checks server readiness before payment.
        do {
            products = try await productLoader(Self.productIDs).sorted { $0.price < $1.price }
            if products.isEmpty {
                productLoadError = "The App Store returned no coin packs for your current region. Tap Reload coin packs to try again."
            } else if products.count < Self.productIDs.count {
                productLoadError = "Some coin packs are still unavailable from the App Store. You can reload them below."
            }
        } catch {
            productLoadError = "Could not load App Store prices: \(error.localizedDescription)"
        }
        do { try await refreshBalance() }
        catch { message = "Could not refresh your coin balance. Please try again." }
    }

    func refreshBalance() async throws {
        // Live browser credits stay visible even in a TestFlight installation.
        // Store environment controls Apple credits, never which ledger is merged.
        if let verifiedSandbox = try? await sandboxEnvironment() {
            isSandboxStore = verifiedSandbox
            if !verifiedSandbox { sandboxPurchases = false }
        }
        let selectedSandbox = sandboxPurchases
        let userId = session.user?.id
        let wallet = try await commerce.wallet(sandbox: selectedSandbox)
        guard session.phase == .authenticated, session.user?.id == userId, sandboxPurchases == selectedSandbox else { return }
        balance = wallet.balance
    }

    func selectWallet(sandbox: Bool) async {
        sandboxPurchases = sandbox && isSandboxStore
        balance = 0
        do { try await refreshBalance() }
        catch { message = "Could not refresh your coin balance. Please try again." }
    }

    func buy(_ product: Product) async {
        guard !purchasing, Self.productIDs.contains(product.id), session.phase == .authenticated,
              let userId = session.user?.id, let token = UUID(uuidString: userId) else { return }
        purchasing = true
        message = nil
        defer { purchasing = false }
        do {
            // Check backend availability before presenting Apple's payment sheet.
            let available = try await commerce.appleCoinProducts()
            guard available.contains(where: { $0.productId == product.id }) else {
                message = "This coin pack is currently unavailable. Please reload the wallet."
                return
            }
            guard session.phase == .authenticated, session.user?.id == userId else { return }
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case .success(let result): await deliver(result)
            case .pending: message = "Purchase awaiting Apple approval. Coins will be added after approval."
            case .userCancelled: break
            @unknown default: message = "Please check your purchase status and try again."
            }
        } catch { message = (error as? APIError)?.detail ?? error.localizedDescription }
    }

    func recover() async {
        for await result in Transaction.unfinished { await deliver(result) }
        try? await refreshBalance()
    }

    private func deliver(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            message = "Apple could not verify this purchase. No coins were added. Please retry purchases."
            return
        }
        guard Self.productIDs.contains(transaction.productID),
              session.phase == .authenticated,
              let userId = session.user?.id,
              !processing.contains(transaction.id) else { return }
        guard transaction.appAccountToken == UUID(uuidString: userId) else {
            message = "An unfinished purchase belongs to a different CinneTemple account. Sign into the account used for that purchase to recover it."
            return
        }
        processing.insert(transaction.id)
        defer { processing.remove(transaction.id) }
        do {
            let credit = try await commerce.confirmAppleCoins(signedTransaction: result.jwsRepresentation)
            guard credit.status == "paid" else {
                message = "Payment has not been confirmed yet. Tap Retry purchases; do not purchase again."
                return
            }
            await transaction.finish()
            if session.user?.id == userId {
                sandboxPurchases = credit.environment == "Sandbox"
                balance = credit.balance
                message = sandboxPurchases ? "Sandbox coins added. These are separate from your live wallet." : "Coins added to your wallet."
            }
        } catch {
            // Leave unfinished so relaunch, sign-in or Retry can safely recover it.
            let reason = (error as? APIError)?.detail ?? error.localizedDescription
            message = "Purchase not credited: \(reason) Tap Retry purchases to recover this payment without buying again."
        }
    }
}
