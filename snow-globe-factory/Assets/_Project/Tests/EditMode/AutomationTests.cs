using System.Collections.Generic;
using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class AutomationTests
    {
        static GameSession WithMachines(uint seed, params UpgradeId[] upgrades)
        {
            var s = GameSession.NewGame(seed);
            s.State.Day.Day = 10;
            s.State.Wallet.Cash = 100000;
            foreach (var u in upgrades) TestFlow.Ok(s.Upgrades.Purchase(u));
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 200;
            return s;
        }

        static void Run(GameSession s, float seconds, bool power = true, float dt = 0.25f)
        {
            for (float t = 0f; t < seconds; t += dt) s.Automation.Tick(dt, power);
        }

        /// <summary>Takes a prepared character from the cradle and instantly assembles + seals it (a perfect player).</summary>
        static Product HandAssembleToSealer(GameSession s, Product p)
        {
            p.Location = ProductLocation.At(StationId.Assembly);
            TestFlow.Ok(s.Production.Mount(p, 0, 0.8f));
            TestFlow.Ok(s.Production.Decorate(p, 0.8f, GameBalance.SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            TestFlow.Ok(s.Production.FitDome(p, 0.8f));
            TestFlow.Ok(s.Production.Seal(p, true));
            return p;
        }

        [Test]
        public void NothingHappens_WithoutTheUpgrades()
        {
            var s = WithMachines(1);
            var p = TestFlow.FirstHolding(s);
            Assert.IsFalse(s.Automation.AddToHopper(p).Success);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            Run(s, 60f);
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
        }

        [Test]
        public void AutoPrep_FeedsFromHopperInOrder_AndInjects()
        {
            var s = WithMachines(2, UpgradeId.AutoPrepStation);
            var chars = new List<Product>();
            foreach (var p in s.State.Products) if (p.Stage == ProductStage.Unprepared) chars.Add(p);
            foreach (var p in chars) TestFlow.Ok(s.Automation.AddToHopper(p));
            Run(s, 10f);
            Assert.AreEqual(ProductStage.Prepared, chars[0].Stage, "first in, first prepared");
            Assert.IsTrue(chars[0].Location.IsStation(StationId.PrepCradle));
            Assert.AreEqual(ProductStage.Unprepared, chars[1].Stage, "cradle occupied: the rest wait");
            Assert.AreEqual(LocationKind.Hopper, chars[1].Location.Kind);
            Assert.IsTrue(s.Automation.Get(MachineId.AutoPrep).BlockedReason.Length > 0);
        }

        [Test]
        public void Hopper_HasACapacity()
        {
            var s = WithMachines(3, UpgradeId.AutoPrepStation);
            for (int i = 0; i < 3; i++) s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.Holding(5 + i));
            int added = 0;
            foreach (var p in s.State.Products) if (s.Automation.AddToHopper(p).Success) added++;
            Assert.AreEqual(AutomationService.HopperCapacity, added);
        }

        [Test]
        public void NoPower_NoProgress_AndManualOverrideStopsTheMachine()
        {
            var s = WithMachines(4, UpgradeId.AutoPrepStation);
            var p = TestFlow.FirstHolding(s);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            Run(s, 30f, power: false);
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
            TestFlow.Ok(s.Automation.SetEnabled(MachineId.AutoPrep, false));
            Run(s, 30f);
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
            TestFlow.Ok(s.Automation.SetEnabled(MachineId.AutoPrep, true));
            Run(s, 30f);
            Assert.AreEqual(ProductStage.Prepared, p.Stage);
        }

        [Test]
        public void Conveyor_CarriesSealedGlobes_ToPackaging_AndBlocksSafely()
        {
            var s = WithMachines(5, UpgradeId.ShortConveyor);
            var p = TestFlow.FirstHolding(s);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            s.Production.Inject(p, 1f);
            HandAssembleToSealer(s, p);
            Run(s, 1f);
            Assert.AreEqual(LocationKind.Conveyor, p.Location.Kind);
            Run(s, AutomationService.ConveyorTravelSeconds + 1f);
            Assert.IsTrue(p.Location.IsStation(StationId.Packaging));

            // Packaging occupied: the next globe rides to the end of the belt and waits there.
            var q = TestFlow.FirstHolding(s);
            q.Location = ProductLocation.At(StationId.PrepCradle);
            s.Production.Inject(q, 1f);
            HandAssembleToSealer(s, q);
            Run(s, 20f);
            Assert.AreEqual(LocationKind.Conveyor, q.Location.Kind);
            Assert.AreEqual(1f, q.Location.X, 0.0001f);
            Assert.IsTrue(s.Automation.Get(MachineId.Conveyor).BlockedReason.Length > 0);

            // Player takes the first globe away: the belt resumes.
            p.Location = ProductLocation.Carried();
            Run(s, 1f);
            Assert.IsTrue(q.Location.IsStation(StationId.Packaging));
        }

        [Test]
        public void PackagingMachine_BoxesAtCappedQuality_AndFillsTheOutputRack()
        {
            var s = WithMachines(6, UpgradeId.PackagingMachine);
            var boxed = new List<Product>();
            for (int i = 0; i < AutomationService.OutputShelfCapacity + 1; i++)
            {
                var p = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.At(StationId.PrepCradle));
                s.Production.Inject(p, 1f);
                HandAssembleToSealer(s, p);
                p.Location = ProductLocation.At(StationId.Packaging);
                Run(s, AutomationService.PackagingSeconds + 1f);
                Assert.AreEqual(ProductStage.Packaged, p.Stage);
                Assert.AreEqual(AutomationService.MachinePackagingScore, p.PackagingScore, 0.0001f);
                boxed.Add(p);
            }
            for (int i = 0; i < AutomationService.OutputShelfCapacity; i++) Assert.AreEqual(LocationKind.OutputShelf, boxed[i].Location.Kind);
            // Rack full: the last box stays on the table instead of vanishing.
            var last = boxed[boxed.Count - 1];
            Assert.IsTrue(last.Location.IsStation(StationId.Packaging));
            boxed[0].Location = ProductLocation.Carried();
            Run(s, 1f);
            Assert.AreEqual(LocationKind.OutputShelf, last.Location.Kind);
        }

        [Test]
        public void WornMachines_BreakDown_AndRepairCostsMoney()
        {
            var s = WithMachines(7, UpgradeId.AutoPrepStation);
            var m = s.Automation.Get(MachineId.AutoPrep);
            bool broke = false;
            for (int i = 0; i < 200 && !broke; i++)
            {
                var p = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.At(StationId.PrepCradle));
                Run(s, 10f);
                p.Location = ProductLocation.Carried(); // player takes it away
                broke = m.Broken;
            }
            Assert.IsTrue(broke, "machine should eventually break as it wears");
            var q = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.At(StationId.PrepCradle));
            Run(s, 30f);
            Assert.AreEqual(ProductStage.Unprepared, q.Stage, "broken machines do nothing");
            int cash = s.State.Wallet.Cash;
            TestFlow.Ok(s.Automation.Repair(MachineId.AutoPrep));
            Assert.AreEqual(cash - AutomationService.RepairCost, s.State.Wallet.Cash);
            Assert.AreEqual(1f, m.Condition);
            Run(s, 30f);
            Assert.AreEqual(ProductStage.Prepared, q.Stage);
        }

        [Test]
        public void HeavyGlobes_CanJamTheConveyor()
        {
            int jams = 0;
            for (uint seed = 1; seed <= 20; seed++)
            {
                var s = WithMachines(seed, UpgradeId.ShortConveyor);
                var p = s.State.AddCharacter(ArchetypeId.Heavy, ProductLocation.At(StationId.PrepCradle));
                s.Production.Inject(p, 1f);
                HandAssembleToSealer(s, p);
                Run(s, 1f);
                if (s.Automation.Get(MachineId.Conveyor).Jammed) jams++;
            }
            Assert.Greater(jams, 0);
            Assert.Less(jams, 20);
        }

        /// <summary>
        /// Property: under random machine ticks, power cuts, player grabs, breakdowns and repairs,
        /// no product is ever lost or duplicated, and no two products share a station or rack slot.
        /// </summary>
        [Test]
        public void RandomOperations_NeverLoseOrStackProducts()
        {
            for (uint seed = 1; seed <= 25; seed++)
            {
                var s = WithMachines(seed, UpgradeId.AutoPrepStation, UpgradeId.ShortConveyor, UpgradeId.PackagingMachine);
                var rng = new DeterministicRandom(seed * 7919);
                for (int i = 0; i < 6; i++) s.State.AddCharacter((ArchetypeId)(i % 4), ProductLocation.Holding(i));
                int count = s.State.Products.Count;

                for (int step = 0; step < 600; step++)
                {
                    s.Automation.Tick(0.5f, rng.Chance(0.9f));
                    float roll = rng.NextFloat();
                    if (roll < 0.08f)
                    {
                        foreach (var p in s.State.Products) if (p.Location.Kind == LocationKind.Holding && s.Automation.AddToHopper(p).Success) break;
                    }
                    else if (roll < 0.14f)
                    {
                        var prepped = s.Automation.At(StationId.PrepCradle);
                        if (prepped != null && prepped.Stage == ProductStage.Prepared && s.Automation.At(StationId.Sealer) == null)
                            HandAssembleToSealer(s, prepped);
                    }
                    else if (roll < 0.17f)
                    {
                        // Player grabs a random thing off the line and drops it on the floor.
                        var p = s.State.Products[rng.Range(0, s.State.Products.Count)];
                        if (p.Location.Kind == LocationKind.Conveyor || p.Location.Kind == LocationKind.OutputShelf) p.Location = ProductLocation.Floor(0f, 0f, 15f);
                    }
                    else if (roll < 0.19f)
                    {
                        foreach (MachineId id in new[] { MachineId.AutoPrep, MachineId.Conveyor, MachineId.PackagingMachine }) s.Automation.Repair(id);
                    }
                    AssertInvariants(s, count);
                }
            }
        }

        static void AssertInvariants(GameSession s, int count)
        {
            Assert.AreEqual(count, s.State.Products.Count, "product count changed");
            var ids = new HashSet<int>();
            var stations = new HashSet<int>();
            var slots = new HashSet<int>();
            int onBelt = 0;
            foreach (var p in s.State.Products)
            {
                Assert.IsTrue(ids.Add(p.Id), "duplicate id");
                Assert.AreNotEqual(LocationKind.Gone, p.Location.Kind, "product vanished");
                if (p.Location.Kind == LocationKind.Station) Assert.IsTrue(stations.Add(p.Location.Index), "two products on one station");
                if (p.Location.Kind == LocationKind.OutputShelf) Assert.IsTrue(slots.Add(p.Location.Index), "two boxes in one rack slot");
                if (p.Location.Kind == LocationKind.Conveyor) onBelt++;
            }
            Assert.LessOrEqual(onBelt, AutomationService.ConveyorCapacity);
        }

        /// <summary>M3 exit criterion: with all three machines, a player who only assembles/seals and restocks makes 10+ globes a day.</summary>
        [Test]
        public void Throughput_TenPlusGlobesPerOpenDay_WithAutomation()
        {
            var s = WithMachines(11, UpgradeId.AutoPrepStation, UpgradeId.ShortConveyor, UpgradeId.PackagingMachine);
            for (int i = 0; i < 20; i++) s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.Holding(i));
            const float day = (GameBalance.ClosingHourMinutes - GameBalance.OpeningHourMinutes) * GameBalance.RealSecondsPerGameMinute;
            float handBusyUntil = 0f;
            int stocked = 0;
            for (float t = 0f; t < day; t += 0.5f)
            {
                s.Automation.Tick(0.5f, true);
                foreach (var p in s.State.Products) if (p.Location.Kind == LocationKind.Holding && s.Automation.AddToHopper(p).Success) break;
                // The player needs ~30 s per globe for assembly + sealing by hand.
                var prepped = s.Automation.At(StationId.PrepCradle);
                if (t >= handBusyUntil && prepped != null && prepped.Stage == ProductStage.Prepared && s.Automation.At(StationId.Sealer) == null)
                {
                    HandAssembleToSealer(s, prepped);
                    handBusyUntil = t + 30f;
                }
                // ...fixes anything that breaks...
                foreach (MachineId id in new[] { MachineId.AutoPrep, MachineId.Conveyor, MachineId.PackagingMachine })
                    if (s.Automation.Get(id).Broken || s.Automation.Get(id).Jammed) s.Automation.Repair(id);
                // ...and carries boxes from the rack to the shelves.
                for (int slot = 0; slot < AutomationService.OutputShelfCapacity; slot++)
                {
                    var box = s.Automation.OnOutputSlot(slot);
                    if (box == null) continue;
                    box.Location = ProductLocation.Carried();
                    stocked++;
                }
            }
            TestContext.WriteLine("Automated day throughput: " + stocked + " globes");
            Assert.GreaterOrEqual(stocked, 10, "globes produced in one 8-minute open day");
        }
    }
}
