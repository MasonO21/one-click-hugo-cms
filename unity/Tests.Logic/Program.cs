using System;
using System.Linq;
using AetherRift.Economy; using AetherRift.Gameplay; using AetherRift.Meta;

// Dependency-free test runner so it works in any CI. Run: dotnet run --project unity/Tests.Logic
static class T
{
    static int fail, pass;
    public static void Check(bool ok, string name) { if (ok) pass++; else { fail++; Console.WriteLine("FAIL: " + name); } }
    public static int Done() { Console.WriteLine($"{pass} passed, {fail} failed"); return fail == 0 ? 0 : 1; }
}
static class P
{
    class Seq : IRandom { readonly double[] v; int i; public Seq(params double[] v){this.v=v;} public double NextPercent()=>v[i++%v.Length]; }

    static int Main()
    {
        var odds = new OddsTable();
        T.Check(Math.Abs(odds.Disclosure().Sum(x => x.percent) - 100) < 1e-9, "odds sum to 100");

        // base distribution with pity disabled must match the published odds
        var noPity = new OddsTable { EpicPity = int.MaxValue, LegendaryPity = int.MaxValue };
        var rng = new SystemRandomSource(42); var pity = new PityState(); int n = 200000, leg = 0, epic = 0;
        for (int i = 0; i < n; i++) { var r = Gacha.Roll(noPity, pity, rng); if (r == Rarity.Legendary) leg++; if (r == Rarity.Epic) epic++; }
        T.Check(leg * 100.0 / n is > 1.9 and < 2.1, $"base legendary rate {leg * 100.0 / n:F2}%");
        T.Check(epic * 100.0 / n is > 7.8 and < 8.2, $"base epic rate {epic * 100.0 / n:F2}%");

        // effective rates with pity are higher; log them so the store disclosure can state them honestly
        var rng2 = new SystemRandomSource(7); var pity1 = new PityState(); int eLeg = 0, eEp = 0;
        for (int i = 0; i < n; i++) { var r = Gacha.Roll(odds, pity1, rng2); if (r == Rarity.Legendary) eLeg++; if (r == Rarity.Epic) eEp++; }
        Console.WriteLine($"effective with pity: legendary {eLeg * 100.0 / n:F2}%, epic {eEp * 100.0 / n:F2}%");
        T.Check(eLeg * 100.0 / n >= 2.0 && eEp * 100.0 / n >= 8.0, "pity never lowers rates");

        // pity guarantees: worst-case rolls (99.9 = coin) still hit epic on 10th and legendary on 50th
        var p2 = new PityState(); var worst = new Seq(99.9); Rarity last = Rarity.Coin; int firstEpic = 0;
        for (int i = 1; i <= 50; i++) { last = Gacha.Roll(odds, p2, worst); if (last == Rarity.Epic && firstEpic == 0) firstEpic = i; }
        T.Check(firstEpic == 10, "epic pity at 10th draw");
        T.Check(last == Rarity.Legendary, "legendary pity at 50th draw");
        T.Check(p2.SinceLegendary == 0 && p2.SinceEpic == 0, "pity resets after legendary");

        // wallet
        var w = new Wallet(100, 50);
        T.Check(!w.TrySpendGems(51) && w.Gems == 50, "cannot overspend gems");
        T.Check(w.TrySpendCoins(100) && w.Coins == 0, "spend exact coins");
        try { w.AddGems(-1); T.Check(false, "negative add rejected"); } catch (ArgumentOutOfRangeException) { T.Check(true, "negative add rejected"); }

        // rank
        T.Check(Rank.Apply(0, false) == 0 && Rank.Apply(10, false) == 0 && Rank.Apply(15, false) == 0 && Rank.Apply(50, false) == 35, "loss floor at 0");
        T.Check(Rank.Apply(10, true) == 35, "win +25");
        T.Check(Rank.NameOf(99) == "Bronze" && Rank.NameOf(100) == "Silver" && Rank.NameOf(5000) == "Grandmaster", "rank names");

        // ad cap
        var cap = new AdCap(); int ok = 0; for (int i = 0; i < 10; i++) if (cap.TryConsume("d1")) ok++;
        T.Check(ok == 6 && cap.Left("d1") == 0, "ad cap = 6/day");
        T.Check(cap.Left("d2") == 6 && cap.TryConsume("d2"), "ad cap resets next day");

        // pass
        var pass = new PassProgress(); pass.AddXp(250);
        T.Check(pass.Level == 2, "pass level from xp");
        T.Check(pass.TryClaim(PassTrack.Free, 1, out var rw) && rw.Coins > 0, "claim free lv1");
        T.Check(!pass.TryClaim(PassTrack.Free, 1, out _), "no double claim");
        T.Check(!pass.TryClaim(PassTrack.Free, 3, out _), "cannot claim above level");
        T.Check(!pass.TryClaim(PassTrack.Premium, 1, out _), "premium locked without purchase");
        pass.Premium = true; T.Check(pass.TryClaim(PassTrack.Premium, 1, out _), "premium claim after purchase");
        pass.AddXp(99999); T.Check(pass.Level == PassProgress.Levels, "pass level capped");
        T.Check(PassProgress.RewardFor(PassTrack.Premium, 10).SkinId == "royal" && PassProgress.RewardFor(PassTrack.Premium, 20).SkinId == "solar", "premium skin rewards");

        // vitals
        var v = new Vitals(1000); v.AddShield(200); float dealt = v.TakeDamage(300);
        T.Check(dealt == 100 && v.Hp == 900 && v.Shield == 0, "shield absorbs first");
        v.Heal(5000); T.Check(v.Hp == 1000, "heal capped");
        v.Stun(1f); v.Tick(.4f); T.Check(!v.CanAct && Math.Abs(v.StunTime - .6f) < 1e-5, "stun ticks");
        v.TakeDamage(5000); T.Check(v.Dead && v.TakeDamage(10) == 0, "dead takes no damage");
        v.Revive(); T.Check(v.Hp == 1000 && v.CanAct, "revive");

        // progression
        int lvl = 1; float xp = 0; int up = Progression.AddXp(ref lvl, ref xp, 350);
        T.Check(up == 2 && lvl == 3 && Math.Abs(xp - 50) < 1e-4, "multi level-up (100+200)");
        lvl = 10; xp = 0; T.Check(Progression.AddXp(ref lvl, ref xp, 9999) == 0, "level cap");

        // cooldown
        var cd = new Cooldown(); T.Check(cd.TryUse(3) && !cd.TryUse(3), "cooldown blocks reuse"); cd.Tick(3); T.Check(cd.Ready, "cooldown ready");

        // catalog sanity
        T.Check(HeroCatalog.All.Count == 8 && HeroCatalog.All.Select(h => h.Id).Distinct().Count() == 8, "8 unique heroes");
        T.Check(HeroCatalog.All.All(h => h.Skills.Length == 3 && h.Skills.All(s => s.Cooldown > 0)), "3 skills each, cooldowns set");

        return T.Done();
    }
}
