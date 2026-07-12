//
//  CheckoutFlow.swift
//  CinneTemple
//
//  Pay-once / watch-once checkout driven by POST /v1/purchases.
//
//  - status "paid" / "already_entitled"  → instant success (free titles).
//  - status "pending" + a `/payment/mock-checkout` authorizationUrl
//    → native branded confirm sheet (no web view), then verify.
//  - status "pending" + any other authorizationUrl (future Paystack)
//    → SFSafariViewController, then verify on return.
//

import Foundation
import Combine

/// Result of starting a purchase for a title (own ticket or gift).
enum CheckoutOutcome {
    /// Instantly entitled (free title or already owned) — the viewer can play now.
    case entitled
    /// Instantly completed gift — the recipient can watch right away.
    case giftSent
    /// Payment required — present `CheckoutSheetView` for this session.
    case checkout(CheckoutSession)
}

@MainActor
enum CheckoutFlow {

    /// Starts a server purchase for `title` (gift when `beneficiaryEmail` is set)
    /// and classifies the response into an instant grant or a checkout session.
    static func begin(
        title: CatalogueTitle,
        beneficiaryEmail: String? = nil,
        commerce: CommerceAPI,
        client: APIClient
    ) async throws -> CheckoutOutcome {
        let result = try await commerce.purchase(titleId: title.id, beneficiaryEmail: beneficiaryEmail)

        if result.isPaid {
            return beneficiaryEmail == nil ? .entitled : .giftSent
        }

        guard result.status == "pending",
              let raw = result.authorizationUrl,
              let url = URL(string: raw)
        else {
            throw APIError(status: 502, title: "Checkout",
                           detail: "The checkout could not be started. Please try again.")
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        func query(_ name: String) -> String? {
            components?.queryItems?.first(where: { $0.name == name })?.value
        }

        guard let reference = result.reference ?? query("reference"), !reference.isEmpty else {
            throw APIError(status: 502, title: "Checkout",
                           detail: "The checkout reference is missing. Please try again.")
        }

        let isMock = url.path.contains("/payment/mock-checkout")
        let queriedTitle = query("title")
        let session = CheckoutSession(
            titleId: title.id,
            titleName: (queriedTitle?.isEmpty == false ? queriedTitle! : title.title),
            amountMinor: query("amount").flatMap(Int.init) ?? result.amountMinor ?? title.price,
            currency: query("currency") ?? result.currency ?? title.displayCurrency,
            reference: reference,
            isGift: result.isGift ?? (beneficiaryEmail != nil),
            beneficiaryEmail: beneficiaryEmail,
            webURL: isMock ? nil : url,
            client: client
        )
        return .checkout(session)
    }
}

/// One in-flight checkout: drives the native mock confirm (or external web
/// checkout) through verification to a paid single-view ticket.
@MainActor
final class CheckoutSession: ObservableObject, Identifiable {

    enum Step: Equatable {
        case confirm            // native mock-checkout confirm sheet
        case web                // external checkout page (future Paystack)
        case verifying
        case success
        case failed(String)
    }

    nonisolated let id = UUID()
    let titleId: String
    let titleName: String
    let amountMinor: Int
    let currency: String
    let reference: String
    let isGift: Bool
    let beneficiaryEmail: String?
    /// Non-mock checkout page; nil for the native mock flow.
    let webURL: URL?

    @Published private(set) var step: Step

    private let client: APIClient

    init(
        titleId: String,
        titleName: String,
        amountMinor: Int,
        currency: String,
        reference: String,
        isGift: Bool,
        beneficiaryEmail: String?,
        webURL: URL?,
        client: APIClient
    ) {
        self.titleId = titleId
        self.titleName = titleName
        self.amountMinor = amountMinor
        self.currency = currency
        self.reference = reference
        self.isGift = isGift
        self.beneficiaryEmail = beneficiaryEmail
        self.webURL = webURL
        self.client = client
        self.step = webURL == nil ? .confirm : .web
    }

    var formattedAmount: String { CheckoutFormatting.amount(amountMinor, currency: currency) }
    var isPaid: Bool { step == .success }

    /// Confirm button on the native mock sheet.
    func confirm() async { await verify() }

    /// Called when the external (Safari) checkout is dismissed.
    func completeWebCheckout() async { await verify() }

    /// Back to the first step after a failure.
    func retry() { step = webURL == nil ? .confirm : .web }

    private func verify() async {
        step = .verifying
        do {
            for _ in 0..<6 {
                let result: VerifyResult = try await client.verifyPurchase(reference: reference)
                switch result.status {
                case "paid":
                    step = .success
                    return
                case "failed":
                    step = .failed("The payment didn't go through. You haven't been charged.")
                    return
                default:
                    try await Task.sleep(nanoseconds: 1_500_000_000)
                }
            }
            step = .failed("The payment is still pending. Check My Tickets in a moment.")
        } catch let apiError as APIError {
            step = .failed(apiError.detail)
        } catch {
            step = .failed("We couldn't confirm the payment. Check My Tickets in a moment.")
        }
    }
}

/// Naira-first amount formatting: minor units (kobo) ÷ 100, '₦' for NGN,
/// 'Free' when zero.
enum CheckoutFormatting {
    static func amount(_ minor: Int, currency: String) -> String {
        guard minor > 0 else { return "Free" }
        let major = Double(minor) / 100.0
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        if currency.uppercased() == "NGN" { formatter.currencySymbol = "₦" }
        let whole = minor % 100 == 0
        formatter.minimumFractionDigits = whole ? 0 : 2
        formatter.maximumFractionDigits = whole ? 0 : 2
        return formatter.string(from: NSNumber(value: major))
            ?? "\(currency) \(String(format: "%.2f", major))"
    }
}
