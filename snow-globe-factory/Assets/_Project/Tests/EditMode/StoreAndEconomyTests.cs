using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class StoreAndEconomyTests
    {
        static Product Displayed(GameSession s, int slot)
        {
            var p = TestFlow.RunToPackaged(s);
            TestFlow.Ok(s.Store.Display(p, slot));
            return p;
        }

        [Test]
        public void GlobeCannotBeSoldTwice()
        {
            var s = GameSession.NewGame(1);
            var p = Displayed(s, 0);
            s.Store.Reserve(p, 1);
            ActionResult r;
            int first = s.Store.CompleteSale(p, 1, out r);
            int cashAfter = s.State.Wallet.Cash;
            int second = s.Store.CompleteSale(p, 1, out r);
            Assert.Greater(first, 0);
            Assert.AreEqual(0, second);
            Assert.IsFalse(r.Success);
            Assert.AreEqual(cashAfter, s.State.Wallet.Cash);
            Assert.AreEqual(1, s.State.Day.Stats.GlobesSold);
        }

        [Test]
        public void NoPaymentWithoutReservation_AndNoDoubleReservation()
        {
            var s = GameSession.NewGame(1);
            var p = Displayed(s, 0);
            ActionResult r;
            Assert.AreEqual(0, s.Store.CompleteSale(p, 5, out r));
            TestFlow.Ok(s.Store.Reserve(p, 5));
            Assert.IsFalse(s.Store.Reserve(p, 6).Success);
            Assert.AreEqual(0, s.Store.CompleteSale(p, 6, out r));
        }

        [Test]
        public void ProductOccupiesOnlyOneSlot_AndSlotsDontOverlap()
        {
            var s = GameSession.NewGame(1);
            var a = Displayed(s, 0);
            TestFlow.Ok(s.Store.Display(a, 3));
            Assert.AreEqual(0, s.State.Store.Slots[0]);
            Assert.AreEqual(a.Id, s.State.Store.Slots[3]);
            var b = TestFlow.RunToPackaged(s);
            Assert.IsFalse(s.Store.Display(b, 3).Success);
            Assert.AreEqual(ProductStage.Packaged, b.Stage);
        }

        [Test]
        public void PullingFromDisplay_ReboxesWithoutNewBox_AndCancelsReservation()
        {
            var s = GameSession.NewGame(1);
            var p = Displayed(s, 2);
            s.Store.Reserve(p, 9);
            int boxes = s.State.Inventory.PackagingBoxes;
            TestFlow.Ok(s.Store.PullFromDisplay(p));
            Assert.AreEqual(ProductStage.Packaged, p.Stage);
            Assert.AreEqual(boxes, s.State.Inventory.PackagingBoxes);
            Assert.IsFalse(s.Store.IsReserved(p.Id));
            Assert.AreEqual(0, s.State.Store.Slots[2]);
        }

        [Test]
        public void Upgrades_CostCash_CannotBeBoughtTwice_AndRespectUnlockDay()
        {
            var s = GameSession.NewGame(1);
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.PrepCradle));
            Assert.AreEqual(90, s.State.Wallet.Cash);
            Assert.IsFalse(s.Upgrades.Purchase(UpgradeId.PrepCradle).Success);
            Assert.AreEqual(90, s.State.Wallet.Cash);
            s.State.Wallet.Cash = 5000;
            Assert.IsFalse(s.Upgrades.Purchase(UpgradeId.AutoPrepStation).Success, "day 5 unlock");
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.AssemblyJig));
            Assert.AreEqual(5000 - 150, s.State.Wallet.Cash);
        }

        [Test]
        public void PremiumDisplayCase_AddsShelfSlots()
        {
            var s = GameSession.NewGame(1);
            s.State.Day.Day = 3;
            s.State.Wallet.Cash = 1000;
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.PremiumDisplayCase));
            Assert.AreEqual(GameBalance.BaseShelfCapacity + 4, s.State.ShelfCapacity);
            Assert.AreEqual(s.State.ShelfCapacity, s.State.Store.Slots.Count);
        }

        [Test]
        public void OperatingCostBecomesDebt_WhenBroke_AndDebtIsRepaidFromSales()
        {
            var s = GameSession.NewGame(1);
            s.State.Wallet.Cash = 10;
            s.Days.OpenStore();
            s.Days.CloseStore();
            Assert.AreEqual(0, s.State.Wallet.Cash);
            Assert.AreEqual(15, s.State.Wallet.Debt);
            int kept = s.State.Wallet.Earn(40);
            Assert.AreEqual(25, kept);
            Assert.AreEqual(0, s.State.Wallet.Debt);
        }

        [Test]
        public void EmergencyOrder_OnlyWhenStuck_OncePerDay()
        {
            var s = GameSession.NewGame(1);
            Assert.IsFalse(s.Supply.CanRequestEmergencyOrder(), "has cash");
            s.State.Wallet.Cash = 3;
            TestFlow.Ok(s.Supply.RequestEmergencyOrder());
            Assert.AreEqual(40, s.State.Wallet.Debt);
            Assert.IsFalse(s.Supply.CanRequestEmergencyOrder(), "once per day");
            Assert.AreEqual(GameBalance.StartingCharacters + 2, s.State.Products.Count);
        }

        [Test]
        public void EmergencyOrder_RefusedWhileThereIsStockToSell()
        {
            var s = GameSession.NewGame(1);
            TestFlow.RunToPackaged(s);
            s.State.Wallet.Cash = 0;
            Assert.IsFalse(s.Supply.CanRequestEmergencyOrder());
        }

        [Test]
        public void CharacterOrders_ArriveAtTheHatch_AfterADelay()
        {
            var s = GameSession.NewGame(1);
            int before = s.State.Products.Count;
            TestFlow.Ok(s.Supply.OrderCharacter(ArchetypeId.SleepyOne));
            Assert.IsFalse(s.Supply.OrderCharacter(ArchetypeId.Watcher).Success, "locked archetype");
            Assert.IsNull(s.Supply.Tick(5f));
            var arrived = s.Supply.Tick(SupplyService.CharacterDeliverySeconds);
            Assert.AreEqual(1, arrived.Count);
            Assert.AreEqual(LocationKind.Hatch, arrived[0].Location.Kind);
            Assert.AreEqual(before + 1, s.State.Products.Count);
        }

        [Test]
        public void DayCycle_OpensOnce_ClosesAtFivePm_AndAdvances()
        {
            var s = GameSession.NewGame(1);
            Assert.IsFalse(s.Days.Tick(100f), "clock frozen before opening");
            Assert.AreEqual("9:00am", s.Days.ClockText);
            TestFlow.Ok(s.Days.OpenStore());
            Assert.IsFalse(s.Days.OpenStore().Success);
            bool closedSignal = false;
            for (int i = 0; i < 500 && !closedSignal; i++) closedSignal = s.Days.Tick(1f);
            Assert.IsTrue(closedSignal);
            var summary = s.Days.CloseStore();
            Assert.AreEqual(GameBalance.DailyOperatingCost, summary.OperatingCost);
            Assert.AreEqual(GameBalance.StartingCash - GameBalance.DailyOperatingCost, s.State.Wallet.Cash);
            TestFlow.Ok(s.Days.StartNextDay());
            Assert.AreEqual(2, s.State.Day.Day);
            Assert.AreEqual(DayPhase.BeforeOpening, s.State.Day.Phase);
        }

        [Test]
        public void HighExposure_DefectiveSoldGlobesComeBack_WithRefund_AndNoDuplicate()
        {
            int returned = 0;
            for (uint seed = 1; seed <= 20; seed++)
            {
                var s = GameSession.NewGame(seed);
                s.State.Exposure.Value = 100f;
                s.Days.OpenStore();
                var p = TestFlow.RunToPackaged(s, 0.5f, inspect: false);
                p.SealIntegrity = 0.3f;
                TestFlow.Ok(s.Store.Display(p, 0));
                s.Store.Reserve(p, 1);
                ActionResult r;
                int price = s.Store.CompleteSale(p, 1, out r);
                int count = s.State.Products.Count;
                int cashAfterSale = s.State.Wallet.Cash;

                s.Days.CloseStore();
                Assert.AreEqual(count, s.State.Products.Count);
                if (p.Stage == ProductStage.Packaged)
                {
                    returned++;
                    Assert.AreEqual(price, s.State.Day.Stats.Refunds);
                    Assert.IsTrue(p.Location.IsStation(StationId.Counter));
                    Assert.AreEqual(cashAfterSale - price - GameBalance.DailyOperatingCost, s.State.Wallet.Cash);
                }
                else
                {
                    Assert.AreEqual(ProductStage.Sold, p.Stage);
                }
            }
            Assert.Greater(returned, 0);
        }

        [Test]
        public void CertifiedGlobes_AreNeverReturned()
        {
            for (uint seed = 1; seed <= 20; seed++)
            {
                var s = GameSession.NewGame(seed);
                s.State.Exposure.Value = 100f;
                s.Days.OpenStore();
                var p = TestFlow.RunToPackaged(s, 0.5f, inspect: true);
                p.SealIntegrity = 0.3f;
                s.Store.Display(p, 0);
                s.Store.Reserve(p, 1);
                ActionResult r;
                s.Store.CompleteSale(p, 1, out r);
                s.Days.CloseStore();
                Assert.AreEqual(ProductStage.Sold, p.Stage);
            }
        }
    }
}
