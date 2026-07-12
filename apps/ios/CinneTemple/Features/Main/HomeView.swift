//
//  HomeView.swift
//  CinneTemple
//
//  Home — exact Figma layout (node 42:13488): glass search/bell/avatar top bar,
//  featured hero carousel with indigo-glass "Play now", a real Continue Watching
//  rail (GET /v1/playback/continue), filtering glass category pills, and every
//  catalogue row. Backed by the live catalogue (offline-first, pull-to-refresh).
//

import SwiftUI

struct HomeView: View {
    @Environment(\.appContainer) private var container
    @StateObject private var model: CatalogueViewModel
    @State private var heroIndex = 0
    @State private var category = HomeView.allCategory
    @State private var continueItems: [ContinueWatchingItem] = []
    @State private var resumeRoute: CinemaRoute?

    private static let allCategory = "All Movies"

    init(container: AppContainer) {
        _model = StateObject(wrappedValue: container.makeCatalogueViewModel())
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.bgBase.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        topBar
                        heroCarousel
                        continueWatching
                        categoryPills
                        // Every catalogue row by its real title — "New Listings" is
                        // first, so newly published admin uploads appear for users.
                        // The selected category pill filters these rows client-side.
                        ForEach(filteredRows) { row in posterRow(row.title, row.items) }
                        Color.clear.frame(height: 72) // clearance for floating tab bar
                    }
                    .padding(.top, 8)
                }
                .scrollIndicators(.hidden)
                .navigationDestination(for: TitleSummary.self) { TitleDetailView(titleId: $0.id, container: container) }
                .navigationDestination(for: CatalogueTitle.self) { TitleDetailView(titleId: $0.id, container: container) }
                .refreshable {
                    await model.load()
                    await loadContinueWatching()
                }
                .task {
                    await model.load()
                    await loadContinueWatching()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(item: $resumeRoute, onDismiss: {
                Task { await loadContinueWatching() }
            }) { route in
                NavigationStack {
                    Group {
                        if case .watch(let id) = route {
                            WatchView(titleId: id, container: container)
                        }
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) { Button("Close") { resumeRoute = nil } }
                    }
                }
            }
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 12) {
            NavigationLink { SearchView(container: container) } label: {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundStyle(.white.opacity(0.6))
                    Text("Search for movies, shows....")
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 15).frame(height: 44)
                .liquidGlass(cornerRadius: 11.5)
            }
            .buttonStyle(.plain)

            NavigationLink { NotificationsView() } label: {
                Image(systemName: "bell").font(.system(size: 18)).foregroundStyle(.white)
            }

            HStack(spacing: 4) {
                NavigationLink { ProfileView(container: container) } label: {
                    ZStack {
                        Circle().fill(Theme.Colors.brand.opacity(0.2))
                        Image(systemName: "person.fill").font(.system(size: 18)).foregroundStyle(.white)
                    }
                    .frame(width: 44, height: 44)
                }
                Image(systemName: "chevron.down").font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: Hero carousel

    private var heroCarousel: some View {
        Group {
            if let hero = model.browse?.hero {
                heroCard(hero)
                    .padding(.horizontal, 20)
            } else if model.isLoading {
                RoundedRectangle(cornerRadius: 17).fill(.white.opacity(0.05))
                    .frame(height: 172).padding(.horizontal, 20)
                    .redacted(reason: .placeholder)
            }
        }
    }

    private func heroCard(_ hero: CatalogueTitle) -> some View {
        NavigationLink(value: hero) {
            ZStack(alignment: .bottomLeading) {
                if let s = hero.heroUrl, let url = URL(string: s) {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.Colors.bgElevated }
                } else {
                    LinearGradient(colors: [Theme.Colors.indigoDeep.opacity(0.5), Theme.Colors.bgBase], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                LinearGradient(colors: [.clear, Color(hex: 0x09090B).opacity(0.8)], startPoint: .center, endPoint: .bottom)

                VStack(alignment: .leading, spacing: 6) {
                    Text(hero.title).font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                    HStack(spacing: 5) {
                        metaDot(String(hero.year)); dot
                        if let g = hero.genres.first { metaDot(g); dot }
                        if let rt = runtimeText(hero.runtimeMinutes) { metaDot(rt); dot }
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill").font(.system(size: 7)).foregroundStyle(Theme.Colors.star)
                            Text(String(format: "%.1f", hero.rating)).font(.system(size: 9)).foregroundStyle(.white.opacity(0.6))
                        }
                    }
                    Text(hero.overview).font(.system(size: 10)).foregroundStyle(.white.opacity(0.8)).lineLimit(2)
                    HStack(spacing: 8) {
                        HStack(spacing: 5) {
                            Image(systemName: "play.fill").font(.system(size: 9))
                            Text("Play now").font(.system(size: 10, weight: .semibold))
                        }
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .foregroundStyle(.white)
                        .background(Theme.Colors.brand.opacity(0.2), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                        HStack(spacing: 5) {
                            Image(systemName: "info.circle").font(.system(size: 9))
                            Text("More info").font(.system(size: 10, weight: .semibold))
                        }
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .foregroundStyle(.white)
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(.white, lineWidth: 0.5))
                    }
                    .padding(.top, 2)
                }
                .padding(14)
            }
            .frame(height: 172)
            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func runtimeText(_ minutes: Int?) -> String? {
        guard let m = minutes, m > 0 else { return nil }
        return "\(m / 60)h \(m % 60)m"
    }

    private var dot: some View { Circle().fill(.white.opacity(0.4)).frame(width: 2, height: 2) }
    private func metaDot(_ s: String) -> some View {
        Text(s).font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.6))
    }

    // MARK: Continue Watching (real data — GET /v1/playback/continue)

    private func loadContinueWatching() async {
        continueItems = (try? await container.apiClient.continueWatching()) ?? continueItems
    }

    private func removeContinueItem(_ item: ContinueWatchingItem) async {
        try? await container.apiClient.clearPlaybackProgress(titleId: item.titleId)
        continueItems.removeAll { $0.titleId == item.titleId }
    }

    /// Hidden entirely when there is nothing to resume.
    private var continueWatching: some View {
        Group {
            if !continueItems.isEmpty {
                VStack(alignment: .leading, spacing: 11) {
                    sectionHeader("Continue Watching", seeAll: false)
                    ScrollView(.horizontal) {
                        HStack(spacing: 19) {
                            ForEach(continueItems) { item in continueCard(item) }
                        }
                        .padding(.horizontal, 20)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
    }

    private func continueCard(_ item: ContinueWatchingItem) -> some View {
        Button { resumeRoute = .watch(item.titleId) } label: {
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    if let s = item.heroUrl ?? item.posterUrl, let url = URL(string: s) {
                        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.Colors.bgElevated }
                    } else {
                        LinearGradient(colors: [Theme.Colors.indigoDeep.opacity(0.5), Theme.Colors.bgBase], startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                    LinearGradient(colors: [.clear, Color(hex: 0x09090B).opacity(0.8)], startPoint: .center, endPoint: .bottom)
                    Image(systemName: "play.fill").font(.system(size: 11)).foregroundStyle(.white).padding(12)
                    VStack {
                        Spacer()
                        ProgressView(value: min(max(item.progress, 0), 1)).tint(Theme.Colors.indigoLight)
                            .background(Theme.Colors.track)
                            .padding(.horizontal, 12).padding(.bottom, 10)
                    }
                }
                .frame(width: 204, height: 113)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title).font(.system(size: 14)).foregroundStyle(.white).lineLimit(1)
                    Text(item.remainingText).font(.system(size: 11)).foregroundStyle(Color(hex: 0xEEEEEE).opacity(0.83))
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                Task { await removeContinueItem(item) }
            } label: {
                Label("Remove from Continue Watching", systemImage: "trash")
            }
        }
    }

    // MARK: Categories

    /// "All Movies" plus every genre present in the live catalogue.
    private var categories: [String] {
        var genres = Set<String>()
        for row in model.browse?.rows ?? [] {
            for item in row.items { genres.formUnion(item.genres) }
        }
        return [Self.allCategory] + genres.sorted()
    }

    private var categoryPills: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text("Categories").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(categories, id: \.self) { c in
                        Button { category = c } label: {
                            Text(c).font(.system(size: 11, weight: category == c ? .semibold : .regular))
                                .foregroundStyle(category == c ? Color.white : Color(hex: 0x1D1F26).opacity(0.4))
                                .padding(.horizontal, 14).frame(height: 32)
                                .modifier(CategoryPill(active: category == c))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: Rows

    /// Browse rows filtered client-side by the selected category pill
    /// (genre or title type); "All Movies" resets. Rows left empty by the
    /// filter are hidden.
    private var filteredRows: [BrowseRow] {
        let rows = model.browse?.rows ?? []
        guard category != Self.allCategory, categories.contains(category) else { return rows }
        return rows.compactMap { row in
            let items = row.items.filter { item in
                item.genres.contains { $0.caseInsensitiveCompare(category) == .orderedSame }
                    || item.type.caseInsensitiveCompare(category) == .orderedSame
            }
            return items.isEmpty ? nil : BrowseRow(slug: row.slug, title: row.title, items: items)
        }
    }

    private func posterRow(_ title: String, _ items: [TitleSummary]) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            sectionHeader(title, seeAll: false)
            ScrollView(.horizontal) {
                HStack(spacing: 20) {
                    ForEach(items) { item in
                        NavigationLink(value: item) { PosterCard(item: item, width: 147) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func sectionHeader(_ title: String, seeAll: Bool) -> some View {
        HStack {
            Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(.white)
            Spacer()
            if seeAll {
                Text("See all").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.Colors.indigoLight)
            }
        }
        .padding(.horizontal, 20)
    }
}

/// Category pill: active gets the indigo liquid-glass treatment; inactive is bare.
private struct CategoryPill: ViewModifier {
    let active: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if active {
            content.liquidGlass(cornerRadius: 9.5, tint: Theme.Colors.brand)
        } else {
            content
        }
    }
}
