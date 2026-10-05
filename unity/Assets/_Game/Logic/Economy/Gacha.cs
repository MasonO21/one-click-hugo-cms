using System;
using System.Collections.Generic;

namespace AetherRift.Economy
{
    public enum Rarity { Coin, Rare, Epic, Legendary }

    public interface IRandom { double NextPercent(); } // returns [0,100)

    public sealed class SystemRandomSource : IRandom
    {
        private readonly Random _r;
        public SystemRandomSource(int? seed = null) { _r = seed.HasValue ? new Random(seed.Value) : new Random(); }
        public double NextPercent() => _r.NextDouble() * 100.0;
    }

    /// <summary>Published odds. The UI renders from this same table so shown odds can't drift from real odds.</summary>
    public sealed class OddsTable
    {
        public double Legendary = 2, Epic = 8, Rare = 30; // remainder = coin bundle (60%)
        public int EpicPity = 10, LegendaryPity = 50;
        public double CoinPercent => 100 - Legendary - Epic - Rare;
        public IEnumerable<(Rarity rarity, double percent)> Disclosure()
        {
            yield return (Rarity.Legendary, Legendary); yield return (Rarity.Epic, Epic);
            yield return (Rarity.Rare, Rare); yield return (Rarity.Coin, CoinPercent);
        }
    }

    public sealed class PityState { public int SinceEpic; public int SinceLegendary; }

    /// <summary>Run this on the server (Cloud Code). Never on the client.</summary>
    public static class Gacha
    {
        public static Rarity Roll(OddsTable odds, PityState pity, IRandom rng)
        {
            pity.SinceEpic++; pity.SinceLegendary++;
            double r = rng.NextPercent();
            Rarity result = r < odds.Legendary ? Rarity.Legendary
                          : r < odds.Legendary + odds.Epic ? Rarity.Epic
                          : r < odds.Legendary + odds.Epic + odds.Rare ? Rarity.Rare : Rarity.Coin;
            if (pity.SinceLegendary >= odds.LegendaryPity) result = Rarity.Legendary;
            else if (pity.SinceEpic >= odds.EpicPity && result < Rarity.Epic) result = Rarity.Epic;
            if (result >= Rarity.Epic) pity.SinceEpic = 0;
            if (result == Rarity.Legendary) pity.SinceLegendary = 0;
            return result;
        }
    }
}
