//
//  BackgroundSyncManager.swift
//  CinneTemple
//
//  Refreshes the browse + watchlist caches in the background using
//  BGTaskScheduler, so the app opens with fresh content offline.
//
//  Requires the task identifier to be declared in Info.plist under
//  `BGTaskSchedulerPermittedIdentifiers` (see apps/ios/README.md).
//

import Foundation
import BackgroundTasks

@MainActor
final class BackgroundSyncManager {
    static let taskIdentifier = "com.cinnetemple.app.refresh"

    private let catalogueAPI: CatalogueAPI
    private let cache: OfflineCache

    init(catalogueAPI: CatalogueAPI, cache: OfflineCache) {
        self.catalogueAPI = catalogueAPI
        self.cache = cache
    }

    /// Schedule the next background refresh (~6 hours out).
    func scheduleNextRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Perform the actual refresh work. Returns true on success.
    @discardableResult
    func performSync() async -> Bool {
        do {
            let browse = try await catalogueAPI.browse()
            cache.save(browse, for: "browse")
            return true
        } catch {
            return false
        }
    }
}
