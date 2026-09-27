using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class RosterAndHorrorTests
    {
        static Product SealedGlobe(GameSession s, ArchetypeId archetype, float integrity)
        {
            var p = s.State.AddCharacter(archetype, ProductLocation.At(StationId.PrepCradle));
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 20;
            TestFlow.Ok(s.Production.Inject(p, 1f));
            p.Location = ProductLocation.At(StationId.Assembly);
            TestFlow.Ok(s.Production.Mount(p, 0, 0.5f));
            TestFlow.Ok(s.Production.Decorate(p, 0.5f, GameBalance.SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            TestFlow.Ok(s.Production.FitDome(p, 0.5f));
            TestFlow.Ok(s.Production.Seal(p, true));
            p.SealIntegrity = integrity;
            p.Stage = ProductStage.Displayed;
            p.Location = ProductLocation.Shelf(0);
            return p;
        }

        static int Count(GameSession s, Product p, ProductionEventType type, float seconds)
        {
            int n = 0;
            for (float t = 0f; t < seconds; t += 1f)
                foreach (var e in s.Production.Tick(1f, 1f))
                    if (e.ProductId == p.Id && e.Type == type) n++;
            return n;
        }

        [Test]
        public void Watcher_NeverMovesWhileObserved_ShiftsWhenUnseen_AndNeverTwitchesVisibly()
        {
            var s = GameSession.NewGame(3);
            var w = SealedGlobe(s, ArchetypeId.Watcher, 0.4f);
            s.Production.IsObserved = p => true;
            Assert.AreEqual(0, Count(s, w, ProductionEventType.UnseenShift, 600f));
            s.Production.IsObserved = p => false;
            Assert.Greater(Count(s, w, ProductionEventType.UnseenShift, 600f), 0);
            Assert.AreEqual(0, Count(s, w, ProductionEventType.StasisMovement, 600f), "a Watcher is never caught twitching");
        }

        [Test]
        public void Screamer_GetsLouderAndMoreFrequent_WhenStressed()
        {
            int Calm(uint seed, float stress, out float loudest)
            {
                var s = GameSession.NewGame(seed);
                var p = s.State.AddCharacter(ArchetypeId.Screamer, ProductLocation.Holding(0));
                p.Stress = stress;
                int n = 0;
                loudest = 0f;
                for (int t = 0; t < 600; t++)
                {
                    p.Stress = stress; // hold stress constant for the comparison
                    foreach (var e in s.Production.Tick(1f, 1f))
                    {
                        if (e.ProductId != p.Id || e.Type != ProductionEventType.HoldingNoise) continue;
                        n++;
                        if (e.Intensity > loudest) loudest = e.Intensity;
                    }
                }
                return n;
            }
            float quietLoud, stressedLoud;
            int quiet = Calm(5, 0f, out quietLoud);
            int stressed = Calm(5, 1f, out stressedLoud);
            Assert.Greater(stressed, quiet * 2);
            Assert.Greater(stressedLoud, quietLoud);
            Assert.Greater(ProductionService.ScreamChancePerSecond(new Product { Archetype = ArchetypeId.Screamer, Stress = 1f }),
                           ProductionService.ScreamChancePerSecond(new Product { Archetype = ArchetypeId.Screamer, Stress = 0f }));
            Assert.AreEqual(0f, ProductionService.ScreamChancePerSecond(new Product { Archetype = ArchetypeId.SleepyOne, Stress = 1f }));
        }

        [Test]
        public void Performer_HoldsBetterPoses()
        {
            var s = GameSession.NewGame(1);
            var perf = SealedGlobe(s, ArchetypeId.Performer, 0.9f);
            var sleepy = SealedGlobe(s, ArchetypeId.SleepyOne, 0.9f);
            Assert.AreEqual(0.7f, perf.PoseScore, 0.001f);
            Assert.AreEqual(0.5f, sleepy.PoseScore, 0.001f);
        }

        [Test]
        public void SecurityCameras_AreADaySixUpgrade_ThatDrawsPower()
        {
            var s = GameSession.NewGame(1);
            s.State.Wallet.Cash = 5000;
            Assert.IsFalse(s.Upgrades.Purchase(UpgradeId.SecurityCameras).Success);
            s.State.Day.Day = 6;
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.SecurityCameras));
            Assert.IsTrue(s.State.Modifiers.HasCameras);
            Assert.AreEqual(1, s.State.Modifiers.PowerDraw);
        }

        [Test]
        public void ConveyorGrab_StallsTheBelt_UntilPriedOrReleased()
        {
            var s = GameSession.NewGame(2);
            s.State.Day.Day = 5;
            s.State.Wallet.Cash = 5000;
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.ShortConveyor));
            var p = SealedGlobe(s, ArchetypeId.SleepyOne, 0.9f);
            p.Stage = ProductStage.Sealed;
            p.Location = ProductLocation.OnConveyor(0.2f);
            s.Automation.GripConveyor(20f);
            for (int i = 0; i < 10; i++) s.Automation.Tick(1f, true);
            Assert.AreEqual(0.2f, p.Location.X, 0.0001f, "belt stalled");
            Assert.IsTrue(s.Automation.Get(MachineId.Conveyor).BlockedReason.Contains("holding"));
            TestFlow.Ok(s.Automation.PryConveyor());
            s.Automation.Tick(1f, true);
            Assert.Greater(p.Location.X, 0.2f, "belt moving again");
            Assert.IsFalse(s.Automation.PryConveyor().Success);

            s.Automation.GripConveyor(3f);
            float before = p.Location.X;
            for (int i = 0; i < 5; i++) s.Automation.Tick(1f, true);
            Assert.Greater(p.Location.X, before, "it lets go on its own eventually");
        }

        [Test]
        public void ConveyorGrab_OnlyHappensWithSomethingOnTheBelt()
        {
            var def = DirectorEventCatalog.Get(DirectorEventId.ConveyorGrab);
            Assert.AreEqual(DirectorEventKind.Threat, def.Kind);
            Assert.IsFalse(def.Condition(new DirectorContext { ConveyorItems = 0 }));
            Assert.IsTrue(def.Condition(new DirectorContext { ConveyorItems = 1 }));
            Assert.Greater(def.WarningSeconds, 0f, "threats are always telegraphed");
        }

        [Test]
        public void CabinetShift_IsAtmospheric()
        {
            Assert.AreEqual(DirectorEventKind.Atmospheric, DirectorEventCatalog.Get(DirectorEventId.CabinetShift).Kind);
        }

        [Test]
        public void EveryDirectorEventId_HasADefinition_AndIdsAreContiguous()
        {
            for (int i = 0; i < DirectorEventCatalog.All.Length; i++) Assert.AreEqual(i, (int)DirectorEventCatalog.All[i].Id);
        }

        [Test]
        public void SupplierNotes_ArriveOnTheirDays_AndAccumulate()
        {
            Assert.IsNull(DayProgression.SupplierNoteFor(1));
            StringAssert.Contains("Keep them warm", DayProgression.SupplierNoteFor(2));
            Assert.AreEqual(0, DayProgression.NotesReceived(1).Count);
            Assert.AreEqual(3, DayProgression.NotesReceived(4).Count);
            Assert.AreEqual(DayProgression.SupplierNotes.Length, DayProgression.NotesReceived(99).Count);
        }
    }
}
