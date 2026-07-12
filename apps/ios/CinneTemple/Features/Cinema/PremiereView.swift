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
    private weak var tokenProvider: TokenProviding?
    private(set) var reporter: PlaybackProgressReporter?
    let titleId: String
    private var lastTimestamp: String?
    private var pollTask: Task<Void, Never>?

    init(titleId: String, commerce: CommerceAPI, tokenProvider: TokenProviding? = nil) {
        self.titleId = titleId
        self.commerce = commerce
        self.tokenProvider = tokenProvider
    }

    func load() async {
        do {
            let room = try await commerce.premiereRoom(titleId: titleId)
            self.room = room
            if room.live && room.entitled {
                session = try? await commerce.playbackStart(titleId: titleId)
                if let session {
                    reporter = PlaybackProgressReporter(
                        titleId: titleId,
                        fallbackDurationSeconds: session.durationSeconds,
                        tokenProvider: tokenProvider
                    )
                }
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
        _model = StateObject(wrappedValue: PremiereViewModel(
            titleId: titleId,
            commerce: container.commerceAPI,
            tokenProvider: container.session
        ))
    }

    var body: some View {
        VStack(spacing: 0) {
            stage
            meta
            Divider().background(.white.opacity(0.1))
            chat
        }
        .background(Theme.Colors.bgBase.ignoresSafeArea())
        .navigationTitle(model.room?.title ?? "Premiere")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onDisappear { model.stop() }
    }

    /// Title + status line — Figma 65:360/65:361.
    @ViewBuilder private var meta: some View {
        if let room = model.room {
            VStack(alignment: .leading, spacing: 5) {
                Text("\(room.title) — World Premiere")
                    .font(.system(size: 19, weight: .bold)).foregroundStyle(.white)
                Text(room.live ? "Premiere ends in 42:16  •  Chat is live"
                               : "Starts \(Self.startLabel(room.premiereStartAt))  •  Pre-show chat is open")
                    .font(.system(size: 11.5)).foregroundStyle(.white.opacity(0.6))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private static func startLabel(_ iso: String?) -> String {
        guard let iso, let date = CountdownText.parseISO(iso) else { return "soon" }
        let f = DateFormatter()
        f.dateFormat = "MMM d, h:mm a"
        return f.string(from: date)
    }

    @ViewBuilder private var stage: some View {
        if let session = model.session {
            SecurePlayerView(session: session, reporter: model.reporter).padding(8)
        } else if let room = model.room {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .fill(.black)
                VStack(spacing: 10) {
                    if room.live && !room.entitled {
                        Text("Get a ticket to watch and chat.")
                            .font(.subheadline).foregroundStyle(Theme.Colors.textSecondary)
                    } else if let startAt = room.premiereStartAt {
                        Text("Premiere starts in").font(.subheadline).foregroundStyle(Theme.Colors.textSecondary)
                        CountdownText(iso: startAt)
                    } else {
                        Text("Premiere coming soon").foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
                .padding()
                // Badges — Figma 65:342…65:350: ● LIVE / PREMIERE / viewers.
                HStack(spacing: 8) {
                    if room.live {
                        Text("● LIVE").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 10).frame(height: 26)
                            .liquidGlass(cornerRadius: 13, tint: .red)
                    } else {
                        Text("STARTS SOON").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 10).frame(height: 26)
                            .liquidGlass(cornerRadius: 13, tint: .red)
                    }
                    Text("PREMIERE").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 10).frame(height: 26)
                        .liquidGlass(cornerRadius: 13)
                    if room.live {
                        HStack(spacing: 4) {
                            Image(systemName: "eye").font(.system(size: 9))
                            Text("12.4K watching").font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 10).frame(height: 26)
                        .liquidGlass(cornerRadius: 13)
                    }
                    Spacer()
                }
                .padding(10)
                .frame(maxHeight: .infinity, alignment: .top)
            }
            .aspectRatio(16.0/9.0, contentMode: .fit)
            .padding(8)
        } else {
            ProgressView().tint(.white).frame(height: 200)
        }
    }

    private var chat: some View {
        VStack(spacing: 0) {
            // Pinned message — Figma 65:364…65:368.
            HStack(spacing: 8) {
                Image(systemName: "pin.fill").font(.system(size: 10)).foregroundStyle(Theme.Colors.indigoLight)
                (Text("Cinnetemple ").fontWeight(.semibold).foregroundStyle(.white)
                 + Text(model.room?.live == true
                        ? "Welcome to the premiere! Be kind in chat"
                        : "Pre-show chat is open — premiere soon!").foregroundStyle(.white.opacity(0.7)))
                    .font(.system(size: 11.5))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .liquidGlass(cornerRadius: 10, tint: Theme.Colors.brand)
            .padding(.horizontal, 12)
            .padding(.top, 10)

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
        guard let target = Self.parseISO(iso) else { return }
        let s = Int(target.timeIntervalSinceNow)
        if s <= 0 { label = "Starting…"; return }
        let d = s / 86_400, h = (s % 86_400) / 3600, m = (s % 3600) / 60, sec = s % 60
        label = d > 0 ? "\(d)d \(h)h \(m)m" : "\(h)h \(m)m \(sec)s"
    }

    /// Backend timestamps carry fractional seconds ("…T19:00:00.000Z"), which
    /// the default ISO8601DateFormatter rejects — try both variants.
    static func parseISO(_ iso: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}
