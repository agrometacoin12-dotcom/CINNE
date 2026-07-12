//
//  NotificationsView.swift
//  CinneTemple
//
//  Notifications — glass back button + centered title top bar. The backend has
//  no notifications-feed endpoint yet (only push-device registration), so this
//  shows an honest empty state instead of demo content.
//

import SwiftUI

struct NotificationsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left").font(.system(size: 16)).foregroundStyle(.white)
                            .frame(width: 40, height: 40).liquidGlass(cornerRadius: 20)
                    }
                    Spacer()
                    Text("Notifications").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                    Spacer()
                    // Balance the back button so the title stays centered.
                    Color.clear.frame(width: 40, height: 40)
                }
                .padding(.horizontal, 16).padding(.top, 12)

                Spacer()
                VStack(spacing: 0) {
                    ZStack {
                        Circle().frame(width: 110, height: 110).foregroundStyle(.clear).liquidGlass(cornerRadius: 55)
                        Image(systemName: "bell").font(.system(size: 36)).foregroundStyle(.white.opacity(0.7))
                    }
                    Text("No notifications yet").font(.system(size: 16)).foregroundStyle(.white).padding(.top, 24)
                    Text("We'll let you know when something new drops or a premiere is about to start.")
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.55))
                        .multilineTextAlignment(.center).frame(maxWidth: 260).padding(.top, 8)
                }
                Spacer()
                Spacer()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}
