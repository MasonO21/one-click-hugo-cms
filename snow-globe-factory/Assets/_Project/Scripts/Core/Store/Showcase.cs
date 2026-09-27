namespace SnowGlobe.Core
{
    /// <summary>
    /// Shaking a globe: the snow swirls, nearby shoppers are charmed, and for a minute the globe sells for more and draws
    /// buyers. But a weak seal can't hold its figure still through a shake, and customers who see it move will notice.
    /// Inspected globes (defects known) tell the player which ones are safe to show off.
    /// </summary>
    public static class Showcase
    {
        public const float Seconds = 60f;
        public const float PriceBonus = 0.1f;

        public static bool CanShake(Product p)
        {
            return p != null && p.IsSealedGlobe && p.Stage != ProductStage.Packaged;
        }

        /// <summary>
        /// Chance the figure visibly moves when shaken: none for a sound seal, and at least even odds (rising as the seal
        /// weakens) below the defect threshold.
        /// </summary>
        public static float TwitchChance(Product p)
        {
            float integrity = p.EffectiveIntegrity;
            if (integrity >= GameBalance.DefectRevealThreshold) return 0f;
            return MathUtil.Clamp(0.5f + (GameBalance.DefectRevealThreshold - integrity) * 2f, 0.5f, 1f);
        }

        public static ActionResult Shake(GameState s, Product p, out bool twitched)
        {
            twitched = false;
            if (!CanShake(p)) return ActionResult.Fail("Only sealed globes can be shaken.");
            p.ShowcaseRemaining = Seconds;
            twitched = s.Rng.Chance(TwitchChance(p));
            return twitched
                ? ActionResult.Fail("The snow swirls... and the figure inside moves with it.")
                : ActionResult.Ok("The snow swirls beautifully. Shoppers love a showcased globe (+" + (int)(PriceBonus * 100f + 0.5f) + "% for a minute).");
        }

        public static float PriceMultiplier(Product p)
        {
            return p.ShowcaseRemaining > 0f ? 1f + PriceBonus : 1f;
        }
    }
}
