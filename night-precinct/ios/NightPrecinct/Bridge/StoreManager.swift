import Foundation
import StoreKit

/// StoreKit 2 wrapper. Everything that leaves this actor is a plain dictionary (see
/// docs/NATIVE_BRIDGE.md); Product and Transaction values never reach the web view layer.
///
/// Transactions are NOT finished here on their own. A verified transaction is parked in
/// `pending` until JavaScript has granted the goods and sends `finish`. The single exception
/// is an unverified consumable, which is finished immediately so it cannot clog the queue.
actor StoreManager {

    /// Products fetched so far, by full product ID.
    private var productCache: [String: Product] = [:]

    /// Verified transactions that were delivered to JavaScript but not yet finished,
    /// keyed by String(transaction.id).
    private var pending: [String: Transaction] = [:]

    private var updatesTask: Task<Void, Never>?

    // MARK: - Products

    /// Fetches product details. IDs the App Store does not know come back in `missing`.
    func loadProducts(ids: [String]) async -> [String: Any] {
        do {
            let fetched: [Product] = try await Product.products(for: ids)
            var found: [String: Product] = [:]
            for product in fetched {
                found[product.id] = product
                productCache[product.id] = product
            }
            var list: [[String: Any]] = []
            var missing: [String] = []
            for id in ids {
                if let product = found[id] {
                    list.append(StoreManager.productInfo(product))
                } else {
                    missing.append(id)
                }
            }
            return BridgeReply.ok(["products": list, "missing": missing])
        } catch {
            return BridgeReply.failure(error: error)
        }
    }

    // MARK: - Purchasing

    /// Starts a purchase. On success the transaction is stored in `pending` and returned;
    /// JavaScript grants the goods and then sends `finish`.
    func purchase(id: String) async -> [String: Any] {
        do {
            guard let product = try await resolveProduct(id: id) else {
                return BridgeReply.failure("unknown product")
            }
            let result: Product.PurchaseResult = try await product.purchase()
            switch result {
            case .success(let verification):
                guard let transaction = await verifiedOnly(verification) else {
                    return BridgeReply.failure("purchase could not be verified")
                }
                pending[String(transaction.id)] = transaction
                return BridgeReply.ok([
                    "status": "success",
                    "tx": StoreManager.transactionInfo(transaction)
                ])
            case .userCancelled:
                return BridgeReply.ok(["status": "cancelled"])
            case .pending:
                // Ask to Buy or a payment that still needs approval. The result arrives
                // later through Transaction.updates.
                return BridgeReply.ok(["status": "pending"])
            @unknown default:
                return BridgeReply.failure("unexpected purchase result")
            }
        } catch {
            if StoreManager.isUserCancelled(error) {
                return BridgeReply.ok(["status": "cancelled"])
            }
            return BridgeReply.failure(error: error)
        }
    }

    /// Finishes a transaction that JavaScript has finished granting.
    func finish(txId: String) async -> [String: Any] {
        if let transaction = pending[txId] {
            await transaction.finish()
            pending[txId] = nil
            return BridgeReply.ok()
        }
        // Not in memory: for example JavaScript remembered a grant across a relaunch and asks
        // before Transaction.updates has redelivered it. Look in StoreKit's unfinished queue.
        if let transaction = await findUnfinished(txId: txId) {
            await transaction.finish()
            return BridgeReply.ok()
        }
        return BridgeReply.failure("unknown transaction")
    }

    // MARK: - Entitlements

    /// Verified, unrevoked, unexpired entitlements: non-consumables and active subscriptions.
    /// These are not stored in `pending`, because there is nothing to finish for them.
    func currentEntitlements() async -> [String: Any] {
        var list: [[String: Any]] = []
        let now: Date = Date()
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.revocationDate != nil { continue }
            if let expiration = transaction.expirationDate, expiration <= now { continue }
            list.append(StoreManager.transactionInfo(transaction))
        }
        return BridgeReply.ok(["entitlements": list])
    }

    /// Verified transactions StoreKit still considers unfinished. Each one is stored in
    /// `pending` so a later `finish` can find it.
    func unfinished() async -> [String: Any] {
        var list: [[String: Any]] = []
        for await result in Transaction.unfinished {
            guard let transaction = await verifiedOnly(result) else { continue }
            pending[String(transaction.id)] = transaction
            list.append(StoreManager.transactionInfo(transaction))
        }
        return BridgeReply.ok(["transactions": list])
    }

    /// Asks the App Store to sync purchases (may show an Apple ID prompt), then reports the
    /// entitlements. A user-cancelled sync falls back to whatever StoreKit has cached.
    func restore() async -> [String: Any] {
        do {
            try await AppStore.sync()
        } catch {
            if !StoreManager.isUserCancelled(error) {
                return BridgeReply.failure(error: error)
            }
        }
        return await currentEntitlements()
    }

    // MARK: - Storefront

    /// The App Store country of the signed-in account as an ISO 3166-1 alpha-3 code (for example "BEL").
    /// The page uses it for country rules; it never leaves the device.
    func storefront() async -> [String: Any] {
        if let storefront = await Storefront.current {
            return BridgeReply.ok(["countryCode": storefront.countryCode])
        }
        return BridgeReply.failure("storefront unavailable")
    }

    // MARK: - Transaction.updates

    /// Starts (once) a long-lived task that receives transactions arriving outside of a
    /// purchase call: Ask to Buy approvals, purchases made on another device, unfinished
    /// transactions from a previous launch, renewals and refunds.
    func startListening(onTransaction: @escaping @Sendable ([String: Any]) -> Void) {
        if updatesTask != nil { return }
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                await self.receive(result, onTransaction: onTransaction)
            }
        }
    }

    private func receive(
        _ result: VerificationResult<Transaction>,
        onTransaction: @Sendable ([String: Any]) -> Void
    ) async {
        guard let transaction = await verifiedOnly(result) else { return }
        pending[String(transaction.id)] = transaction
        onTransaction(StoreManager.transactionInfo(transaction))
    }

    // MARK: - Helpers

    /// Returns the transaction only if StoreKit verified it. An unverified consumable is
    /// finished on the spot (never granted); other unverified transactions are ignored.
    private func verifiedOnly(_ result: VerificationResult<Transaction>) async -> Transaction? {
        if case .verified(let transaction) = result {
            return transaction
        }
        if case .unverified(let transaction, _) = result, transaction.productType == .consumable {
            await transaction.finish()
        }
        return nil
    }

    private func resolveProduct(id: String) async throws -> Product? {
        if let cached = productCache[id] { return cached }
        let fetched: [Product] = try await Product.products(for: [id])
        guard let product = fetched.first(where: { $0.id == id }) else { return nil }
        productCache[id] = product
        return product
    }

    private func findUnfinished(txId: String) async -> Transaction? {
        for await result in Transaction.unfinished {
            if case .verified(let transaction) = result, String(transaction.id) == txId {
                return transaction
            }
        }
        return nil
    }

    private static func isUserCancelled(_ error: Error) -> Bool {
        if let storeError = error as? StoreKitError, case .userCancelled = storeError {
            return true
        }
        return false
    }

    // MARK: - Serialization (dictionaries are property-list safe)

    private static func productInfo(_ product: Product) -> [String: Any] {
        var info: [String: Any] = [
            "id": product.id,
            "displayName": product.displayName,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).stringValue,
            "currency": product.priceFormatStyle.currencyCode,
            "type": typeName(product.type)
        ]
        if let period = product.subscription?.subscriptionPeriod {
            info["period"] = isoDuration(period)
        } else {
            info["period"] = NSNull()
        }
        return info
    }

    private static func transactionInfo(_ transaction: Transaction) -> [String: Any] {
        var info: [String: Any] = [
            "id": String(transaction.id),
            "originalId": String(transaction.originalID),
            "productId": transaction.productID,
            "type": typeName(transaction.productType),
            "purchaseDate": milliseconds(transaction.purchaseDate),
            "revoked": transaction.revocationDate != nil
        ]
        if let expiration = transaction.expirationDate {
            info["expirationDate"] = milliseconds(expiration)
        } else {
            info["expirationDate"] = NSNull()
        }
        return info
    }

    /// The bridge knows three types. The catalog contains no non-renewing subscriptions, so
    /// the fourth StoreKit type is reported under its own name and the page will reject it.
    private static func typeName(_ type: Product.ProductType) -> String {
        if type == .consumable { return "consumable" }
        if type == .nonConsumable { return "nonConsumable" }
        if type == .autoRenewable { return "autoRenewable" }
        return "nonRenewable"
    }

    /// ISO-8601 duration for a subscription period: "P1W", "P1M", "P1Y", "P3D".
    private static func isoDuration(_ period: Product.SubscriptionPeriod) -> String {
        let count: Int = period.value
        switch period.unit {
        case .day:
            return "P\(count)D"
        case .week:
            return "P\(count)W"
        case .month:
            return "P\(count)M"
        case .year:
            return "P\(count)Y"
        @unknown default:
            return "P\(count)D"
        }
    }

    private static func milliseconds(_ date: Date) -> Int64 {
        return Int64((date.timeIntervalSince1970 * 1000.0).rounded())
    }
}
