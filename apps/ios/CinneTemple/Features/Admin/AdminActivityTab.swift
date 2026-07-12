//
//  AdminActivityTab.swift
//  CinneTemple
//
//  Studio > Activity: the paginated audit log. Rows expand in place to show
//  entity, IP, and pretty-printed metadata.
//

import SwiftUI
import Combine

@MainActor
final class AdminActivityModel: ObservableObject {
    @Published var items: [AdminAuditEntry] = []
    @Published var total = 0
    @Published var loading = false
    @Published var loadingMore = false
    @Published var error: String?

    let api: AdminAPI
    private let take = 50
    private var loaded = false

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
            let page = try await api.audit(take: take, skip: 0)
            items = page.items
            total = page.total
            loaded = true
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    func loadMore() async {
        guard !loadingMore, items.count < total else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await api.audit(take: take, skip: items.count)
            items.append(contentsOf: page.items)
            total = page.total
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }
}

struct AdminActivityTab: View {
    @ObservedObject var model: AdminActivityModel
    @State private var expandedIds: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error = model.error { ErrorBanner(message: error) }

                if model.loading && model.items.isEmpty {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                } else if model.items.isEmpty {
                    AdminEmptyState(icon: "list.bullet.rectangle", message: "No audit activity yet.")
                } else {
                    Text("\(model.total) event\(model.total == 1 ? "" : "s")")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)

                    VStack(spacing: 10) {
                        ForEach(model.items) { entry in
                            auditRow(entry)
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
    }

    private func auditRow(_ entry: AdminAuditEntry) -> some View {
        let expanded = expandedIds.contains(entry.id)
        return Button {
            withAnimation(Theme.Motion.snappy) {
                if expanded { expandedIds.remove(entry.id) }
                else { expandedIds.insert(entry.id) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.action)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundStyle(entry.action.hasPrefix("admin.") ? Theme.Colors.indigoBright : .white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.4))
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }

                HStack(spacing: 6) {
                    Text(entry.actorEmail ?? "system")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .lineLimit(1)
                    Text("•")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.textSecondary.opacity(0.6))
                    Text(AdminFormat.date(entry.createdAt))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }

                if expanded {
                    VStack(alignment: .leading, spacing: 6) {
                        if let entity = entry.entity {
                            detailLine("Entity", "\(entity)\(entry.entityId.map { " · \($0)" } ?? "")")
                        }
                        if let ip = entry.ip {
                            detailLine("IP", ip)
                        }
                        if let actorId = entry.actorId {
                            detailLine("Actor ID", actorId)
                        }
                        if let metadata = entry.metadata, metadata != .null {
                            Text("Metadata")
                                .font(.system(size: 10, weight: .bold))
                                .kerning(0.6)
                                .foregroundStyle(Theme.Colors.textSecondary)
                            Text(metadata.pretty())
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.85))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                    .padding(.top, 4)
                    .transition(.opacity)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: Theme.Radius.md)
        }
        .buttonStyle(.plain)
    }

    private func detailLine(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .kerning(0.6)
                .foregroundStyle(Theme.Colors.textSecondary)
            Text(value)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .textSelection(.enabled)
        }
    }
}
