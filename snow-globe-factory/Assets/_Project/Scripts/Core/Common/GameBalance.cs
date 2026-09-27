namespace SnowGlobe.Core
{
    /// <summary>
    /// Initial tuning values. Everything designers are expected to tweak lives here
    /// or in the catalogs (archetypes, themes, upgrades) rather than inside systems.
    /// </summary>
    public static class GameBalance
    {
        // Economy (prototype starting balance from the design brief).
        public const int StartingCash = 150;
        public const int GlobeKitCost = 7;
        public const int SerumChargeCost = 2;
        public const int PackagingCost = 3;
        public const int DailyOperatingCost = 25;

        // Emergency supply order (anti-bankruptcy valve).
        public const int EmergencyUnits = 2;
        public const int EmergencyDebtPerUnit = 20;
        public const int MaxDebt = 120;
        public const float DebtRepaymentShare = 0.5f;

        // Starting stock so Day 1 teaches the loop without shopping first.
        public const int StartingCharacters = 3;
        public const int StartingKits = 3;
        public const int StartingSerum = 4;
        public const int StartingBoxes = 3;

        // Stillness Serum (fictional): a charge buys a preparation window.
        public const float BaseSerumWindowSeconds = 60f;
        public const float MaxSerumWindowSeconds = 150f;
        public const float SerumWarningSeconds = 15f;
        public const float RedoseWindowFraction = 0.5f;

        // Stasis seal.
        public const float BaseSealDefectChance = 0.15f;
        public const float GoodSealMin = 0.82f;
        public const float GoodSealMax = 0.98f;
        public const float DefectSealMin = 0.25f;
        public const float DefectSealMax = 0.6f;
        public const float DefectRevealThreshold = 0.7f;
        /// <summary>Base stasis-failure movements per minute before integrity/tendency scaling.</summary>
        public const float StasisMovementRatePerMinute = 3f;

        // Snow dispenser: forgiving target band (fraction of dome fill).
        public const float SnowTarget = 0.6f;
        public const float SnowPerfectTolerance = 0.08f;
        public const float SnowZeroScoreDistance = 0.4f;

        // Value.
        public const float CertifiedValueBonus = 0.1f;
        public const int BaseShelfCapacity = 6;

        // Day structure.
        public const float OpeningHourMinutes = 9 * 60;
        public const float ClosingHourMinutes = 17 * 60;
        public const float RealSecondsPerGameMinute = 1f; // 8 game hours = 8 real minutes
        public const float BaseCustomerIntervalSeconds = 40f;

        // Power.
        public const int BasePowerCapacity = 3;
    }
}
