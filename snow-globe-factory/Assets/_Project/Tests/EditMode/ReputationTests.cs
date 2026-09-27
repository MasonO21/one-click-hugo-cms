using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class ReputationTests
    {
        static GameSession OnDay(int day, int cash = 200000)
        {
            var s = GameSession.NewGame(5);
            s.State.Day.Day = day;
            s.State.Wallet.Cash = cash;
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 50;
            return s;
        }

        [Test]
        public void Refits_UnlockOnDay20_OnlyWhileClosed_AndCostsDouble()
        {
            Assert.IsFalse(OnDay(19).Reputation.BuyRefit().Success, "not before day 20");

            var s = OnDay(20);
            TestFlow.Ok(s.Days.OpenStore());
            Assert.IsFalse(s.Reputation.BuyRefit().Success, "not while open");
            s.Days.CloseStore();

            int[] costs = { 3000, 6000, 12000, 24000, 48000 };
            for (int i = 0; i < costs.Length; i++)
            {
                Assert.AreEqual(costs[i], s.Reputation.NextRefitCost);
                int cash = s.State.Wallet.Cash;
                TestFlow.Ok(s.Reputation.BuyRefit());
                Assert.AreEqual(cash - costs[i], s.State.Wallet.Cash);
                Assert.AreEqual(i + 1, s.Reputation.RefitTier);
            }
            Assert.IsTrue(s.Reputation.RefitsMaxed);
            Assert.IsFalse(s.Reputation.BuyRefit().Success, "five tiers only");
            Assert.AreEqual(1.3f, s.Reputation.PriceMultiplier, 1e-4f);
        }

        [Test]
        public void Refits_RaiseWhatCustomersPay()
        {
            var s = OnDay(20);
            var p = TestFlow.RunToPackaged(s);
            TestFlow.Ok(s.Store.Display(p, 0));
            int value = QualityModel.EstimateValue(p);
            Assert.AreEqual(value, ReputationService.RetailPrice(s.State, p), "no refits: price = value");

            TestFlow.Ok(s.Reputation.BuyRefit());
            TestFlow.Ok(s.Reputation.BuyRefit());
            int expected = (int)(value * 1.12f + 0.5f);
            Assert.AreEqual(expected, ReputationService.RetailPrice(s.State, p));

            TestFlow.Ok(s.Store.Reserve(p, 7));
            ActionResult r;
            int cash = s.State.Wallet.Cash;
            Assert.AreEqual(expected, s.Store.CompleteSale(p, 7, out r));
            Assert.AreEqual(cash + expected, s.State.Wallet.Cash);
        }

        [Test]
        public void Fair_LowersExposure_OncePerDay_AndCostsMoreEachTime()
        {
            Assert.IsFalse(OnDay(19).Reputation.SponsorFair().Success, "not before day 20");

            var s = OnDay(20);
            s.State.Exposure.Value = 55f;
            int cash = s.State.Wallet.Cash;
            TestFlow.Ok(s.Reputation.SponsorFair());
            Assert.AreEqual(35f, s.State.Exposure.Value, 1e-4f);
            Assert.AreEqual(cash - 1000, s.State.Wallet.Cash);
            Assert.IsTrue(s.Reputation.SponsoredToday);
            Assert.IsFalse(s.Reputation.SponsorFair().Success, "once a day");

            s.State.Day.Day++;
            Assert.AreEqual(2000, s.Reputation.NextFairCost);
            s.State.Exposure.Value = 5f;
            TestFlow.Ok(s.Reputation.SponsorFair());
            Assert.AreEqual(0f, s.State.Exposure.Value, "never below zero");
        }

        [Test]
        public void Validator_RepairsMissingOrOutOfRangeReputation()
        {
            var s = OnDay(25);
            s.State.Reputation = null;
            SaveValidator.Repair(s.State);
            Assert.IsNotNull(s.State.Reputation);

            s.State.Reputation.RefitTier = 9;
            var log = SaveValidator.Repair(s.State);
            Assert.AreEqual(ReputationService.MaxRefitTier, s.State.Reputation.RefitTier);
            Assert.IsNotEmpty(log);
        }
    }
}
