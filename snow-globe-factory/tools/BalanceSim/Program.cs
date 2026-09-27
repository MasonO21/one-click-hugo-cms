using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using SnowGlobe.Core;

namespace SnowGlobe.BalanceSim
{
    /// <summary>
    /// Plays the real core rules for N days with a scripted, reasonably competent player:
    /// buys upgrades/themes in a sensible order, restocks, works the line within an 8-minute
    /// open day (plus a short pre-opening session), serves walk-ins and fills one special order
    /// a day. Timing comes from the design doc; money, quality, defects, orders and upgrades come
    /// from the actual services. Usage: dotnet run [days] [seed] [markdownOutPath]
    /// </summary>
    public static class Program
    {
        // Player time model (seconds of real time per action).
        const float OpenSeconds = (GameBalance.ClosingHourMinutes - GameBalance.OpeningHourMinutes) * GameBalance.RealSecondsPerGameMinute;
        const float PreOpeningSeconds = 120f;
        const float ServeSeconds = 8f;
        const float Skill = 0.65f;

        static readonly UpgradeId[] UpgradeOrder =
        {
            UpgradeId.PrepCradle, UpgradeId.BetterInjector, UpgradeId.AssemblyJig, UpgradeId.ImprovedSealer,
            UpgradeId.ShortConveyor, UpgradeId.PremiumDisplayCase, UpgradeId.PackagingMachine, UpgradeId.AutoPrepStation,
            // Secrecy upgrades have no modelled payoff here (no suspicion model), so they come last.
            UpgradeId.BasementSoundproofing, UpgradeId.SecurityCameras,
        };

        public static int Main(string[] args)
        {
            int days = args.Length > 0 ? int.Parse(args[0]) : 20;
            uint seed = args.Length > 1 ? uint.Parse(args[1]) : 2024;
            string outPath = args.Length > 2 ? args[2] : null;
            var report = Run(days, seed);
            Console.WriteLine(report);
            if (outPath != null) System.IO.File.WriteAllText(outPath, report);
            return 0;
        }

        static float SecondsPerGlobe(GameState s)
        {
            float t = 75f;                                                         // fully manual line (design target 60-90 s)
            if (s.OwnedUpgrades.Contains(UpgradeId.AssemblyJig)) t -= 12f;
            if (s.OwnedUpgrades.Contains(UpgradeId.AutoPrepStation)) t -= 14f;
            if (s.OwnedUpgrades.Contains(UpgradeId.ShortConveyor)) t -= 7f;
            if (s.OwnedUpgrades.Contains(UpgradeId.PackagingMachine)) t -= 10f;
            return t;
        }

