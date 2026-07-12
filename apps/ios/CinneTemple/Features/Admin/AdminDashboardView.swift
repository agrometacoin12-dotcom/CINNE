//
//  AdminDashboardView.swift
//  CinneTemple
//
//  Studio — the admin console. Segmented glass tabs over Movies / Members /
//  Sales / Activity. Reached from the Profile screen (admins only).
//

import SwiftUI

enum AdminTab: String, CaseIterable, Identifiable {
    case movies = "Movies"
    case members = "Members"
    case sales = "Sales"
    case activity = "Activity"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .movies: return "film.stack"
        case .members: return "person.2"
        case .sales: return "nairasign.circle"
        case .activity: return "list.bullet.rectangle"
        }
    }
}

struct AdminDashboardView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var tab: AdminTab = .movies

    @StateObject private var moviesModel: AdminMoviesModel
    @StateObject private var membersModel: AdminMembersModel
    @StateObject private var salesModel: AdminSalesModel
    @StateObject private var activityModel: AdminActivityModel

    init(container: AppContainer) {
        let api = AdminAPI(client: container.apiClient)
        _moviesModel = StateObject(wrappedValue: AdminMoviesModel(api: api))
        _membersModel = StateObject(wrappedValue: AdminMembersModel(api: api))
        _salesModel = StateObject(wrappedValue: AdminSalesModel(api: api))
        _activityModel = StateObject(wrappedValue: AdminActivityModel(api: api))
    }

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            VStack(spacing: 0) {
                tabBar
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 4)

                switch tab {
                case .movies: AdminMoviesTab(model: moviesModel)
                case .members: AdminMembersTab(model: membersModel)
                case .sales: AdminSalesTab(model: salesModel)
                case .activity: AdminActivityTab(model: activityModel)
                }
            }
        }
        .navigationTitle("Studio")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(AdminTab.allCases) { t in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(Theme.Motion.snappy) { tab = t }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: t.icon)
                            .font(.system(size: 15, weight: .semibold))
                        Text(t.rawValue)
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(tab == t ? .white : Theme.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background {
                        if tab == t {
                            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                                .fill(Theme.Colors.brand.opacity(0.32))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                                        .strokeBorder(Theme.Colors.indigoLight.opacity(0.55), lineWidth: 1)
                                )
                        }
                    }
                }
                .buttonStyle(PressableButtonStyle())
            }
        }
        .padding(5)
        .liquidGlass(cornerRadius: Theme.Radius.md)
    }
}
