//
//  MainTabView.swift
//  CinneTemple
//
//  Authenticated shell — exactly five tabs per the cross-platform design
//  contract: Home / Premieres / Search / Tickets / My List. Profile and
//  Settings are NOT tabs: they live behind the Home top-right avatar
//  (Profile → Settings / Studio / Purchase history / Sign out).
//

import SwiftUI

struct MainTabView: View {
    @Environment(\.appContainer) private var container

    var body: some View {
        TabView {
            HomeView(container: container)
                .tabItem { Label("Home", systemImage: "house.fill") }
            PremieresView(container: container)
                .tabItem { Label("Premieres", systemImage: "play.tv.fill") }
            SearchView(container: container)
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
            TicketsView(container: container)
                .tabItem { Label("Tickets", systemImage: "ticket.fill") }
            WatchlistView(container: container)
                .tabItem { Label("My List", systemImage: "bookmark.fill") }
        }
        .tint(Theme.Colors.brand)
    }
}
