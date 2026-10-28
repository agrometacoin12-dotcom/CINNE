import XCTest
@testable import CinneTemple

/// Captures requests to `classification.test` and replies with a canned body.
private final class ClassificationStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = "{}"
    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var lastBody: Data?

    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "classification.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastRequest = request
        Self.lastBody = request.httpBody ?? request.httpBodyStream.map { stream in
            stream.open(); defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            return data
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
final class AdminClassificationTests: XCTestCase {
    static let taxonomyJSON = #"""
    {
      "genres": [
        {"slug":"action","name":"Action","subgenres":[{"slug":"action-martial-arts","name":"Martial Arts"},{"slug":"action-military","name":"Military"}]},
        {"slug":"horror","name":"Horror","subgenres":[{"slug":"horror-psychological","name":"Psychological"}]},
        {"slug":"faith-spirituality","name":"Faith & Spirituality","subgenres":[]}
      ],
      "tags": [
        {"slug":"true-story","name":"Based on a True Story","kind":"STORY"},
        {"slug":"feel-good","name":"Feel-Good","kind":"MOOD"},
        {"slug":"betrayal","name":"Betrayal","kind":"THEME"},
        {"slug":"village","name":"Village","kind":"SETTING"}
      ],
      "industries": [{"slug":"nollywood","name":"Nollywood"},{"slug":"african-cinema","name":"African Cinema"}],
      "collections": [
        {"slug":"editors-picks","name":"Editor's Picks","kind":"EDITORIAL"},
        {"slug":"trending","name":"Trending","kind":"SYSTEM"},
        {"slug":"new-listings","name":"New Listings","kind":"SYSTEM"}
      ],
      "formats": [{"value":"FEATURE_FILM","label":"Feature Film"},{"value":"TV_SERIES","label":"TV Series"}],
      "audiences": [{"value":"KIDS","label":"Kids"},{"value":"ADULTS","label":"Adults"}],
      "accessTypes": [{"value":"FREE","label":"Free"},{"value":"PAY_PER_VIEW","label":"Pay-per-view"}],
      "languages": [{"code":"en","name":"English"},{"code":"yo","name":"Yoruba"}],
      "decades": ["1970s","2020s"]
    }
    """#

    static let classificationJSON = #"""
    {
      "titleId": "t1",
      "type": "series",
      "contentFormat": null,
      "effectiveFormat": "TV_SERIES",
      "genres": ["horror-psychological", "action"],
      "tags": ["betrayal"],
      "collections": ["editors-picks", "trending"],
      "industries": [
        {"slug":"nollywood","name":"Nollywood","source":"auto"},
        {"slug":"african-cinema","name":"African Cinema","source":"manual"}
      ],
      "audience": "ADULTS",
      "ageRating": "18",
      "ratingJurisdiction": "NG NFVCB",
      "releaseDate": "2024-05-01",
      "accessType": null,
      "effectiveAccess": "PAY_PER_VIEW",
      "productionCountries": ["NG"],
      "originalLanguages": ["yo"],
      "audioLanguages": ["yo", "en"],
      "availableFrom": "2024-05-01T00:00:00.000Z",
      "availableUntil": null,
      "seriesComplete": false,
      "placement": [
        {"slug":"nollywood-blockbusters","title":"Nollywood Blockbusters","eligible":true},
        {"slug":"horror-nights","title":"Horror Nights","eligible":false,"reason":"Not published"}
      ]
    }
    """#

    private func classification() throws -> AdminClassification {
        try JSONDecoder().decode(AdminClassification.self, from: Data(Self.classificationJSON.utf8))
    }

    // MARK: Decoding

    func testDecodesTaxonomy() throws {
        let t = try JSONDecoder().decode(AdminTaxonomy.self, from: Data(Self.taxonomyJSON.utf8))
        XCTAssertEqual(t.genres.map(\.slug), ["action", "horror", "faith-spirituality"])
        XCTAssertEqual(t.genres[0].subgenres.map(\.slug), ["action-martial-arts", "action-military"])
        XCTAssertEqual(t.tagGroups.map(\.kind), ["MOOD", "THEME", "SETTING", "STORY"])
        XCTAssertEqual(t.editorialCollections.map(\.slug), ["editors-picks"])
        XCTAssertEqual(t.systemCollections.map(\.slug), ["trending", "new-listings"])
        XCTAssertEqual(t.formats.first?.label, "Feature Film")
        XCTAssertEqual(t.audiences.map(\.value), ["KIDS", "ADULTS"])
        XCTAssertEqual(t.accessTypes.map(\.value), ["FREE", "PAY_PER_VIEW"])
        XCTAssertEqual(t.languages.map(\.code), ["en", "yo"])
        XCTAssertEqual(t.decades, ["1970s", "2020s"])
        XCTAssertEqual(t.genreLabel("horror-psychological"), "Horror › Psychological")
        XCTAssertEqual(t.parentGenre(of: "action-military")?.slug, "action")
        XCTAssertEqual(t.genreLabel("unknown"), "unknown")
    }

    func testTaxonomyToleratesMissingLists() throws {
        let t = try JSONDecoder().decode(AdminTaxonomy.self, from: Data(#"{"genres":[{"slug":"a","name":"A"}]}"#.utf8))
        XCTAssertEqual(t.genres.first?.subgenres, [])
        XCTAssertTrue(t.tags.isEmpty && t.collections.isEmpty && t.decades.isEmpty)
    }

    func testDecodesClassification() throws {
        let c = try classification()
        XCTAssertEqual(c.titleId, "t1")
        XCTAssertTrue(c.isSeries)
        XCTAssertNil(c.contentFormat)
        XCTAssertEqual(c.effectiveFormat, "TV_SERIES")
        XCTAssertEqual(c.genres, ["horror-psychological", "action"])
        XCTAssertEqual(c.autoIndustries.map(\.slug), ["nollywood"])
        XCTAssertEqual(c.manualIndustrySlugs, ["african-cinema"])
        XCTAssertEqual(c.ratingJurisdiction, "NG NFVCB")
        XCTAssertNil(c.accessType)
        XCTAssertEqual(c.effectiveAccess, "PAY_PER_VIEW")
        XCTAssertEqual(c.audioLanguages, ["yo", "en"])
        XCTAssertNil(c.availableUntil)
        XCTAssertEqual(c.placement.count, 2)
        XCTAssertTrue(c.placement[0].eligible)
        XCTAssertNil(c.placement[0].reason)
        XCTAssertEqual(c.placement[1].reason, "Not published")
    }

    // MARK: Draft → PUT body

    func testUnchangedDraftSendsNothing() throws {
        let c = try classification()
        let draft = AdminClassificationDraft(c)
        XCTAssertTrue(draft.payload(comparedTo: draft, isSeries: true).isEmpty)
    }

    func testPayloadContainsOnlyChangedFieldsAndNullClears() throws {
        let c = try classification()
        let base = AdminClassificationDraft(c)
        var draft = base
        draft.audience = nil                       // clear → null
        draft.ageRating = "  "                     // blank → null
        draft.contentFormat = "LIMITED_SERIES"
        draft.genres = ["action", "horror-psychological"] // reorder counts
        draft.tags = ["betrayal"]                  // unchanged
        draft.productionCountries = ["ng", "gh"]   // upper-cased
        draft.seriesComplete = true
        draft.availableFrom = "2024-05-01T00:00:00Z" // same instant → unchanged
        draft.availableUntil = "2025-01-01T00:00:00Z"
        draft.releaseDate = nil

        let f = draft.payload(comparedTo: base, isSeries: true)
        XCTAssertEqual(f["audience"], .null)
        XCTAssertEqual(f["ageRating"], .null)
        XCTAssertEqual(f["contentFormat"], .string("LIMITED_SERIES"))
        XCTAssertEqual(f["genres"], .array([.string("action"), .string("horror-psychological")]))
        XCTAssertEqual(f["productionCountries"], .array([.string("NG"), .string("GH")]))
        XCTAssertEqual(f["seriesComplete"], .bool(true))
        XCTAssertEqual(f["availableUntil"], .string("2025-01-01T00:00:00Z"))
        XCTAssertEqual(f["releaseDate"], .null)
        XCTAssertNil(f["tags"])
        XCTAssertNil(f["availableFrom"])
        XCTAssertNil(f["collections"])
        XCTAssertNil(f["industries"])
        XCTAssertEqual(Set(f.keys), ["audience", "ageRating", "contentFormat", "genres", "productionCountries",
                                     "seriesComplete", "availableUntil", "releaseDate"])
    }

    func testSeriesCompleteNotSentForMovies() throws {
        let base = AdminClassificationDraft(try classification())
        var draft = base
        draft.seriesComplete = true
        XCTAssertNil(draft.payload(comparedTo: base, isSeries: false)["seriesComplete"])
    }

    func testManualIndustriesOnly() throws {
        let base = AdminClassificationDraft(try classification())
        XCTAssertEqual(base.manualIndustries, ["african-cinema"])
        var draft = base
        draft.manualIndustries = []
        XCTAssertEqual(draft.payload(comparedTo: base, isSeries: true)["industries"], .array([]))
    }

    func testValidation() throws {
        var draft = AdminClassificationDraft(try classification())
        XCTAssertNil(draft.validationError)
        draft.productionCountries = AdminClassificationDraft.parseCountries("ng, usa")
        XCTAssertEqual(draft.productionCountries, ["NG", "USA"])
        XCTAssertNotNil(draft.validationError)
        draft.productionCountries = ["NG"]
        draft.availableUntil = "2024-04-01T00:00:00Z"
        XCTAssertNotNil(draft.validationError)
    }

    // MARK: Networking

    private func makeAPI() -> AdminAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ClassificationStub.self]
        let session = URLSession(configuration: config)
        let base = URL(string: "https://classification.test/")!
        return AdminAPI(client: APIClient(baseURL: base, session: session), baseURL: base, urlSession: session)
    }

    func testGetAndPutClassification() async throws {
        let api = makeAPI()
        ClassificationStub.status = 200
        ClassificationStub.body = Self.taxonomyJSON
        let t = try await api.taxonomy()
        XCTAssertEqual(ClassificationStub.lastRequest?.url?.path, "/v1/admin/taxonomy")
        XCTAssertEqual(t.genres.count, 3)

        ClassificationStub.body = Self.classificationJSON
        _ = try await api.classification(titleId: "t1")
        XCTAssertEqual(ClassificationStub.lastRequest?.httpMethod, "GET")
        XCTAssertEqual(ClassificationStub.lastRequest?.url?.path, "/v1/admin/titles/t1/classification")

        let updated = try await api.updateClassification(titleId: "t1", fields: ["audience": .null,
                                                                                 "tags": .array([.string("village")])])
        XCTAssertEqual(ClassificationStub.lastRequest?.httpMethod, "PUT")
        XCTAssertEqual(ClassificationStub.lastRequest?.url?.path, "/v1/admin/titles/t1/classification")
        let sent = try JSONDecoder().decode([String: JSONValue].self, from: ClassificationStub.lastBody ?? Data())
        XCTAssertEqual(sent, ["audience": .null, "tags": .array([.string("village")])])
        XCTAssertEqual(updated.titleId, "t1")
    }

    func testServerErrorMessageIsSurfaced() async throws {
        let api = makeAPI()
        ClassificationStub.status = 400
        ClassificationStub.body = #"{"type":"about:blank","title":"BadRequest","status":400,"detail":"Unknown genre slugs: horror-zombie"}"#
        do {
            _ = try await api.updateClassification(titleId: "t1", fields: ["genres": .array([.string("horror-zombie")])])
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(AdminFormat.friendly(error), "Unknown genre slugs: horror-zombie")
        }

        ClassificationStub.body = #"{"title":"BadRequest","status":400,"detail":["genres must be an array","audience is invalid"]}"#
        do {
            _ = try await api.updateClassification(titleId: "t1", fields: [:])
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(AdminFormat.friendly(error), "genres must be an array\naudience is invalid")
        }
    }
}
