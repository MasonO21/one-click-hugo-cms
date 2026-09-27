using System;

namespace SnowGlobe.Core
{
    /// <summary>Saved progress on the shop's reputation (the endless-mode money sinks).</summary>
    [Serializable]
    public sealed class ReputationState
    {
        /// <summary>Boutique refits bought, 0..ReputationService.MaxRefitTier.</summary>
        public int RefitTier;
        /// <summary>How many times the player has sponsored the winter fair.</summary>
        public int FairSponsorships;
        /// <summary>Day of the last sponsorship (once per day).</summary>
        public int LastFairDay;
    }

    /// <summary>
    /// Late-game sinks for cash that has nowhere else to go once everything is bought (see BALANCE.md):
    /// <list type="bullet">
    /// <item>Boutique refits: five visible renovations, each raising every retail price. Costs double per tier,
    /// so the later tiers never pay for themselves; they're prestige.</item>
    /// <item>Sponsoring the winter fair: once a day, buys goodwill that lowers business exposure. Costs rise each time,
    /// so it's a pressure valve for a busy horror business, not a way to ignore it.</item>
    /// </list>
    /// </summary>
    public sealed class ReputationService
    {
        public const int MaxRefitTier = 5;
        public const int RefitUnlockDay = 20;
        public const int FirstRefitCost = 3000;
        public const float RefitPriceBonus = 0.06f;

        public const int FairUnlockDay = 20;
        public const int FairBaseCost = 1000;
        public const float FairExposureRelief = 20f;

        static readonly string[] RefitNames =
        {
            "Garlands and fairy lights",
            "Brass wall sconces",
            "Velvet carpet runner",
            "Crystal chandelier",
            "Gilded shopfront sign",
        };

        readonly GameState _state;

        public ReputationService(GameState state) { _state = state; }

        ReputationState R { get { return _state.Reputation; } }

        public int RefitTier { get { return R.RefitTier; } }

        /// <summary>Every retail price is multiplied by this.</summary>
        public float PriceMultiplier { get { return PriceMultiplierFor(_state); } }

        public static float PriceMultiplierFor(GameState s) { return 1f + RefitPriceBonus * s.Reputation.RefitTier; }

        /// <summary>Name of the refit bought at <paramref name="tier"/> (1-based).</summary>
        public static string RefitName(int tier) { return RefitNames[Math.Max(1, Math.Min(MaxRefitTier, tier)) - 1]; }

        /// <summary>Cost of the next refit: $3000, $6000, $12000, $24000, $48000.</summary>
        public int NextRefitCost { get { return FirstRefitCost << Math.Min(R.RefitTier, MaxRefitTier - 1); } }

        public bool RefitsMaxed { get { return R.RefitTier >= MaxRefitTier; } }

        public ActionResult BuyRefit()
        {
            if (RefitsMaxed) return ActionResult.Fail("The shop can't get any grander.");
            if (_state.Day.Day < RefitUnlockDay) return ActionResult.Fail("Refits are offered from day " + RefitUnlockDay + ".");
            if (_state.Day.Phase == DayPhase.Open) return ActionResult.Fail("The decorators only come while the shop is closed.");
            int cost = NextRefitCost;
            if (!_state.Wallet.TrySpend(cost)) return ActionResult.Fail("Need $" + cost + " for the next refit.");
            R.RefitTier++;
            _state.Day.Stats.Expenses += cost;
            return ActionResult.Ok(RefitName(R.RefitTier) + " installed. Prices +" + (int)(RefitPriceBonus * 100f + 0.5f) + "% (now +" + (int)((PriceMultiplier - 1f) * 100f + 0.5f) + "%).");
        }

        /// <summary>Cost of the next sponsorship: $1000, then $1000 more each time.</summary>
        public int NextFairCost { get { return FairBaseCost * (R.FairSponsorships + 1); } }

        public bool SponsoredToday { get { return R.LastFairDay == _state.Day.Day && R.FairSponsorships > 0; } }

        public ActionResult SponsorFair()
        {
            if (_state.Day.Day < FairUnlockDay) return ActionResult.Fail("The town fair committee writes to you from day " + FairUnlockDay + ".");
            if (SponsoredToday) return ActionResult.Fail("You've already sponsored something today.");
            int cost = NextFairCost;
            if (!_state.Wallet.TrySpend(cost)) return ActionResult.Fail("Need $" + cost + " to sponsor the fair.");
            float before = _state.Exposure.Value;
            _state.Exposure.Value = Math.Max(0f, before - FairExposureRelief);
            R.FairSponsorships++;
            R.LastFairDay = _state.Day.Day;
            _state.Day.Stats.Expenses += cost;
            return ActionResult.Ok("Your name is on every lantern at the winter fair. The town talks about you fondly (exposure " + (int)before + " → " + (int)_state.Exposure.Value + ").");
        }

        /// <summary>What a customer pays for this globe: its value, raised by the shop's refits.</summary>
        public static int RetailPrice(GameState s, Product p)
        {
            int value = QualityModel.EstimateValue(p);
            return Math.Max(1, (int)(value * PriceMultiplierFor(s) * Showcase.PriceMultiplier(p) + 0.5f));
        }
    }
}
