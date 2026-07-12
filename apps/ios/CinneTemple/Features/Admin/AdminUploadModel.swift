//
//  AdminUploadModel.swift
//  CinneTemple
//
//  Drives the presign → PUT (exact Content-Type, HMAC-bound) → stat-verify
//  media pipeline for the movie editor. One slot per media kind; a slot only
//  reaches .verified after GET /v1/admin/uploads/stat confirms the bytes.
//

import Foundation
import SwiftUI
import Combine
import UIKit
import UniformTypeIdentifiers

@MainActor
final class AdminUploadModel: ObservableObject {

    enum Kind: String, CaseIterable, Identifiable {
        case video, poster, hero
        var id: String { rawValue }

        var label: String {
            switch self {
            case .video: return "Video"
            case .poster: return "Poster"
            case .hero: return "Hero image"
            }
        }

        var icon: String {
            switch self {
            case .video: return "play.rectangle"
            case .poster: return "photo.artframe"
            case .hero: return "photo.on.rectangle.angled"
            }
        }
    }

    enum SlotState: Equatable {
        case idle
        case preparing
        case uploading(Double)
        case verifying
        case verified(key: String, size: Int)
        case failed(String)
    }

    @Published private(set) var slots: [Kind: SlotState] = [:]

    private let api: AdminAPI

    init(api: AdminAPI) { self.api = api }

    func state(_ kind: Kind) -> SlotState { slots[kind] ?? .idle }

    /// A new, stat-verified storage key for the slot (nil when nothing new
    /// was uploaded — the save payload then omits the field, i.e. unchanged).
    func verifiedKey(_ kind: Kind) -> String? {
        if case .verified(let key, _) = state(kind) { return key }
        return nil
    }

    /// Save must wait for in-flight uploads: unverified keys must never be
    /// attached to a movie.
    var isBusy: Bool {
        slots.values.contains {
            switch $0 {
            case .preparing, .uploading, .verifying: return true
            default: return false
            }
        }
    }

    // MARK: Pipeline

    /// Runs the full pipeline for a local temp file. Deletes the temp file
    /// when done.
    func upload(kind: Kind, fileURL: URL, contentType: String) async {
        slots[kind] = .preparing
        defer { try? FileManager.default.removeItem(at: fileURL) }
        do {
            let presigned = try await api.presignUpload(kind: kind.rawValue, contentType: contentType)
            slots[kind] = .uploading(0)
            try await api.upload(file: fileURL, to: presigned) { [weak self] fraction in
                Task { @MainActor [weak self] in
                    guard let self, case .uploading = self.state(kind) else { return }
                    self.slots[kind] = .uploading(fraction)
                }
            }
            slots[kind] = .verifying
            let stat = try await api.uploadStat(key: presigned.key)
            guard stat.exists, let size = stat.size, size > 0 else {
                throw APIError(status: 0, title: "Verification failed",
                               detail: "The upload could not be verified on the server.")
            }
            slots[kind] = .verified(key: presigned.key, size: size)
        } catch {
            slots[kind] = .failed(AdminFormat.friendly(error))
        }
    }

    func reset(_ kind: Kind) {
        slots[kind] = .idle
    }

    /// Surfaces a local (pre-presign) failure, e.g. an unreadable picked file.
    func fail(_ kind: Kind, message: String) {
        slots[kind] = .failed(message)
    }

    // MARK: Media preparation helpers

    /// Normalizes picked image data to the presign allowlist
    /// (jpeg | png | webp) — HEIC and friends are re-encoded to JPEG.
    /// Returns (data, contentType, fileExtension).
    nonisolated static func normalizedImage(_ data: Data) throws -> (Data, String, String) {
        if data.starts(with: [0xFF, 0xD8]) {
            return (data, "image/jpeg", "jpg")
        }
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            return (data, "image/png", "png")
        }
        if data.count > 12,
           data[0...3] == Data("RIFF".utf8),
           data[8...11] == Data("WEBP".utf8) {
            return (data, "image/webp", "webp")
        }
        // Re-encode anything else (e.g. HEIC) as JPEG.
        guard let image = UIImage(data: data),
              let jpeg = image.jpegData(compressionQuality: 0.9) else {
            throw APIError(status: 0, title: "Unsupported image",
                           detail: "Could not read this image. Use JPEG, PNG, or WebP.")
        }
        return (jpeg, "image/jpeg", "jpg")
    }

    /// Video Content-Type from the file extension (allowlist:
    /// mp4 | quicktime | webm).
    nonisolated static func videoContentType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "mp4", "m4v": return "video/mp4"
        case "mov", "qt": return "video/quicktime"
        case "webm": return "video/webm"
        default: return "video/mp4"
        }
    }

    /// Writes data to a unique temp file and returns its URL.
    nonisolated static func writeTemp(data: Data, ext: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("ct-upload-\(UUID().uuidString).\(ext)")
        try data.write(to: url)
        return url
    }

    /// Copies a security-scoped picked file into our temp dir so the upload
    /// can stream it after the scoped access ends.
    nonisolated static func copyToTemp(from source: URL) throws -> URL {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("ct-upload-\(UUID().uuidString).\(source.pathExtension)")
        try FileManager.default.copyItem(at: source, to: dest)
        return dest
    }
}
