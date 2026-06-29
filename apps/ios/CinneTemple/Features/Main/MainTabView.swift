//
//  MainTabView.swift
//  CinneTemple
//
//  Authenticated shell: Home / Search / My List / Profile / Settings.
//

import SwiftUI

struct MainTabView: View {
    @Environment(\.appContainer) private var container

    var body: some View {
        TabView {
            HomeView(container: container)
                .tabItem { Label("Home", systemImage: "play.house.fill") }
            PremieresView(container: container)
                .tabItem { Label("Premieres", systemImage: "sparkles.tv.fill") }
            SearchView(container: container)
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
            TicketsView(container: container)
                .tabItem { Label("Tickets", systemImage: "ticket.fill") }
            WatchlistView(container: container)
                .tabItem { Label("My List", systemImage: "bookmark.fill") }
            ProfileView(container: container)
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
            SettingsView(container: container)
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(Theme.Colors.brand)
    }
}
