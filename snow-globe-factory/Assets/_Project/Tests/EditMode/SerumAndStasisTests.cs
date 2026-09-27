using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class SerumAndStasisTests
    {
        static Product Prepared(GameSession s, float timing = 1f)
        {
            var p = TestFlow.FirstHolding(s);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            TestFlow.Ok(s.Production.Inject(p, timing));
            return p;
        }

        [Test]
        public void SerumWarnsOnce_ThenExpires_WakingTheCharacterAndRuiningTheKit()
        {
            var s = GameSession.NewGame(2);
            var p = Prepared(s);
            p.Location = ProductLocation.At(StationId.Assembly);
            TestFlow.Ok(s.Production.Mount(p, 0, 1f));

            int warnings = 0, expiries = 0;
            for (int i = 0; i < 400 && p.Stage != ProductStage.Unprepared; i++)
            {
                foreach (var e in s.Production.Tick(0.5f, 1f))
                {
                    if (e.ProductId != p.Id) continue;
                    if (e.Type == ProductionEventType.SerumWarning) warnings++;
                    if (e.Type == ProductionEventType.SerumExpired) expiries++;
                }
            }
            Assert.AreEqual(1, warnings);
            Assert.AreEqual(1, expiries);
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
            Assert.AreEqual(LocationKind.Loose, p.Location.Kind);
            Assert.AreEqual(1, s.State.Day.Stats.KitsRuined);
            Assert.IsNotNull(s.State.Find(p.Id), "character must still exist");
        }

        [Test]
        public void BetterInjector_ExtendsTheWindowByHalf()
        {
            var s = GameSession.NewGame(2);
            var p = TestFlow.FirstHolding(s);
            float before = s.Production.SerumWindowFor(p);
            s.State.Wallet.Cash = 1000;
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.BetterInjector));
            Assert.AreEqual(before * 1.5f, s.Production.SerumWindowFor(p), 0.01f);
        }

        [Test]
        public void PrepCradle_WidensTheTimingZone()
        {
            var s = GameSession.NewGame(2);
            var p = TestFlow.FirstHolding(s);
            float before = s.Production.TimingZoneWidth(p);
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.PrepCradle));
            Assert.Greater(s.Production.TimingZoneWidth(p), before);
            Assert.IsTrue(s.State.Modifiers.CradlePreventsSlipping);
        }

        [Test]
        public void Redose_ExtendsWindow_AndCostsACharge()
        {
            var s = GameSession.NewGame(2);
            var p = Prepared(s);
            s.Production.Tick(30f, 1f);
            float before = p.SerumRemaining;
            int charges = s.State.Inventory.SerumCharges;
            TestFlow.Ok(s.Production.Redose(p));
            Assert.Greater(p.SerumRemaining, before);
            Assert.AreEqual(charges - 1, s.State.Inventory.SerumCharges);
        }

        [Test]
        public void PoorInjectionTiming_GivesAShorterWindow()
        {
            var a = Prepared(GameSession.NewGame(2), 1f);
            var b = Prepared(GameSession.NewGame(2), 0f);
            Assert.Greater(a.SerumRemaining, b.SerumRemaining);
        }

        [Test]
        public void DefectiveSeal_EventuallyMoves_PerfectSealNeverDoes()
        {
            var s = GameSession.NewGame(77);
            var weak = TestFlow.RunToPackaged(s);
            TestFlow.Ok(s.Store.Display(weak, 0));
            weak.SealIntegrity = 0.3f;
            var perfect = TestFlow.RunToPackaged(s);
            TestFlow.Ok(s.Store.Display(perfect, 1));
            perfect.SealIntegrity = 1f;

            int weakMoves = 0, perfectMoves = 0;
            for (int i = 0; i < 1200; i++)
            {
                foreach (var e in s.Production.Tick(1f, 1f))
                {
                    if (e.Type != ProductionEventType.StasisMovement) continue;
                    if (e.ProductId == weak.Id) weakMoves++;
                    if (e.ProductId == perfect.Id) perfectMoves++;
                }
            }
            Assert.Greater(weakMoves, 0);
            Assert.AreEqual(0, perfectMoves);
        }

        [Test]
        public void PowerFailure_StrainsSeals_AndTheyRecover()
        {
            var s = GameSession.NewGame(4);
            var p = TestFlow.RunToPackaged(s);
            p.SealIntegrity = 0.9f;
            for (int i = 0; i < 10; i++) s.Production.Tick(1f, 0f);
            Assert.Greater(p.SealStrain, 0f);
            Assert.Less(p.EffectiveIntegrity, 0.9f);
            for (int i = 0; i < 120; i++) s.Production.Tick(1f, 1f);
            Assert.AreEqual(0f, p.SealStrain, 0.0001f);
        }

        [Test]
        public void BoxedGlobes_DoNotVisiblyMove()
        {
            var s = GameSession.NewGame(8);
            var p = TestFlow.RunToPackaged(s);
            p.SealIntegrity = 0f;
            for (int i = 0; i < 600; i++)
            {
                foreach (var e in s.Production.Tick(1f, 1f))
                {
                    Assert.AreNotEqual(ProductionEventType.StasisMovement, e.Type);
                }
            }
        }
    }
}
