import SwiftUI
import StoreKit

struct CoinWalletView: View {
    @ObservedObject var store: TicketStore
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        List {
            if store.isSandboxStore {
                Section("Balance to use for tickets") {
                    Picker("Wallet", selection: Binding(get: { store.sandboxPurchases }, set: { selected in
                        Task { await store.selectWallet(sandbox: selected) }
                    })) {
                        Text("Live coins").tag(false)
                        Text("Test coins").tag(true)
                    }.pickerStyle(.segmented).disabled(store.purchasing)
                    Text("TestFlight App Store purchases add test coins. Real purchases add live coins. The balances stay separate.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            if AppConfig.isTestEnvironment || store.sandboxPurchases {
                Section("Test wallet") {
                    Text("Test purchases only. Test coins have no real value and do not affect your live balance.")
                        .font(.footnote)
                }
            }
            Section(store.sandboxPurchases ? "Test balance" : "Live balance") {
                Text("\(store.balance.formatted()) coins").font(.largeTitle.bold())
                Text(store.sandboxPurchases ? "Review coins can test movie tickets, but cannot fund films or transfer value. Review tickets expire after 24 hours." : "1 CinneTemple coin = ₦1 of in-app value.")
                    .font(.footnote).foregroundStyle(.secondary)
                if store.balance < 0 {
                    Text("An Apple refund exceeded your unused coins. New credits repay this shortfall before becoming available to spend.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("Buy coins") {
                if store.isSandboxStore {
                    Text("Apple purchases in this TestFlight build credit your test balance.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(TicketStore.packs, id: \.self) { coins in
                    let product = store.products.first { $0.id == "com.cinnetemple.coins.\(coins)" }
                    Button {
                        if let product { Task { await store.buy(product) } }
                    } label: {
                        HStack {
                            Text("\(coins.formatted()) coins")
                            Spacer()
                            if let product {
                                Text(product.displayPrice).bold()
                            } else {
                                Text(store.loadingProducts ? "Loading price…" : "Unavailable")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }.disabled(store.purchasing || product == nil)
                }
                if store.loadingProducts { ProgressView("Loading App Store prices…") }
                if let error = store.productLoadError {
                    Text(error).font(.footnote).foregroundStyle(.secondary)
                }
                Button("Reload coin packs") { Task { await store.loadProducts() } }
                    .disabled(store.loadingProducts || store.purchasing)
            }
            if store.purchasing { ProgressView("Confirming purchase…") }
            if let message = store.message { Text(message).font(.footnote) }
            Button("Retry purchases") { Task { await store.recover(); await store.loadProducts() } }
                .disabled(store.purchasing)
            Text("Coins do not expire. Apple displays the price for your App Store region before you pay.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .navigationTitle("CinneTemple coins")
        .task { await store.loadProducts(); await store.recover() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.loadProducts(); await store.recover() } }
        }
    }
}

struct TicketWalletLabel: View {
    @ObservedObject var store: TicketStore
    var body: some View {
        Text("Uses \(store.sandboxPurchases ? "test" : "live") coins · \(store.balance.formatted()) available")
            .font(.caption).foregroundStyle(.secondary)
    }
}
