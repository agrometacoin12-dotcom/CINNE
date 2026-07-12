//
//  AdminSalesTab.swift
//  CinneTemple
//
//  Studio > Sales: purchase ledger with buyer/title search, status filter,
//  and load-more pagination. Shows amount (₦), provider, purchase status and
//  the ticket's entitlement state.
//

import SwiftUI
import Combine

@MainActor
final class AdminSalesModel: ObservableObject {
    static let statusOptions = ["PENDING", "PAID", "FAILED", "REFUNDED"]

    @Published var items: [AdminPurchase] = []
    @Published var total = 0
    @Published var query = ""
    @Published var statusFilter: String? = nil
    @Published var loading = false
    @Published var loadingMore = false
    @Published var error: String?

    let api: AdminAPI
    private let take = 50
    private var loaded = false
    private var lastLoadedQuery = ""

    init(api: AdminAPI) { self.api = api }

    func loadIfNeeded() async {
        guard !loaded else { return }
        await reload()
    }

    func reload() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let page = try await api.purchases(q: query, status: statusFilter, take: take, skip: 0)
            items = page.items
            total = page.total
            loaded = true
            lastLoadedQuery = query
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    func searchIfNeeded() async {
        guard query != lastLoadedQuery else { return }
        await reload()
    }

    func setFilter(_ status: String?) async {
        guard statusFilter != status else { return }
        statusFilter = status
        await reload()
    }

    func loadMore() async {
        guard !loadingMore, items.count < total else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await api.purchases(q: query, status: statusFilter, take: take, skip: items.count)
            items.append(contentsOf: page.items)
            total = page.total
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }
}

struct AdminSalesTab: View {
    @ObservedObject var model: AdminSalesModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    AdminSearchField(placeholder: "Search buyer or title", text: $model.query)
                    filterMenu
                }

                if let error = model.error { ErrorBanner(message: error) }

                if model.loading && model.items.isEmpty {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                } else if model.items.isEmpty {
                    AdminEmptyState(icon: "ticket", message: "No sales match these filters.")
                } else {
                    Text("\(model.total) sale\(model.total == 1 ? "" : "s")")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)

                    VStack(spacing: 10) {
                        ForEach(model.items) { purchase in
                            saleRow(purchase)
                        }
                    }

                    AdminLoadMoreButton(
                        shown: model.items.count,
                        total: model.total,
                        loading: model.loadingMore
                    ) {
                        Task { await model.loadMore() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        .task { await model.loadIfNeeded() }
        .task(id: model.query) {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await model.searchIfNeeded()
        }
    }

    private var filterMenu: some View {
        Menu {
            Button {
                Task { await model.setFilter(nil) }
            } label: {
                if model.statusFilter == nil { Label("All statuses", systemImage: "checkmark") }
                else { Text("All statuses") }
            }
            ForEach(AdminSalesModel.statusOptions, id: \.self) { status in
                Button {
                    Task { await model.setFilter(status) }
                } label: {
                    if model.statusFilter == status { Label(status.capitalized, systemImage: "checkmark") }
                    else { Text(status.capitalized) }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.system(size: 16, weight: .semibold))
                Text(model.statusFilter?.capitalized ?? "All")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(model.statusFilter == nil ? Theme.Colors.textSecondary : Theme.Colors.indigoBright)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .liquidGlass(cornerRadius: Theme.Radius.sm)
        }
    }

    private func saleRow(_ p: AdminPurchase) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(p.titleName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(AdminFormat.price(p.amountMinor))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Colors.indigoBright)
            }

            Text(p.userDisplayName.map { "\($0) — \(p.userEmail)" } ?? p.userEmail)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.textSecondary)
                .lineLimit(1)

            HStack(spacing: 5) {
                AdminPill(text: p.provider, color: Theme.Colors.textSecondary)
                AdminPill(text: p.status, color: AdminPillStyle.purchaseStatus(p.status))
                if let ent = p.entitlementStatus {
                    AdminPill(text: "TICKET \(ent)", color: AdminPillStyle.entitlement(ent))
                }
                if p.isGift {
                    AdminPill(text: "GIFT", color: Color(hex: 0xC084FC))
                }
            }

            Text(AdminFormat.date(p.paidAt ?? p.createdAt))
                .font(.system(size: 11))
                .foregroundStyle(Theme.Colors.textSecondary.opacity(0.8))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(cornerRadius: Theme.Radius.md)
    }
}
