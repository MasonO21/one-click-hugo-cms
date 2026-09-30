import Foundation
import UIKit
import Capacitor
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

/// Apple's Declared Age Range for the web layer (src/platform.js `age`).
/// The game only asks whether the player is at least `gate` years old, and keeps only that answer.
/// DeclaredAgeRange is weak-linked (OTHER_LDFLAGS) so the app still launches on iOS 15–25, where both calls report "unavailable".
@objc(AgeRangePlugin)
public class AgeRangePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeRangePlugin"
    public let jsName = "AgeRange"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    /// { available, required }: `required` is true where local law makes an age check mandatory (for example Texas).
    @objc func status(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.2, *) {
            Task {
                let required = (try? await AgeRangeService.shared.isEligibleForAgeFeatures) ?? false
                call.resolve(["available": true, "required": required])
            }
            return
        }
        if #available(iOS 26.0, *) {
            call.resolve(["available": true, "required": false])
            return
        }
        #endif
        call.resolve(["available": false, "required": false])
    }

    /// Shows Apple's age-range sheet. Resolves { result: "sharing", lower?, upper? } | { result: "declined" | "unavailable" | "error" }.
    @objc func request(_ call: CAPPluginCall) {
        let gate = call.getInt("gate") ?? 18
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                guard let viewController = self.bridge?.viewController else {
                    call.resolve(["result": "unavailable"])
                    return
                }
                do {
                    let response = try await AgeRangeService.shared.requestAgeRange(ageGates: gate, nil, nil, in: viewController)
                    switch response {
                    case .declinedSharing:
                        call.resolve(["result": "declined"])
                    case .sharing(let range):
                        var out: [String: Any] = ["result": "sharing"]
                        if let lower = range.lowerBound { out["lower"] = lower }
                        if let upper = range.upperBound { out["upper"] = upper }
                        call.resolve(out)
                    @unknown default:
                        call.resolve(["result": "unavailable"])
                    }
                } catch {
                    call.resolve(["result": "error"])
                }
            }
            return
        }
        #endif
        call.resolve(["result": "unavailable"])
    }
}
