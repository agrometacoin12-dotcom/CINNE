//
//  AdminClassificationView.swift
//  CinneTemple
//
//  Classification editor for an EXISTING movie or series: format, genres &
//  subgenres, tags, industries, countries/languages, audience, certified
//  rating, release date, access type, availability window, series
//  completeness and editorial collections — plus the homepage placement
//  preview returned by the server. Saves with PUT, sending only changed
//  fields (explicit null clears). Pushed from AdminMovieEditorView.
//

import SwiftUI

struct AdminClassificationView: View {
    let api: AdminAPI
    let titleId: String
    let titleName: String
    /// Called after a successful save with the new classification and the
    /// taxonomy used, so the caller can refresh its legacy fields.
    var onSaved: (AdminClassification, AdminTaxonomy) -> Void = { _, _ in }

    @State private var taxonomy: AdminTaxonomy?
    @State private var classification: AdminClassification?
    @State private var draft: AdminClassificationDraft?
    @State private var countriesText = ""

    @State private var loading = false
    @State private var loadError: String?
    @State private var saving = false
    @State private var error: String?
    @State private var savedNote: String?
    @State private var expandedGenres: Set<String> = []

    var body: some View {
        ZStack {
            Theme.Colors.bgBase.ignoresSafeArea()
            content
        }
        .navigationTitle("Classification")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
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
        .navigationBarBackButtonHidden(saving)
        .task { if classification == nil { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        if let taxonomy, let classification, draft != nil {
            ScrollView {
                VStack(spacing: 16) {
                    if let error { ErrorBanner(message: error) }
                    if let savedNote { SuccessBanner(message: savedNote) }
                    if let problem = draft?.validationError { ErrorBanner(message: problem) }
                    headerCard(classification)
                    formatCard(taxonomy, classification)
                    genresCard(taxonomy)
                    tagsCard(taxonomy)
                    originCard(taxonomy, classification)
                    audienceCard(taxonomy)
                    releaseAccessCard(taxonomy, classification)
                    collectionsCard(taxonomy)
                    placementCard(classification)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load() }
        } else if let loadError {
            VStack(spacing: 14) {
                ErrorBanner(message: loadError)
                Button("Try again") { Task { await load() } }
                    .font(.subheadline.bold())
                    .foregroundStyle(Theme.Colors.indigoBright)
            }
            .padding(16)
        } else {
            ProgressView().tint(.white)
        }
    }

    // MARK: Cards

    private func headerCard(_ c: AdminClassification) -> some View {
        card {
            VStack(alignment: .leading, spacing: 6) {
                Text(titleName).font(.headline).foregroundStyle(Theme.Colors.textPrimary)
                HStack(spacing: 6) {
                    AdminPill(text: c.isSeries ? "SERIES" : "MOVIE", color: Theme.Colors.indigoBright)
                    if hasChanges {
                        AdminPill(text: "UNSAVED CHANGES", color: Theme.Colors.star)
                    }
                }
                caption("Classification drives which homepage sections pick this title. Only changed fields are sent when you save.")
            }
        }
    }

    private func formatCard(_ t: AdminTaxonomy, _ c: AdminClassification) -> some View {
        card {
            sectionTitle("Content format")
            let defaultFormat = c.isSeries ? "TV_SERIES" : "FEATURE_FILM"
            chipGrid {
                AdminChip(label: "Default (\(t.formatLabel(defaultFormat)))",
                          selected: draft?.contentFormat == nil) {
                    draft?.contentFormat = nil
                }
                ForEach(t.formats) { option in
                    AdminChip(label: option.label, selected: draft?.contentFormat == option.value) {
                        draft?.contentFormat = option.value
                    }
                }
            }
            caption("Effective now: \(t.formatLabel(c.effectiveFormat)).")
        }
    }

    private func genresCard(_ t: AdminTaxonomy) -> some View {
        card {
            sectionTitle("Genres")
            caption("Pick top-level genres and/or subgenres. A subgenre also counts for its parent. Selection order is kept — the first is the primary genre.")
            let selected = draft?.genres ?? []
            if !selected.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(selected.enumerated()), id: \.element) { index, slug in
                        HStack(spacing: 8) {
                            Text("\(index + 1).").font(.caption.monospacedDigit())
                                .foregroundStyle(Theme.Colors.textSecondary)
                            Text(t.genreLabel(slug)).font(.caption.weight(.semibold))
                                .foregroundStyle(Theme.Colors.textPrimary)
                            Spacer()
                            Button { toggleList(\.genres, slug) } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(10)
                .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
            }
            VStack(spacing: 8) {
                ForEach(t.genres) { genre in
                    genreRow(genre, selected: selected)
                }
            }
        }
    }

    private func genreRow(_ genre: AdminTaxonomy.Genre, selected: [String]) -> some View {
        let subSelected = genre.subgenres.filter { selected.contains($0.slug) }.count
        let expanded = expandedGenres.contains(genre.slug)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                AdminChip(label: genre.name, selected: selected.contains(genre.slug)) {
                    toggleList(\.genres, genre.slug)
                }
                if !genre.subgenres.isEmpty {
                    Button {
                        withAnimation(Theme.Motion.snappy) {
                            if expanded { expandedGenres.remove(genre.slug) } else { expandedGenres.insert(genre.slug) }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(subSelected > 0 ? "\(subSelected) sub" : "Subgenres")
                            Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(subSelected > 0 ? Theme.Colors.indigoBright : Theme.Colors.textSecondary)
                        .frame(width: 96)
                    }
                    .buttonStyle(.plain)
                }
            }
            if expanded {
                chipGrid(minimum: 110) {
                    ForEach(genre.subgenres) { sub in
                        AdminChip(label: sub.name, selected: selected.contains(sub.slug)) {
                            toggleList(\.genres, sub.slug)
                        }
                    }
                }
                .padding(.leading, 14)
            }
        }
    }

    private func tagsCard(_ t: AdminTaxonomy) -> some View {
        card {
            sectionTitle("Tags")
            ForEach(t.tagGroups, id: \.kind) { group in
                fieldLabel(AdminTaxonomy.tagKindLabel(group.kind))
                chipGrid {
                    ForEach(group.tags) { tag in
                        AdminChip(label: tag.name, selected: draft?.tags.contains(tag.slug) ?? false) {
                            toggleList(\.tags, tag.slug)
                        }
                    }
                }
            }
            extraSlugs(draft?.tags ?? [], known: Set(t.tags.map(\.slug)), keyPath: \.tags)
        }
    }

    private func originCard(_ t: AdminTaxonomy, _ c: AdminClassification) -> some View {
        card {
            sectionTitle("Origin & language")

            fieldLabel("Industries")
            let autoSlugs = Set(c.autoIndustries.map(\.slug))
            chipGrid {
                ForEach(t.industries) { industry in
                    if autoSlugs.contains(industry.slug) {
                        AdminChip(label: industry.name, selected: true, locked: true) {}
                    } else {
                        AdminChip(label: industry.name,
                                  selected: draft?.manualIndustries.contains(industry.slug) ?? false) {
                            toggleList(\.manualIndustries, industry.slug)
                        }
                    }
                }
            }
            caption("Locked chips are AUTO — derived by the server from production countries and original languages, and recomputed on every save. Tap others to add them manually.")

            GlassField(title: "Production countries (ISO codes, e.g. NG, GH)", text: $countriesText,
                       autocapitalization: .characters)
                .onChange(of: countriesText) { _, text in
                    draft?.productionCountries = AdminClassificationDraft.parseCountries(text)
                }

            fieldLabel("Original languages")
            languageChips(t, keyPath: \.originalLanguages)
            fieldLabel("Audio languages")
            languageChips(t, keyPath: \.audioLanguages)
        }
    }

    private func languageChips(_ t: AdminTaxonomy, keyPath: WritableKeyPath<AdminClassificationDraft, [String]>) -> some View {
        let selected = draft?[keyPath: keyPath] ?? []
        let known = Set(t.languages.map(\.code))
        let extras = selected.filter { !known.contains($0) }
        return chipGrid(minimum: 104) {
            ForEach(t.languages) { lang in
                AdminChip(label: lang.name, selected: selected.contains(lang.code)) {
                    toggleList(keyPath, lang.code)
                }
            }
            ForEach(extras, id: \.self) { code in
                AdminChip(label: code, selected: true) { toggleList(keyPath, code) }
            }
        }
    }

    private func audienceCard(_ t: AdminTaxonomy) -> some View {
        card {
            sectionTitle("Audience & rating")
            fieldLabel("Audience")
            chipGrid(minimum: 96) {
                AdminChip(label: "Not set", selected: draft?.audience == nil) { draft?.audience = nil }
                ForEach(t.audiences) { option in
                    AdminChip(label: option.label, selected: draft?.audience == option.value) {
                        draft?.audience = option.value
                    }
                }
            }
            caption("Audience is for discovery only — it does not set the age rating.")

            GlassField(title: "Certified age rating (e.g. 18, PG-13; empty clears)",
                       text: binding(\.ageRating), autocapitalization: .characters)
            GlassField(title: "Rating jurisdiction (e.g. NG NFVCB, US MPA)",
                       text: binding(\.ratingJurisdiction), autocapitalization: .characters)
            caption("Rating and jurisdiction are stored separately. Leave both empty if the title has not been certified.")
        }
    }

    private func releaseAccessCard(_ t: AdminTaxonomy, _ c: AdminClassification) -> some View {
        card {
            sectionTitle("Release & access")

            Toggle(isOn: Binding(
                get: { draft?.releaseDate != nil },
                set: { on in
                    draft?.releaseDate = on
                        ? (classification?.releaseDate.map { AdminClassificationDraft.dayString($0) }
                           ?? AdminClassificationDraft.day(from: Date()))
                        : nil
                }
            )) {
                labelled("Release date", "Off = uses the title's year (Jan 1).")
            }
            .tint(Theme.Colors.brand)
            if draft?.releaseDate != nil {
                DatePicker("Released", selection: Binding(
                    get: { AdminClassificationDraft.date(fromDay: draft?.releaseDate) ?? Date() },
                    set: { draft?.releaseDate = AdminClassificationDraft.day(from: $0) }
                ), displayedComponents: .date)
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.brand)
            }

            fieldLabel("Access type")
            chipGrid {
                AdminChip(label: "Not set (from price)", selected: draft?.accessType == nil) {
                    draft?.accessType = nil
                }
                ForEach(t.accessTypes) { option in
                    AdminChip(label: option.label, selected: draft?.accessType == option.value) {
                        draft?.accessType = option.value
                    }
                }
            }
            caption("Effective now: \(t.accessLabel(c.effectiveAccess)). Classification only — checkout still charges the ticket price once (pay-per-view).")

            dateToggle("Available from", "Hidden from rows before this time.", keyPath: \.availableFrom,
                       fallback: Date())
            dateToggle("Available until", "Hidden from rows from this time.", keyPath: \.availableUntil,
                       fallback: Date().addingTimeInterval(30 * 24 * 3600))

            if c.isSeries {
                Toggle(isOn: Binding(
                    get: { draft?.seriesComplete ?? false },
                    set: { draft?.seriesComplete = $0 }
                )) {
                    labelled("Series complete", "All episodes are out (Complete Series row).")
                }
                .tint(Theme.Colors.brand)
            }
        }
    }

    private func dateToggle(_ title: String, _ note: String,
                            keyPath: WritableKeyPath<AdminClassificationDraft, String?>,
                            fallback: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(
                get: { draft?[keyPath: keyPath] != nil },
                set: { on in
                    draft?[keyPath: keyPath] = on ? AdminClassificationDraft.iso(fallback) : nil
                }
            )) {
                labelled(title, note)
            }
            .tint(Theme.Colors.brand)
            if draft?[keyPath: keyPath] != nil {
                DatePicker(title, selection: Binding(
                    get: { AdminFormat.isoDate(draft?[keyPath: keyPath]) ?? fallback },
                    set: { draft?[keyPath: keyPath] = AdminClassificationDraft.iso($0) }
                ))
                .labelsHidden()
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.brand)
            }
        }
    }

    private func collectionsCard(_ t: AdminTaxonomy) -> some View {
        card {
            sectionTitle("Editorial collections")
            caption("Hand-picked rows such as Editor's Picks. Browse-row categories are set on the title editor.")
            chipGrid {
                ForEach(t.editorialCollections) { collection in
                    AdminChip(label: collection.name,
                              selected: draft?.collections.contains(collection.slug) ?? false) {
                        toggleList(\.collections, collection.slug)
                    }
                }
            }
        }
    }

    private func placementCard(_ c: AdminClassification) -> some View {
        card {
            sectionTitle("Homepage placement")
            caption("Sections whose rules match the saved classification. Actual placement requires publication and eligibility checks.")
            if hasChanges {
                caption("Save to refresh this preview.")
            }
            if c.placement.isEmpty {
                Text("No enabled homepage section matches this title yet.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.Colors.textSecondary)
            } else {
                VStack(spacing: 8) {
                    ForEach(c.placement) { p in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.title).font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.Colors.textPrimary)
                                if let reason = p.reason, !reason.isEmpty {
                                    Text(reason).font(.caption).foregroundStyle(Color(hex: 0xF59E0B))
                                }
                            }
                            Spacer()
                            AdminPill(text: p.eligible ? "ELIGIBLE" : "NOT ELIGIBLE",
                                      color: p.eligible ? Color(hex: 0x34D399) : Color(hex: 0xF59E0B))
                        }
                        .padding(10)
                        .background(.white.opacity(0.03),
                                    in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                    }
                }
            }
        }
    }

    /// Selected slugs the taxonomy no longer knows (kept unless removed).
    @ViewBuilder
    private func extraSlugs(_ selected: [String], known: Set<String>,
                            keyPath: WritableKeyPath<AdminClassificationDraft, [String]>) -> some View {
        let extras = selected.filter { !known.contains($0) }
        if !extras.isEmpty {
            fieldLabel("Other")
            chipGrid {
                ForEach(extras, id: \.self) { slug in
                    AdminChip(label: slug, selected: true) { toggleList(keyPath, slug) }
                }
            }
        }
    }

    // MARK: Building blocks

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) { content() }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func chipGrid<Content: View>(minimum: CGFloat = 122, @ViewBuilder _ content: () -> Content) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minimum), spacing: 8)], spacing: 8) { content() }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.headline).foregroundStyle(Theme.Colors.textPrimary)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).font(.subheadline).foregroundStyle(Theme.Colors.textSecondary)
    }

    private func caption(_ text: String) -> some View {
        Text(text).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func labelled(_ title: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).foregroundStyle(Theme.Colors.textPrimary)
            Text(note).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
        }
    }

    private func binding(_ keyPath: WritableKeyPath<AdminClassificationDraft, String>) -> Binding<String> {
        Binding(get: { draft?[keyPath: keyPath] ?? "" }, set: { draft?[keyPath: keyPath] = $0 })
    }

    private func toggleList(_ keyPath: WritableKeyPath<AdminClassificationDraft, [String]>, _ slug: String) {
        guard draft != nil else { return }
        if let i = draft![keyPath: keyPath].firstIndex(of: slug) {
            draft![keyPath: keyPath].remove(at: i)
        } else {
            draft![keyPath: keyPath].append(slug)
        }
    }

    // MARK: Load / save

    private var baseline: AdminClassificationDraft? { classification.map { AdminClassificationDraft($0) } }

    private var pendingFields: [String: JSONValue] {
        guard let draft, let baseline, let classification else { return [:] }
        return draft.payload(comparedTo: baseline, isSeries: classification.isSeries)
    }

    private var hasChanges: Bool { !pendingFields.isEmpty }

    private var canSave: Bool {
        hasChanges && !saving && !loading && draft?.validationError == nil
    }

    private func apply(_ c: AdminClassification) {
        classification = c
        draft = AdminClassificationDraft(c)
        countriesText = c.productionCountries.joined(separator: ", ")
        if let taxonomy {
            // Expand genres that have a selected subgenre.
            expandedGenres.formUnion(c.genres.compactMap { slug in
                taxonomy.parentGenre(of: slug).flatMap { $0.slug == slug ? nil : $0.slug }
            })
        }
    }

    private func load() async {
        loading = true
        loadError = nil
        defer { loading = false }
        do {
            async let tax = api.taxonomy()
            async let cls = api.classification(titleId: titleId)
            let (t, c) = try await (tax, cls)
            taxonomy = t
            apply(c)
        } catch {
            if classification == nil {
                loadError = AdminFormat.friendly(error)
            } else {
                self.error = AdminFormat.friendly(error)
            }
        }
    }

    private func save() async {
        guard canSave else { return }
        let fields = pendingFields
        saving = true
        error = nil
        savedNote = nil
        defer { saving = false }
        do {
            let updated = try await api.updateClassification(titleId: titleId, fields: fields)
            apply(updated)
            savedNote = "Classification saved."
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if let taxonomy { onSaved(updated, taxonomy) }
        } catch {
            self.error = AdminFormat.friendly(error)
        }
    }
}

// MARK: - Chip

/// Selectable capsule chip used by the classification editor. `locked`
/// shows a lock and ignores taps (server-derived values).
struct AdminChip: View {
    let label: String
    let selected: Bool
    var locked: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            guard !locked else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 4) {
                if locked { Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold)) }
                Text(label).lineLimit(1).minimumScaleFactor(0.8)
                if locked { Text("AUTO").font(.system(size: 8, weight: .heavy)).opacity(0.8) }
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(selected ? .white : Theme.Colors.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .padding(.horizontal, 6)
            .background(
                locked ? Color.white.opacity(0.08)
                    : (selected ? Theme.Colors.brand.opacity(0.32) : .white.opacity(0.03)),
                in: Capsule()
            )
            .overlay(
                Capsule().strokeBorder(
                    locked ? .white.opacity(0.3)
                        : (selected ? Theme.Colors.indigoLight.opacity(0.6) : .white.opacity(0.2)),
                    style: StrokeStyle(lineWidth: 1, dash: locked ? [3, 2] : [])
                )
            )
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(locked)
        .accessibilityLabel(locked ? "\(label), automatic" : label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
