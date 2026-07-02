//
//  DownloadsView.swift
//  CinneTemple
//
//  Downloads — exact Figma (node 42:14645): heading + centered empty state with a
//  glass circle, copy, and an indigo "Find something to download" button.
//

import SwiftUI

struct DownloadsView: View {
    var onBrowse: () -> Void = {}

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                Text("Downloads").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer()
                VStack(spacing: 0) {
                    Circle().frame(width: 110, height: 110).foregroundStyle(.clear).liquidGlass(cornerRadius: 55)
                    Text("No downloads yet").font(.system(size: 16)).foregroundStyle(.white).padding(.top, 24)
                    Text("Movies and shows you download appear here for offline watching.")
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.55))
                        .multilineTextAlignment(.center).frame(maxWidth: 260).padding(.top, 8)
                    Button { onBrowse() } label: {
                        Text("Find something to download").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 24).padding(.vertical, 14)
                            .liquidGlass(cornerRadius: 12, tint: Theme.Colors.brand)
                    }
                    .buttonStyle(PressableButtonStyle()).padding(.top, 24)
                }
                .frame(maxWidth: .infinity)
                Spacer(); Spacer()
            }
            .padding(.horizontal, 20).padding(.top, 16)
        }
    }
}