        public static string Run(int days, uint seed)
        {
            var s = GameSession.NewGame(seed);
            var st = s.State;
            var rng = new DeterministicRandom(seed * 31 + 7);
            var backstock = new List<Product>();
            var sb = new StringBuilder();
            sb.AppendLine("| Day | Cash (end) | Made | Sold | Orders | Revenue | Spent | Theme | Bought today |");
            sb.AppendLine("|---:|---:|---:|---:|---:|---:|---:|---|---|");
            var milestones = new List<string>();

            for (int day = 1; day <= days; day++)
            {
                if (day > 1)
                {
                    s.Days.StartNextDay();
                    s.Orders.OnNewDay();
                }
                var bought = new List<string>();

                // --- Morning purchases. Keep enough cash to restock a full day; then the next theme
                // (the biggest earner) competes with the next upgrade, one purchase per morning.
                int expectedSalesToday = (int)(OpenSeconds / GameBalance.BaseCustomerIntervalSeconds * 1.2f * DayProgression.FootTrafficMultiplier(day) * (DayProgression.MaxCustomers(day) >= 2 ? 1.4f : 1f));
                int reserve = Math.Min(25 * (expectedSalesToday + 3) + 25, 60 + 40 * day);
                var nextTheme = ThemeCatalog.All.FirstOrDefault(th => !s.Themes.IsUnlocked(th.Id) && th.UnlockDay <= day
                    && (th.Id != ThemeId.CelestialObservatory || s.Upgrades.Owns(UpgradeId.ImprovedSealer)));
                var nextUpgrade = UpgradeOrder.Select(UpgradeCatalog.Get).FirstOrDefault(u => !s.Upgrades.Owns(u.Id) && u.UnlockDay <= day);
                bool themeFirst = nextTheme != null && (nextUpgrade == null || nextTheme.UnlockCost <= nextUpgrade.Cost * 2 || s.Upgrades.Owns(UpgradeId.ShortConveyor));
                if (themeFirst && st.Wallet.Cash >= nextTheme.UnlockCost + reserve && s.Themes.Unlock(nextTheme.Id).Success)
                {
                    bought.Add(nextTheme.DisplayName);
                    milestones.Add("Day " + day + ": " + nextTheme.DisplayName + " theme");
                }
                else if (nextUpgrade != null && st.Wallet.Cash >= nextUpgrade.Cost + reserve && s.Upgrades.Purchase(nextUpgrade.Id).Success)
                {
                    bought.Add(nextUpgrade.Name);
                    milestones.Add("Day " + day + ": " + nextUpgrade.Name);
                }
                var best = ThemeCatalog.All.Where(t => s.Themes.IsUnlocked(t.Id)).OrderByDescending(t => t.ValueMultiplier).First();
                s.Themes.Select(best.Id);

                // --- Plan today's output and restock exactly that much.
                float perGlobe = SecondsPerGlobe(st);
                int expectedSales = expectedSalesToday;
                float serveTime = expectedSales * ServeSeconds;
                int capacity = (int)((PreOpeningSeconds + OpenSeconds - serveTime) / perGlobe);
                int toMake = Math.Max(0, Math.Min(capacity, expectedSales + 3 - backstock.Count));
                int unitCost = GameBalance.GlobeKitCost + GameBalance.SerumChargeCost + GameBalance.PackagingCost + ThemeCatalog.Get(st.ActiveTheme).ExtraKitCost + 8;
                toMake = Math.Min(toMake, Math.Max(0, st.Wallet.Cash / Math.Max(1, unitCost)));
                int haveChars = st.Products.Count(p => p.Stage == ProductStage.Unprepared);
                for (int i = haveChars; i < toMake; i++)
                {
                    var arch = day >= 6 && i % 3 == 0 ? ArchetypeId.Performer : ArchetypeId.SleepyOne;
                    s.Supply.OrderCharacter(arch);
                }
                s.Supply.Tick(SupplyService.CharacterDeliverySeconds + 1f);
                TopUp(s, SupplyItem.GlobeKit, toMake - st.Inventory.GlobeKits);
                TopUp(s, SupplyItem.SerumCharge, toMake - st.Inventory.SerumCharges);
                TopUp(s, SupplyItem.PackagingBox, toMake - st.Inventory.PackagingBoxes);
                if (s.Supply.CanRequestEmergencyOrder()) { s.Supply.RequestEmergencyOrder(); s.Supply.Tick(1f); bought.Add("EMERGENCY ORDER"); }

                // --- Special order: build the pinned one first (day 4+).
                int ordersFilled = 0;
                var order = s.Orders.Open.FirstOrDefault(o => s.Themes.IsUnlocked(o.Theme) && (!o.SpecificArchetype || o.Archetype == ArchetypeId.SleepyOne) && o.MinTier <= QualityTier.Fine);
                if (order != null) s.Orders.Pin(order.Id);

                // --- Work the line.
                int made = 0;
                foreach (var p in st.Products.Where(p => p.Stage == ProductStage.Unprepared).Take(toMake).ToList())
                {
                    var globe = Make(s, p, rng);
                    if (globe == null) continue;
                    made++;
                    string reason;
                    var pinned = s.Orders.PinnedOrder;
                    if (pinned != null && OrderService.Matches(pinned, globe, out reason))
                    {
                        ActionResult r;
                        if (s.Orders.Fulfil(pinned, globe, out r) > 0) { ordersFilled++; continue; }
                    }
                    backstock.Add(globe);
                    s.Orders.Unpin();
                }

                s.Days.OpenStore();

                // --- Walk-ins: arrival rate from store appeal and exposure, one per visit.
                int sold = 0;
                float t = 0f;
                int customerId = 1;
                while (true)
                {
                    Restock(s, backstock);
                    float rate = Math.Max(0.2f, st.Exposure.ArrivalRateMultiplier) * s.Store.AppealMultiplier() * DayProgression.FootTrafficMultiplier(day);
                    float concurrency = DayProgression.MaxCustomers(day) >= 2 ? 1.6f : 1f;
                    t += GameBalance.BaseCustomerIntervalSeconds / (rate * concurrency) * rng.Range(0.6f, 1.4f);
                    if (t > OpenSeconds) break;
                    var shelf = st.Products.Where(p => p.Stage == ProductStage.Displayed).OrderByDescending(QualityModel.EstimateValue).FirstOrDefault();
                    if (shelf == null || !rng.Chance(0.85f)) { st.Day.Stats.CustomersLost++; continue; }
                    // Weak, uninspected seals on the shelf are occasionally noticed.
                    foreach (var p in st.Products.Where(p => p.Stage == ProductStage.Displayed && !p.Certified && p.SealIntegrity < GameBalance.DefectRevealThreshold))
                        if (rng.Chance(0.15f)) st.Exposure.OnCustomerLeft(SuspicionStage.Curious, false);
                    s.Store.Reserve(shelf, customerId);
                    ActionResult sale;
                    if (s.Store.CompleteSale(shelf, customerId++, out sale) > 0) sold++;
                }

                var summary = s.Days.CloseStore();
                int spent = summary.Expenses + summary.OperatingCost;
                sb.AppendLine("| " + day + " | $" + st.Wallet.Cash + (st.Wallet.Debt > 0 ? " (owes $" + st.Wallet.Debt + ")" : "") + " | " + made + " | " + sold + " | " + ordersFilled +
                              " | $" + summary.Revenue + " | $" + spent + " | " + ThemeCatalog.Get(st.ActiveTheme).DisplayName + " | " + string.Join(", ", bought) + " |");
            }

            sb.AppendLine();
            sb.AppendLine("Milestones: " + (milestones.Count == 0 ? "none" : string.Join(" · ", milestones)));
            sb.AppendLine();
            sb.AppendLine("Exposure at the end: " + (int)st.Exposure.Value + "/100. Lifetime globes sold: " + st.LifetimeGlobesSold + ".");
            return sb.ToString();
        }

