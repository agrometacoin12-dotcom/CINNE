//
//  PremiereView.swift
//  CinneTemple
//
//  Premiere room: the secure player when the show is live and the viewer holds a
//  ticket, plus a polled live chat for ticket holders.
//

import SwiftUI
import Combine

@MainActor
final class PremiereViewModel: ObservableObject {
    @Published var room: PremiereRoom?
    @Published var session: PlaybackSession?
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var error: String?

    private let commerce: CommerceAPI
    let titleId: String
    private var lastTimestamp: String?
    private var pollTask: Task<Void, Never>?

    init(titleId: String, commerce: CommerceAPI) {
        self.titleId = titleId
        self.commerce = commerce
    }

    func load() async {
        do {
            let room = try await commerce.premiereRoom(titleId: titleId)
            self.room = room
            if room.live && room.entitled {
                session = try? await commerce.playbackStart(titleId: titleId)
            }
            startPolling(enabled: room.canChat)
        } catch let e as APIError {
            error = e.detail
        } catch {
            self.error = "Could not load the premiere."
        }
    }

    private func startPolling(enabled: Bool) {
        guard enabled else { return }
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.fetch()
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    private func fetch() async {
        guard let next = try? await commerce.premiereChat(titleId: titleId, since: lastTimestamp),
              !next.isEmpty else { return }
        lastTimestamp = next.last?.createdAt
        merge(next)
    }

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        draft = ""
        do {
            let msg = try await commerce.postChat(titleId: titleId, body: body)
            lastTimestamp = msg.createdAt
            merge([msg])
        } catch let e as APIError {
            error = e.detail
        } catch { /* transient */ }
    }

    private func merge(_ incoming: [ChatMessage]) {
        let existing = Set(messages.map(\.id))
        let fresh = incoming.filter { !existing.contains($0.id) }
        guard !fresh.isEmpty else { return }
        messages = Array((messages + fresh).suffix(300))
    }

    func stop() { pollTask?.cancel() }
}

struct PremiereView: View {
    @StateObject private var model: PremiereViewModel

    init(titleId: String, container: AppContainer) {
        _model = StateObject(wrappedValue: PremiereViewModel(titleId: titleId, commerce: container.commerceAPI))
    }

    var body: some View {
        VStack(spacing: 0) {
            stage
            Divider().background(.white.opacity(0.1))
            chat
        }
        .background(Theme.Colors.bgBase.ignoresSafeArea())
        .navigationTitle(model.room?.title ?? "Premiere")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder private var stage: some View {
        if let session = model.session {
            SecurePlayerView(session: session).padding(8)
        } else if let room = model.room {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(.ultraThinMaterial)
                VStack(spacing: 10) {
                    if room.live && !room.entitled {
                        Text("● LIVE").font(.caption.bold()).foregroundStyle(.red)
                        Text("Get a ticket to watch and chat.")
                            .font(.subheadline).foregroundStyle(Theme.Colors.textSecondary)
                    } else if let startAt = room.premiereStartAt {
                        Text("Premiere begins").font(.subheadline).foregroundStyle(Theme.Colors.textSecondary)
                        CountdownText(iso: startAt)
                    } else {
                        Text("Premiere coming soon").foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
                .padding()
            }
            .aspectRatio(16.0/9.0, contentMode: .fit)
            .padding(8)
        } else {
            ProgressView().tint(.white).frame(height: 200)
        }
    }

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(model.messages) { m in
                            (Text(m.author).fontWeight(.semibold).foregroundStyle(Theme.Colors.textPrimary)
                             + Text("  \(m.body)").foregroundStyle(Theme.Colors.textSecondary))
                                .font(.subheadline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(m.id)
                        }
                        if model.messages.isEmpty {
                            Text(model.room?.canChat == true ? "Be the first to say something." : "Chat opens when the premiere is live and you have a ticket.")
                                .font(.caption).foregroundStyle(Theme.Colors.textSecondary)
                        }
                    }
                    .padding(12)
                }
                .onChange(of: model.messages) { _, _ in
                    if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }

            if model.room?.canChat == true {
                HStack(spacing: 8) {
                    TextField("Say something…", text: $model.draft)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                    Button {
                        Task { await model.send() }
                    } label: {
                        Image(systemName: "paperplane.fill")
                            .padding(10)
                            .background(Theme.Colors.brand, in: Circle())
                            .foregroundStyle(.white)
                    }
                    .disabled(model.draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(12)
            }
        }
    }
}

struct CountdownText: View {
    let iso: String
    @State private var label = ""
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Text(label.isEmpty ? "—" : label)
            .font(.system(.title2, design: .monospaced).bold())
            .foregroundStyle(Theme.Colors.textPrimary)
            .onReceive(timer) { _ in update() }
            .onAppear(perform: update)
    }

    private func update() {
        guard let target = ISO8601DateFormatter().date(from: iso) else { return }
        let s = Int(target.timeIntervalSinceNow)
        if s <= 0 { label = "Starting…"; return }
        let d = s / 86_400, h = (s % 86_400) / 3600, m = (s % 3600) / 60, sec = s % 60
        label = d > 0 ? "\(d)d \(h)h \(m)m" : "\(h)h \(m)m \(sec)s"
    }
}
