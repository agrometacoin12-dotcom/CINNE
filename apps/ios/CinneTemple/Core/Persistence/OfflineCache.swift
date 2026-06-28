//
//  OfflineCache.swift
//  CinneTemple
//
//  Lightweight on-device cache so the app can render the last-known user while
//  offline / before the network refresh completes. Persists Codable values as
//  JSON files in the caches directory.
//

import Foundation

struct OfflineCache {
    private let directory: URL

    init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        directory = base.appendingPathComponent("cinnetemple", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(for key: String) -> URL {
        directory.appendingPathComponent("\(key).json")
    }

    func save<T: Encodable>(_ value: T, for key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url(for: key), options: .atomic)
    }

    func load<T: Decodable>(_ type: T.Type, for key: String) -> T? {
        guard let data = try? Data(contentsOf: url(for: key)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    func remove(_ key: String) {
        try? FileManager.default.removeItem(at: url(for: key))
    }
}
