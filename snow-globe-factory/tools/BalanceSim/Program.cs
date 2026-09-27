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
        const int MaxPurchasesPerMorning = 3;

        sealed class PlanItem
        {
            public string Name;
            public int Cost;
            public Func<GameSession, bool> Owned;
            public Func<GameSession, int, bool> Available;
            public Func<GameSession, ActionResult> Buy;
        }

        static PlanItem Upgrade(UpgradeId id)
        {
            var d = UpgradeCatalog.Get(id);
            return new PlanItem { Name = d.Name, Cost = d.Cost, Owned = s => s.Upgrades.Owns(id), Available = (s, day) => d.UnlockDay <= day, Buy = s => s.Upgrades.Purchase(id) };
        }

        static PlanItem Theme(ThemeId id)
        {
            var d = ThemeCatalog.Get(id);
            return new PlanItem
            {
                Name = d.DisplayName + " theme", Cost = d.UnlockCost, Owned = s => s.Themes.IsUnlocked(id), Buy = s => s.Themes.Unlock(id),
                Available = (s, day) => d.UnlockDay <= day && (id != ThemeId.CelestialObservatory || s.Upgrades.Owns(UpgradeId.ImprovedSealer)),
            };
        }

        /// <summary>
        /// A sensible player's shopping list: handling fixes first, then themes and automation interleaved by payback.
        /// Secrecy and wiring come last because this sim models no suspicion, power cuts or wear.
        /// </summary>
        static readonly PlanItem[] ShoppingPlan =
        {
            Upgrade(UpgradeId.PrepCradle), Upgrade(UpgradeId.BetterInjector), Upgrade(UpgradeId.AssemblyJig),
            Theme(ThemeId.WoodlandCabin), Upgrade(UpgradeId.ImprovedSealer), Upgrade(UpgradeId.ShortConveyor),
            Theme(ThemeId.MedievalCastle), Upgrade(UpgradeId.PackagingMachine), Upgrade(UpgradeId.AutoPrepStation),
            Upgrade(UpgradeId.PremiumDisplayCase), Theme(ThemeId.HauntedManor), Upgrade(UpgradeId.SealingPress),
            Theme(ThemeId.DeepSeaRuins), Upgrade(UpgradeId.WindowDisplay), Theme(ThemeId.CelestialObservatory),
            Upgrade(UpgradeId.RewiredFuseBox), Upgrade(UpgradeId.BasementSoundproofing), Upgrade(UpgradeId.SecurityCameras),
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
            if (s.OwnedUpgrades.Contains(UpgradeId.SealingPress)) t -= 10f;
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

                // --- Morning purchases. Keep enough cash to restock a full day. H.'s requests come first
                // (they're the story, and the rewards pay back); then the next theme (the biggest earner)
                // competes with the next upgrade. Up to three purchases a morning.
                int expectedSalesToday = (int)(OpenSeconds / GameBalance.BaseCustomerIntervalSeconds * 1.2f * DayProgression.FootTrafficMultiplier(day) * st.Modifiers.FootTrafficMultiplier * (DayProgression.MaxCustomers(day) >= 2 ? 1.4f : 1f));
                int reserve = Math.Min(25 * (expectedSalesToday + 3) + 25, 60 + 40 * day);
                for (int purchase = 0; purchase < MaxPurchasesPerMorning; purchase++)
                {
                    var ledger = s.Story.RequestOpen ? s.Story.Current : null;
                    if (ledger != null && !ledger.NeedsGlobe && st.Wallet.Cash >= ledger.Payment + reserve)
                    {
                        s.Story.Pay(s.Story.IsFinal(ledger) ? LedgerEnding.Signed : LedgerEnding.None);
                        bought.Add("Ledger: " + ledger.Title);
                        milestones.Add("Day " + day + ": ledger '" + ledger.Title + "'");
                        continue;
                    }
                    // The first item on the plan that's available today; save up for it if it's unaffordable.
                    var next = ShoppingPlan.FirstOrDefault(item => !item.Owned(s) && item.Available(s, day));
                    if (next == null || st.Wallet.Cash < next.Cost + reserve) break;
                    if (!next.Buy(s).Success) break;
                    bought.Add(next.Name);
                    milestones.Add("Day " + day + ": " + next.Name);
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

                // --- H. wants a particular globe: build one for the lift crate (inspected), if the theme and figure are available.
                var wanted = s.Story.RequestOpen ? s.Story.Current : null;
                if (wanted != null && wanted.NeedsGlobe && (wanted.AnyTheme || s.Themes.IsUnlocked(wanted.Theme))
                    && ArchetypeCatalog.Get(wanted.Archetype).UnlockDay <= day && s.Supply.OrderCharacter(wanted.Archetype).Success)
                {
                    s.Supply.Tick(SupplyService.CharacterDeliverySeconds + 1f);
                    TopUp(s, SupplyItem.GlobeKit, 1 - st.Inventory.GlobeKits);
                    TopUp(s, SupplyItem.SerumCharge, 1 - st.Inventory.SerumCharges);
                    TopUp(s, SupplyItem.PackagingBox, 1 - st.Inventory.PackagingBoxes);
                    if (!wanted.AnyTheme) s.Themes.Select(wanted.Theme);
                    var figure = st.Products.First(p => p.Stage == ProductStage.Unprepared && p.Archetype == wanted.Archetype);
                    var sample = Make(s, figure, rng, inspect: true);
                    s.Themes.Select(best.Id);
                    toMake = Math.Max(0, toMake - 1);
                    string why;
                    if (sample != null && s.Story.CanSend(sample, out why))
                    {
                        ActionResult sent;
                        s.Story.SendGlobe(sample, out sent);
                        milestones.Add("Day " + day + ": ledger '" + wanted.Title + "' (globe)");
                        bought.Add("Sent to H.");
                    }
                    else if (sample != null) backstock.Add(sample);
                }

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
                    float rate = Math.Max(0.2f, st.Exposure.ArrivalRateMultiplier) * s.Store.WalkInMultiplier();
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
        static Product Make(GameSession s, Product p, DeterministicRandom rng, bool inspect = false)
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
            if (inspect || rng.Chance(0.5f))
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
