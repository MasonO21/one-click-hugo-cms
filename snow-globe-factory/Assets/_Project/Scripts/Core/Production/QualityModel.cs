namespace SnowGlobe.Core
{
    public enum QualityTier
    {
        Flawed,
        Standard,
        Fine,
        Exquisite,
    }

    /// <summary>
    /// Quality reflects assembly accuracy, decoration, damage and packaging.
    /// Seal integrity is deliberately NOT part of price: it is a risk the player
    /// either accepts (skip inspection) or manages (inspect, certify, reject).
    /// </summary>
    public static class QualityModel
    {
        public const float PoseWeight = 0.3f;
        public const float DecorationWeight = 0.3f;
        public const float SnowWeight = 0.2f;
        public const float DomeWeight = 0.1f;
        public const float PackagingWeight = 0.1f;
        public const float DamagePenalty = 0.6f;

        public static float Compute(Product p)
        {
            float q = PoseWeight * p.PoseScore
                    + DecorationWeight * p.DecorationScore
                    + SnowWeight * p.SnowScore
                    + DomeWeight * p.DomeScore
                    + PackagingWeight * PackagingContribution(p);
            q -= DamagePenalty * p.Damage;
            return MathUtil.Clamp01(q);
        }

        /// <summary>Before packaging we assume an average fold so estimates don't jump later.</summary>
        static float PackagingContribution(Product p)
        {
            return p.Stage >= ProductStage.Packaged ? p.PackagingScore : 0.5f;
        }

        public static QualityTier Tier(float quality)
        {
            if (quality < 0.35f) return QualityTier.Flawed;
            if (quality < 0.65f) return QualityTier.Standard;
            if (quality < 0.85f) return QualityTier.Fine;
            return QualityTier.Exquisite;
        }

        /// <summary>Price a customer pays. Quality 0.5 on a Sleepy One Winter Village = $40.</summary>
        public static int EstimateValue(Product p)
        {
            var arch = ArchetypeCatalog.Get(p.Archetype);
            var theme = ThemeCatalog.Get(p.Theme);
            float q = Compute(p);
            float value = arch.BaseSaleValue * theme.ValueMultiplier * (0.5f + q);
            if (p.Certified) value *= 1f + GameBalance.CertifiedValueBonus;
            int rounded = (int)(value + 0.5f);
            return rounded < 1 ? 1 : rounded;
        }
    }

    public static class SnowScoring
    {
        /// <summary>1 inside the perfect band, falling linearly to 0 at SnowZeroScoreDistance.</summary>
        public static float Score(float amount, float target)
        {
            float d = amount > target ? amount - target : target - amount;
            if (d <= GameBalance.SnowPerfectTolerance) return 1f;
            float t = (d - GameBalance.SnowPerfectTolerance) / (GameBalance.SnowZeroScoreDistance - GameBalance.SnowPerfectTolerance);
            return MathUtil.Clamp01(1f - t);
        }
    }
}