        static void TopUp(GameSession s, SupplyItem item, int n)
        {
            if (n > 0) s.Supply.Buy(item, n);
        }

        /// <summary>Runs one character through the real production services at the player's skill level.</summary>
        static Product Make(GameSession s, Product p, DeterministicRandom rng)
        {
            float jitter() => MathUtil.Clamp01(Skill + rng.Range(-0.2f, 0.2f));
            p.Location = ProductLocation.At(StationId.PrepCradle);
            if (!s.Production.Inject(p, jitter()).Success) { p.Location = ProductLocation.Holding(0); return null; }
            p.Location = ProductLocation.At(StationId.Assembly);
            var card = AssemblyCard.For(s.State, p);
            bool hitPose = rng.Chance(0.8f);
            if (!s.Production.Mount(p, hitPose ? card.Pose : (card.Pose + 1) % 4, jitter()).Success) return Abandon(s, p);
            p.DecorationCode = rng.Chance(0.75f) ? card.SceneryCode : card.SceneryCode ^ 1;
            s.Production.Decorate(p, jitter(), ThemeCatalog.Get(p.Theme).SnowTarget + rng.Range(-0.12f, 0.12f));
            p.Location = ProductLocation.At(StationId.Sealer);
            s.Production.FitDome(p, jitter());
            if (!s.Production.Seal(p, true).Success) return Abandon(s, p);
            if (rng.Chance(0.5f))
            {
                p.Location = ProductLocation.At(StationId.Inspection);
                s.Production.Inspect(p);
                if (p.DefectRevealed) { s.Production.RejectToHolding(p, 0); return null; }
            }
            p.Location = ProductLocation.At(StationId.Packaging);
            float fold = s.State.OwnedUpgrades.Contains(UpgradeId.PackagingMachine) ? AutomationService.MachinePackagingScore : jitter();
            if (!s.Production.Package(p, fold).Success) return Abandon(s, p);
            p.Location = ProductLocation.At(StationId.Counter);
            return p;
        }

        static Product Abandon(GameSession s, Product p)
        {
            // Out of something mid-line: the serum would wear off; treat the kit as ruined and the character as back in holding.
            p.ResetAssembly();
            p.Stage = ProductStage.Unprepared;
            p.Location = ProductLocation.Holding(0);
            return null;
        }

        static void Restock(GameSession s, List<Product> backstock)
        {
            backstock.RemoveAll(p => p.Stage != ProductStage.Packaged);
            while (backstock.Count > 0)
            {
                int slot = s.State.Store.FirstEmptySlot();
                if (slot < 0 || slot >= s.State.ShelfCapacity) return;
                var p = backstock[0];
                backstock.RemoveAt(0);
                s.Store.Display(p, slot);
            }
        }
    }
}
