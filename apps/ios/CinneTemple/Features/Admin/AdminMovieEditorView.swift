//
//  AdminMovieEditorView.swift
//  CinneTemple
//
//  Studio movie editor: create (POST) or edit (PATCH) a title with the full
//  field set, media uploads (presign → PUT → stat-verify), and permanent
//  delete. PATCH semantics honoured exactly — omitted keys stay unchanged,
//  cleared nullable fields are sent as explicit JSON null.
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct AdminMovieEditorView: View {
    let api: AdminAPI
    private let original: AdminTitle?
    private let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    // MARK: Field state

    @State private var titleText: String
    @State private var typeValue: String
    @State private var yearText: String
    @State private var tagline: String
    @State private var overview: String
    @State private var genresText: String
    @State private var castText: String
    @State private var director: String
    @State private var maturity: String
    @State private var runtimeText: String
    @State private var priceText: String
    @State private var categories: Set<String>
    @State private var isPremiere: Bool
    @State private var premiereAt: Date
    @State private var status: String

    @StateObject private var uploads: AdminUploadModel

    @State private var saving = false
    @State private var error: String?
    @State private var showDeleteConfirm = false
    @State private var deleting = false
    @State private var deleteResult: AdminDeleteResult?

    // Media pickers
    @State private var posterItem: PhotosPickerItem?
    @State private var heroItem: PhotosPickerItem?
    @State private var showVideoImporter = false

    /// Browse-row category slugs (chips). "new-listings" is server-enforced.
    private static let categoryOptions: [(slug: String, label: String)] = [
        ("new-listings", "New Listings"),
        ("trending", "Trending"),
        ("most-watched", "Most Watched"),
        ("coming-soon", "Coming Soon"),
        ("new-releases", "New Releases"),
        ("acclaimed", "Acclaimed"),
        ("series", "Series"),
    ]

    init(api: AdminAPI, movie: AdminTitle?, onSaved: @escaping () -> Void) {
        self.api = api
        self.original = movie
        self.onSaved = onSaved
        _uploads = StateObject(wrappedValue: AdminUploadModel(api: api))

        _titleText = State(initialValue: movie?.title ?? "")
        _typeValue = State(initialValue: movie?.type ?? "movie")
        _yearText = State(initialValue: movie?.year.map(String.init) ?? "")
        _tagline = State(initialValue: movie?.tagline ?? "")
        _overview = State(initialValue: movie?.overview ?? "")
        _genresText = State(initialValue: (movie?.genres ?? []).joined(separator: ", "))
        _castText = State(initialValue: (movie?.cast ?? []).joined(separator: ", "))
        _director = State(initialValue: movie?.director ?? "")
        _maturity = State(initialValue: movie?.maturityRating ?? "")
        _runtimeText = State(initialValue: movie?.runtimeMinutes.map(String.init) ?? "")
        _priceText = State(initialValue: Self.majorText(fromMinor: movie?.priceMinor ?? 0))
        _categories = State(initialValue: Set(movie?.categories ?? ["new-listings"]))
        _isPremiere = State(initialValue: movie?.isPremiere ?? false)
        _premiereAt = State(initialValue: AdminFormat.isoDate(movie?.premiereStartAt)
                            ?? Date().addingTimeInterval(24 * 3600))
        _status = State(initialValue: movie?.status ?? "draft")
    }

    private var isEditing: Bool { original != nil }

    // MARK: Body

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.bgBase.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        if let error { ErrorBanner(message: error) }
                        detailsCard
                        pricingCard
                        categoriesCard
                        mediaCard
                        if isEditing { dangerCard }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(isEditing ? "Edit Title" : "New Title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .disabled(saving || deleting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving {
                            ProgressView().tint(.white)
                        } else {
                            Text("Save").fontWeight(.semibold)
                        }
                    }
                    .foregroundStyle(canSave ? Theme.Colors.indigoBright : Theme.Colors.textSecondary)
                    .disabled(!canSave)
                }
            }
        }
        .interactiveDismissDisabled(saving || deleting || uploads.isBusy)
        .preferredColorScheme(.dark)
        .fileImporter(
            isPresented: $showVideoImporter,
            allowedContentTypes: videoTypes
        ) { result in
            handlePickedVideo(result)
        }
        .onChange(of: posterItem) { _, item in
            handlePickedImage(item, kind: .poster)
            posterItem = nil
        }
        .onChange(of: heroItem) { _, item in
            handlePickedImage(item, kind: .hero)
            heroItem = nil
        }
        .confirmationDialog(
            "Delete this title permanently?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete permanently", role: .destructive) {
                Task { await deleteMovie() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This cannot be undone. Any sold tickets remain on record and the count will be shown after deletion.")
        }
        .alert(item: $deleteResult) { result in
            Alert(
                title: Text("Title deleted"),
                message: Text(result.soldTickets == 0
                              ? "No tickets had been sold for this title."
                              : "\(result.soldTickets) sold ticket\(result.soldTickets == 1 ? "" : "s") were affected (audited)."),
                dismissButton: .default(Text("Done")) {
                    onSaved()
                    dismiss()
                }
            )
        }
    }

    private var videoTypes: [UTType] {
        var types: [UTType] = [.mpeg4Movie, .quickTimeMovie, .movie]
        if let webm = UTType(filenameExtension: "webm") { types.append(webm) }
        return types
    }

    // MARK: Cards

    private var detailsCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Details").font(.headline).foregroundStyle(Theme.Colors.textPrimary)

                GlassField(title: "Title", text: $titleText, autocapitalization: .words)

                fieldLabel("Type")
                HStack(spacing: 8) {
                    chip("Movie", selected: typeValue == "movie") { typeValue = "movie" }
                    chip("Series", selected: typeValue == "series") { typeValue = "series" }
                }

                GlassField(title: "Year", text: $yearText, keyboard: .numberPad)
                GlassField(title: "Tagline (optional)", text: $tagline, autocapitalization: .sentences)

                fieldLabel("Overview")
                TextEditor(text: $overview)
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                            .strokeBorder(.white.opacity(0.25), lineWidth: 1)
                    )
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .tint(Theme.Colors.brand)

                GlassField(title: "Genres (comma-separated)", text: $genresText, autocapitalization: .words)
                GlassField(title: "Cast (comma-separated)", text: $castText, autocapitalization: .words)
                GlassField(title: "Director (optional)", text: $director, autocapitalization: .words)
                GlassField(title: "Maturity rating (optional, e.g. PG-13)", text: $maturity)
                GlassField(title: "Runtime minutes (optional)", text: $runtimeText, keyboard: .numberPad)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var pricingCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Pricing & Availability").font(.headline).foregroundStyle(Theme.Colors.textPrimary)

                GlassField(title: "Price ₦ (0 = Free, pay-once watch-once)", text: $priceText, keyboard: .decimalPad)
                Text("Charged as \(AdminFormat.price(priceMinor)) — stored as \(priceMinor) kobo.")
                    .font(.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)

                fieldLabel("Status")
                HStack(spacing: 8) {
                    chip("Draft", selected: status == "draft") { status = "draft" }
                    chip("Published", selected: status == "published") { status = "published" }
                }

                Toggle(isOn: $isPremiere.animation(Theme.Motion.snappy)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Premiere event")
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text("A premiere requires a showtime.")
                            .font(.caption)
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
                .tint(Theme.Colors.brand)

                if isPremiere {
                    DatePicker("Showtime", selection: $premiereAt)
                        .datePickerStyle(.compact)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .tint(Theme.Colors.brand)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var categoriesCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Categories").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                Text("Browse rows this title appears in. New Listings is always kept by the server.")
                    .font(.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 122), spacing: 8)], spacing: 8) {
                    ForEach(Self.categoryOptions, id: \.slug) { option in
                        chip(option.label, selected: categories.contains(option.slug)) {
                            if categories.contains(option.slug) {
                                categories.remove(option.slug)
                            } else {
                                categories.insert(option.slug)
                            }
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var mediaCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Media").font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                Text("Uploads are verified on the server before they can be attached.")
                    .font(.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)

                ForEach(AdminUploadModel.Kind.allCases) { kind in
                    uploadRow(kind)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var dangerCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Danger Zone").font(.headline).foregroundStyle(Theme.Colors.danger)
                Button {
                    showDeleteConfirm = true
                } label: {
                    HStack {
                        if deleting {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "trash")
                            Text("Delete title permanently")
                        }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color(hex: 0xF2555A))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(Color(hex: 0xBF1515).opacity(0.08),
                                in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                            .strokeBorder(Color(hex: 0xBF1515).opacity(0.25), lineWidth: 1)
                    )
                }
                .buttonStyle(PressableButtonStyle())
                .disabled(deleting || saving)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Upload row

    private func uploadRow(_ kind: AdminUploadModel.Kind) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(kind.label, systemImage: kind.icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                pickButton(kind)
            }
            uploadStateView(kind)
        }
        .padding(12)
        .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func pickButton(_ kind: AdminUploadModel.Kind) -> some View {
        let label = HStack(spacing: 5) {
            Image(systemName: "square.and.arrow.up")
            Text("Choose")
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .frame(height: 30)
        .liquidGlass(cornerRadius: 15, tint: Theme.Colors.brand)

        switch kind {
        case .poster:
            PhotosPicker(selection: $posterItem, matching: .images) { label }
                .disabled(uploads.isBusy)
        case .hero:
            PhotosPicker(selection: $heroItem, matching: .images) { label }
                .disabled(uploads.isBusy)
        case .video:
            Button { showVideoImporter = true } label: { label }
                .buttonStyle(PressableButtonStyle())
                .disabled(uploads.isBusy)
        }
    }

    @ViewBuilder
    private func uploadStateView(_ kind: AdminUploadModel.Kind) -> some View {
        switch uploads.state(kind) {
        case .idle:
            Text(existingAttachmentNote(kind))
                .font(.caption)
                .foregroundStyle(Theme.Colors.textSecondary)
        case .preparing:
            HStack(spacing: 8) {
                ProgressView().tint(.white).controlSize(.small)
                Text("Preparing…").font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
        case .uploading(let fraction):
            VStack(alignment: .leading, spacing: 5) {
                ProgressView(value: fraction)
                    .tint(Theme.Colors.brand)
                Text("Uploading… \(Int(fraction * 100))%")
                    .font(.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        case .verifying:
            HStack(spacing: 8) {
                ProgressView().tint(.white).controlSize(.small)
                Text("Verifying on server…").font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
        case .verified(_, let size):
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Color(hex: 0x34D399))
                Text("Verified \(AdminFormat.megabytes(size)) — attached on save")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color(hex: 0x34D399))
            }
        case .failed(let message):
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color(hex: 0xF87171))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Color(hex: 0xF87171))
                    .lineLimit(2)
                Spacer()
                Button("Reset") { uploads.reset(kind) }
                    .font(.caption.bold())
                    .foregroundStyle(Theme.Colors.indigoBright)
            }
        }
    }

    private func existingAttachmentNote(_ kind: AdminUploadModel.Kind) -> String {
        let existing: String?
        switch kind {
        case .video: existing = original?.videoKey
        case .poster: existing = original?.posterKey
        case .hero: existing = original?.heroKey
        }
        return existing != nil ? "Already attached — choose a file to replace it." : "No file attached yet."
    }

    // MARK: Shared bits

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.Colors.textSecondary)
    }

    private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(selected ? .white : Theme.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    selected ? Theme.Colors.brand.opacity(0.32) : .white.opacity(0.03),
                    in: Capsule()
                )
                .overlay(
                    Capsule().strokeBorder(
                        selected ? Theme.Colors.indigoLight.opacity(0.6) : .white.opacity(0.2),
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(PressableButtonStyle())
    }

    // MARK: Media handlers

    private func handlePickedImage(_ item: PhotosPickerItem?, kind: AdminUploadModel.Kind) {
        guard let item else { return }
        Task {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    throw APIError(status: 0, title: "Import failed",
                                   detail: "Could not read the selected image.")
                }
                let (normalized, contentType, ext) = try AdminUploadModel.normalizedImage(data)
                let url = try AdminUploadModel.writeTemp(data: normalized, ext: ext)
                await uploads.upload(kind: kind, fileURL: url, contentType: contentType)
            } catch {
                uploads.fail(kind, message: AdminFormat.friendly(error))
            }
        }
    }

    private func handlePickedVideo(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let err):
            uploads.fail(.video, message: err.localizedDescription)
        case .success(let url):
            Task {
                do {
                    // Copy out of the security scope on a background task —
                    // videos can be huge.
                    let temp = try await Task.detached(priority: .userInitiated) {
                        try AdminUploadModel.copyToTemp(from: url)
                    }.value
                    let contentType = AdminUploadModel.videoContentType(for: temp)
                    await uploads.upload(kind: .video, fileURL: temp, contentType: contentType)
                } catch {
                    uploads.fail(.video, message: AdminFormat.friendly(error))
                }
            }
        }
    }

    // MARK: Save / delete

    private var priceMinor: Int {
        let cleaned = priceText.replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard let major = Double(cleaned), major > 0 else { return 0 }
        return Int((major * 100).rounded())
    }

    private var yearValue: Int? {
        guard let y = Int(yearText.trimmingCharacters(in: .whitespaces)),
              (1888...2100).contains(y) else { return nil }
        return y
    }

    private var isValid: Bool {
        !titleText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !overview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && yearValue != nil
    }

    private var canSave: Bool {
        isValid && !saving && !deleting && !uploads.isBusy
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let fields = buildFields()
            if let original {
                _ = try await api.updateMovie(id: original.id, fields: fields)
            } else {
                _ = try await api.createMovie(fields: fields)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onSaved()
            dismiss()
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    private func deleteMovie() async {
        guard let original else { return }
        deleting = true
        error = nil
        defer { deleting = false }
        do {
            deleteResult = try await api.deleteMovie(id: original.id)
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }

    /// Builds the request payload. Create: empty optionals are omitted
    /// (server defaults apply). Edit: cleared nullable fields are sent as
    /// explicit JSON null per the PATCH contract; unchanged concepts we do
    /// not manage (popularity, keys with no new upload) are omitted.
    private func buildFields() -> [String: JSONValue] {
        var f: [String: JSONValue] = [:]

        f["title"] = .string(trimmed(titleText))
        f["overview"] = .string(trimmed(overview))
        if let year = yearValue { f["year"] = .int(year) }
        f["type"] = .string(typeValue)

        setNullableString(&f, key: "tagline", value: tagline)
        setNullableString(&f, key: "director", value: director)
        setNullableString(&f, key: "maturityRating", value: maturity)

        f["genres"] = .array(csv(genresText).map { .string($0) })
        f["cast"] = .array(csv(castText).map { .string($0) })

        if let runtime = Int(trimmed(runtimeText)), runtime > 0 {
            f["runtimeMinutes"] = .int(runtime)
        }

        f["priceMinor"] = .int(priceMinor)
        f["currency"] = .string("NGN")
        f["categories"] = .array(categories.sorted().map { .string($0) })
        f["status"] = .string(status)

        f["isPremiere"] = .bool(isPremiere)
        if isPremiere {
            // Server rejects a premiere without a showtime; false auto-clears it.
            f["premiereStartAt"] = .string(ISO8601DateFormatter().string(from: premiereAt))
        }

        // Media: only send keys for freshly stat-verified uploads. Omitted
        // keys stay unchanged on PATCH.
        if let key = uploads.verifiedKey(.video) { f["videoKey"] = .string(key) }
        if let key = uploads.verifiedKey(.poster) { f["posterKey"] = .string(key) }
        if let key = uploads.verifiedKey(.hero) { f["heroKey"] = .string(key) }

        return f
    }

    private func setNullableString(_ f: inout [String: JSONValue], key: String, value: String) {
        let t = trimmed(value)
        if !t.isEmpty {
            f[key] = .string(t)
        } else if isEditing {
            f[key] = .null // explicit clear per PATCH contract
        }
        // create + empty: omit → server default (null)
    }

    private func trimmed(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func csv(_ s: String) -> [String] {
        s.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func majorText(fromMinor minor: Int) -> String {
        guard minor > 0 else { return "" }
        if minor % 100 == 0 { return String(minor / 100) }
        return String(format: "%.2f", Double(minor) / 100.0)
    }
}

extension AdminDeleteResult: Identifiable {}
