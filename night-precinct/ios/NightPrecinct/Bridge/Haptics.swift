import UIKit

/// Maps the bridge's haptic style names to UIKit feedback generators.
/// Generators are created on first use. On devices without a Taptic Engine (most iPads)
/// the calls do nothing, which is exactly the behavior the bridge wants.
@MainActor
final class Haptics {

    private lazy var light: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .light)
    private lazy var medium: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    private lazy var heavy: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .heavy)
    private lazy var notification: UINotificationFeedbackGenerator = UINotificationFeedbackGenerator()

    /// Plays the named haptic. Returns false when the style name is not recognized.
    func play(_ style: String) -> Bool {
        switch style {
        case "light":
            impact(light)
        case "medium":
            impact(medium)
        case "heavy":
            impact(heavy)
        case "success":
            notify(.success)
        case "warning":
            notify(.warning)
        case "error":
            notify(.error)
        default:
            return false
        }
        return true
    }

    private func impact(_ generator: UIImpactFeedbackGenerator) {
        generator.impactOccurred()
        // Keeps the engine warm so a quick follow-up tap has no latency.
        generator.prepare()
    }

    private func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notification.notificationOccurred(type)
        notification.prepare()
    }
}
