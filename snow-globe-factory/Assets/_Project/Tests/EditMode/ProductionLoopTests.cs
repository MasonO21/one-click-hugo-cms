using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public static class TestFlow
    {
        public static Product FirstHolding(GameSession s)
        {
            foreach (var p in s.State.Products) if (p.Stage == ProductStage.Unprepared && p.Location.Kind == LocationKind.Holding) return p;
            return null;
        }

        public static void Ok(ActionResult r)
        {
            Assert.IsTrue(r.Success, r.Message);
        }

        /// <summary>Runs one character through the full manual line with the given skill (0..1).</summary>
        public static Product RunToPackaged(GameSession s, float skill = 0.5f, bool inspect = true)
        {
            var p = FirstHolding(s);
            Assert.IsNotNull(p, "no character in holding");
            p.Location = ProductLocation.At(StationId.PrepCradle);
            Ok(s.Production.Inject(p, skill));
            p.Location = ProductLocation.At(StationId.Assembly);
            Ok(s.Production.Mount(p, 1, skill));
            Ok(s.Production.Decorate(p, skill, GameBalance.SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            Ok(s.Production.FitDome(p, skill));
            Ok(s.Production.Seal(p, true));
            if (inspect)
            {
                p.Location = ProductLocation.At(StationId.Inspection);
                s.Production.Inspect(p);
                Assert.AreEqual(ProductStage.Inspected, p.Stage);
            }
            p.Location = ProductLocation.At(StationId.Packaging);
            Ok(s.Production.Package(p, skill));
            return p;
        }
    }

    public class ProductionLoopTests
    {
        [Test]
        public void FullLoop_ProducesAndSellsOneGlobe_WithCorrectCostsAndStates()
        {
            var s = GameSession.NewGame(42);
            int kits = s.State.Inventory.GlobeKits, serum = s.State.Inventory.SerumCharges, boxes = s.State.Inventory.PackagingBoxes;
            int cash = s.State.Wallet.Cash;

            var p = TestFlow.RunToPackaged(s);
            Assert.AreEqual(ProductStage.Packaged, p.Stage);
            Assert.AreEqual(kits - 1, s.State.Inventory.GlobeKits);
            Assert.AreEqual(serum - 1, s.State.Inventory.SerumCharges);
            Assert.AreEqual(boxes - 1, s.State.Inventory.PackagingBoxes);
            Assert.AreEqual(1, s.State.Day.Stats.GlobesProduced);

            TestFlow.Ok(s.Store.Display(p, 0));
            Assert.AreEqual(ProductStage.Displayed, p.Stage);
            Assert.AreEqual(p.Id, s.State.Store.Slots[0]);

            TestFlow.Ok(s.Store.Reserve(p, customerId: 7));
            ActionResult r;
            int price = s.Store.CompleteSale(p, 7, out r);
            TestFlow.Ok(r);
            Assert.Greater(price, 0);
            Assert.AreEqual(cash + price, s.State.Wallet.Cash);
            Assert.AreEqual(ProductStage.Sold, p.Stage);
            Assert.AreEqual(LocationKind.Gone, p.Location.Kind);
            Assert.AreEqual(0, s.State.Store.Slots[0]);
        }

        [Test]
        public void StandardGlobe_AtAverageQuality_IsWorthForty()
        {
            var p = new Product { Archetype = ArchetypeId.SleepyOne, Theme = ThemeId.WinterVillage, Stage = ProductStage.Packaged,
                PoseScore = 0.5f, DecorationScore = 0.5f, SnowScore = 0.5f, DomeScore = 0.5f, PackagingScore = 0.5f };
            Assert.AreEqual(40, QualityModel.EstimateValue(p));
        }

        [Test]
        public void StandardProductionCost_IsTwentyDollars()
        {
            int cost = ArchetypeCatalog.Get(ArchetypeId.SleepyOne).AcquisitionCost + GameBalance.GlobeKitCost + GameBalance.SerumChargeCost + GameBalance.PackagingCost;
            Assert.AreEqual(20, cost);
        }

        [Test]
        public void SkilledWork_IsWorthMoreThanSloppyWork()
        {
            var good = TestFlow.RunToPackaged(GameSession.NewGame(1), 1f);
            var bad = TestFlow.RunToPackaged(GameSession.NewGame(1), 0.1f);
            Assert.Greater(QualityModel.EstimateValue(good), QualityModel.EstimateValue(bad));
        }

        [Test]
        public void IllegalTransitions_AreRejected()
        {
            var s = GameSession.NewGame(3);
            var p = TestFlow.FirstHolding(s);

            Assert.IsFalse(s.Production.Inject(p, 1f).Success, "inject outside cradle");
            p.Location = ProductLocation.At(StationId.Assembly);
            Assert.IsFalse(s.Production.Mount(p, 0, 1f).Success, "mount unprepared");
            p.Location = ProductLocation.At(StationId.Sealer);
            Assert.IsFalse(s.Production.Seal(p, true).Success, "seal without dome");
            p.Location = ProductLocation.At(StationId.Packaging);
            Assert.IsFalse(s.Production.Package(p, 1f).Success, "package unsealed");
            Assert.IsFalse(s.Store.Display(p, 0).Success, "display unpackaged");
            ActionResult r;
            Assert.AreEqual(0, s.Store.CompleteSale(p, 1, out r));
            Assert.IsFalse(r.Success);
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
        }

        [Test]
        public void SealingRequiresPower()
        {
            var s = GameSession.NewGame(3);
            var p = TestFlow.FirstHolding(s);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            s.Production.Inject(p, 1f);
            p.Location = ProductLocation.At(StationId.Assembly);
            s.Production.Mount(p, 0, 1f);
            s.Production.Decorate(p, 1f, 0.6f);
            p.Location = ProductLocation.At(StationId.Sealer);
            s.Production.FitDome(p, 1f);
            Assert.IsFalse(s.Production.Seal(p, false).Success);
            Assert.AreEqual(ProductStage.Domed, p.Stage);
        }

        [Test]
        public void RunningOutOfSupplies_BlocksTheStep_WithoutLosingTheProduct()
        {
            var s = GameSession.NewGame(3);
            s.State.Inventory.GlobeKits = 0;
            var p = TestFlow.FirstHolding(s);
            p.Location = ProductLocation.At(StationId.PrepCradle);
            TestFlow.Ok(s.Production.Inject(p, 1f));
            p.Location = ProductLocation.At(StationId.Assembly);
            Assert.IsFalse(s.Production.Mount(p, 0, 1f).Success);
            Assert.AreEqual(ProductStage.Prepared, p.Stage);
            Assert.IsNotNull(s.State.Find(p.Id));
        }

        [Test]
        public void SkippingInspection_IsAllowed_ButNotCertified()
        {
            var s = GameSession.NewGame(9);
            var p = TestFlow.RunToPackaged(s, 0.5f, inspect: false);
            Assert.IsFalse(p.Certified);
            var q = TestFlow.RunToPackaged(s, 0.5f, inspect: true);
            Assert.IsTrue(q.Certified);
            Assert.Greater(QualityModel.EstimateValue(q), QualityModel.EstimateValue(p));
        }

        [Test]
        public void RejectingAGlobe_ReturnsTheSameCharacterToHolding()
        {
            var s = GameSession.NewGame(5);
            var p = TestFlow.RunToPackaged(s);
            int id = p.Id;
            string name = p.CharacterName;
            TestFlow.Ok(s.Production.RejectToHolding(p, 1));
            Assert.AreEqual(ProductStage.Unprepared, p.Stage);
            Assert.AreEqual(LocationKind.Holding, p.Location.Kind);
            Assert.AreEqual(id, p.Id);
            Assert.AreEqual(name, p.CharacterName);
            Assert.AreEqual(0f, p.PackagingScore);
        }

        [Test]
        public void SnowScoring_IsForgivingNearTarget()
        {
            Assert.AreEqual(1f, SnowScoring.Score(0.6f, 0.6f));
            Assert.AreEqual(1f, SnowScoring.Score(0.66f, 0.6f));
            Assert.Greater(SnowScoring.Score(0.8f, 0.6f), 0f);
            Assert.AreEqual(0f, SnowScoring.Score(1f, 0.6f));
        }

        [Test]
        public void DayOne_SealsNeverDefect_LaterDaysCan()
        {
            var s = GameSession.NewGame(11);
            var p = TestFlow.FirstHolding(s);
            p.DomeScore = 0.2f;
            Assert.AreEqual(0f, s.Production.SealDefectChance(p));
            s.State.Day.Day = 2;
            Assert.Greater(s.Production.SealDefectChance(p), 0f);
        }
    }
}
