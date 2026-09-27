using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class OrdersAndThemesTests
    {
        static GameSession OnDay(int day, uint seed = 1)
        {
            var s = GameSession.NewGame(seed);
            s.State.Day.Day = day;
            s.State.Wallet.Cash = 5000;
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 50;
            return s;
        }

        /// <summary>Builds a boxed globe exactly to the current assembly card (pinned order or house card).</summary>
        static Product BuildToCard(GameSession s, float skill = 1f, bool inspect = true, ArchetypeId archetype = ArchetypeId.SleepyOne)
        {
            var p = s.State.AddCharacter(archetype, ProductLocation.At(StationId.PrepCradle));
            TestFlow.Ok(s.Production.Inject(p, 1f));
            p.Location = ProductLocation.At(StationId.Assembly);
            var card = AssemblyCard.For(s.State, p);
            TestFlow.Ok(s.Production.Mount(p, card.Pose, skill));
            p.DecorationCode = card.SceneryCode;
            TestFlow.Ok(s.Production.Decorate(p, skill, ThemeCatalog.Get(p.Theme).SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            TestFlow.Ok(s.Production.FitDome(p, skill));
            TestFlow.Ok(s.Production.Seal(p, true));
            if (inspect)
            {
                p.Location = ProductLocation.At(StationId.Inspection);
                s.Production.Inspect(p);
            }
            p.Location = ProductLocation.At(StationId.Packaging);
            TestFlow.Ok(s.Production.Package(p, skill));
            return p;
        }

        [Test]
        public void NoOrdersBeforeDayFour_ThenAtMostThreeOpen()
        {
            var s = OnDay(3);
            Assert.AreEqual(0, s.Orders.OnNewDay().Count);
            s.State.Day.Day = 4;
            for (int i = 0; i < 5; i++) s.Orders.OnNewDay();
            Assert.AreEqual(OrderService.MaxOpen, s.Orders.OpenCount);
        }

        [Test]
        public void OrdersAreDeterministicForASeed()
        {
            var a = OnDay(4, 77);
            var b = OnDay(4, 77);
            var oa = a.Orders.OnNewDay()[0];
            var ob = b.Orders.OnNewDay()[0];
            Assert.AreEqual(OrderService.Describe(oa), OrderService.Describe(ob));
        }

        [Test]
        public void OverdueOrdersExpire_AndGetUnpinned()
        {
            var s = OnDay(4);
            var o = s.Orders.OnNewDay()[0];
            TestFlow.Ok(s.Orders.Pin(o.Id));
            s.State.Day.Day = o.DueDay + 1;
            s.Orders.OnNewDay();
            Assert.AreEqual(OrderState.Expired, o.State);
            Assert.IsNull(s.Orders.PinnedOrder);
        }

        [Test]
        public void PinnedOrder_DrivesTheAssemblyCard_AndTheTheme()
        {
            var s = OnDay(4);
            TestFlow.Ok(s.Themes.Unlock(ThemeId.WoodlandCabin));
            var o = s.Orders.OnNewDay()[0];
            o.Theme = ThemeId.WoodlandCabin;
            TestFlow.Ok(s.Orders.Pin(o.Id));
            var p = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.Holding(0));
            var card = AssemblyCard.For(s.State, p);
            Assert.AreEqual(o.PoseIndex, card.Pose);
            Assert.AreEqual(o.SceneryCode, card.SceneryCode);
            Assert.AreEqual(ThemeId.WoodlandCabin, card.Theme);
            Assert.IsTrue(card.FromOrder);
        }

        [Test]
        public void MatchingGlobe_FulfilsOnce_PayingPricePlusBonus()
        {
            var s = OnDay(4);
            var o = s.Orders.OnNewDay()[0];
            o.MinTier = QualityTier.Standard;
            o.SpecificArchetype = false;
            TestFlow.Ok(s.Orders.Pin(o.Id));
            var p = BuildToCard(s, 1f, inspect: true);
            int value = QualityModel.EstimateValue(p);
            int cash = s.State.Wallet.Cash;
            ActionResult r;
            int paid = s.Orders.Fulfil(o, p, out r);
            TestFlow.Ok(r);
            Assert.AreEqual(value + o.Bonus, paid);
            Assert.AreEqual(cash + paid, s.State.Wallet.Cash);
            Assert.AreEqual(ProductStage.Sold, p.Stage);
            Assert.AreEqual(OrderState.Fulfilled, o.State);
            Assert.AreEqual(0, s.Orders.Fulfil(o, p, out r));
            Assert.IsFalse(r.Success);
            Assert.AreEqual(cash + paid, s.State.Wallet.Cash);
        }

        [Test]
        public void WrongGlobes_AreRefused_WithAReason()
        {
            var s = OnDay(4);
            var o = s.Orders.OnNewDay()[0];
            o.MinTier = QualityTier.Standard;
            o.SpecificArchetype = false;
            o.RequireCertified = true;
            // Not pinned: built to the house card, so pose/scenery almost certainly differ.
            var p = BuildToCard(s, 1f, inspect: false);
            p.PoseIndex = (o.PoseIndex + 1) % AssemblyCard.PoseCount;
            string reason;
            Assert.IsFalse(OrderService.Matches(o, p, out reason));
            StringAssert.Contains("pose", reason);
            p.PoseIndex = o.PoseIndex;
            p.DecorationCode = o.SceneryCode;
            p.Theme = o.Theme;
            Assert.IsFalse(OrderService.Matches(o, p, out reason));
            StringAssert.Contains("inspected", reason);
        }

        [Test]
        public void OrderBonus_JustifiesTheExtraWork()
        {
            var s = OnDay(4);
            foreach (var o in s.Orders.OnNewDay())
            {
                Assert.GreaterOrEqual(o.Bonus, 15, "an order always pays at least $15 over list price");
                if (o.MinTier == QualityTier.Exquisite) Assert.GreaterOrEqual(o.Bonus, 35);
            }
        }

        [Test]
        public void Themes_UnlockOnDayFour_CostMoney_AndApplyAtMount()
        {
            var s = OnDay(3);
            Assert.IsFalse(s.Themes.Unlock(ThemeId.WoodlandCabin).Success, "day 4 unlock");
            s.State.Day.Day = 4;
            int cash = s.State.Wallet.Cash;
            TestFlow.Ok(s.Themes.Unlock(ThemeId.WoodlandCabin));
            Assert.AreEqual(cash - 300, s.State.Wallet.Cash);
            Assert.IsFalse(s.Themes.Select(ThemeId.MedievalCastle).Success);
            TestFlow.Ok(s.Themes.Select(ThemeId.WoodlandCabin));

            cash = s.State.Wallet.Cash;
            var p = BuildToCard(s, 0.5f, inspect: false);
            Assert.AreEqual(ThemeId.WoodlandCabin, p.Theme);
            Assert.AreEqual(cash - ThemeCatalog.Get(ThemeId.WoodlandCabin).ExtraKitCost, s.State.Wallet.Cash, "woodland extras charged at mount");

            TestFlow.Ok(s.Themes.Select(ThemeId.WinterVillage));
            var q = BuildToCard(s, 0.5f, inspect: false);
            Assert.Greater(QualityModel.EstimateValue(p), QualityModel.EstimateValue(q), "woodland sells for more");
        }

        [Test]
        public void MountFails_CleanlyWhenThemeExtrasAreUnaffordable()
        {
            var s = OnDay(4);
            TestFlow.Ok(s.Themes.Unlock(ThemeId.WoodlandCabin));
            TestFlow.Ok(s.Themes.Select(ThemeId.WoodlandCabin));
            var p = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.At(StationId.PrepCradle));
            s.Production.Inject(p, 1f);
            p.Location = ProductLocation.At(StationId.Assembly);
            s.State.Wallet.Cash = 0;
            int kits = s.State.Inventory.GlobeKits;
            Assert.IsFalse(s.Production.Mount(p, 0, 1f).Success);
            Assert.AreEqual(kits, s.State.Inventory.GlobeKits);
            Assert.AreEqual(ProductStage.Prepared, p.Stage);
        }

        [Test]
        public void StoreAppeal_GrowsWithStockedShelves()
        {
            var s = OnDay(4);
            float empty = s.Store.AppealMultiplier();
            for (int i = 0; i < 3; i++) s.Store.Display(BuildToCard(s), i);
            float some = s.Store.AppealMultiplier();
            Assert.Less(empty, some);
            Assert.AreEqual(0.7f, empty, 0.001f);
        }

        [Test]
        public void MoreShoppers_AsTheShopGrows()
        {
            Assert.AreEqual(1, DayProgression.MaxCustomers(1));
            Assert.AreEqual(2, DayProgression.MaxCustomers(3));
            Assert.AreEqual(3, DayProgression.MaxCustomers(5));
        }

#if !UNITY_5_3_OR_NEWER
        [Test]
        public void OrdersAndThemes_SurviveSaveLoad()
        {
            var s = OnDay(4);
            TestFlow.Ok(s.Themes.Unlock(ThemeId.WoodlandCabin));
            TestFlow.Ok(s.Themes.Select(ThemeId.WoodlandCabin));
            var o = s.Orders.OnNewDay()[0];
            TestFlow.Ok(s.Orders.Pin(o.Id));
            var opts = new System.Text.Json.JsonSerializerOptions { IncludeFields = true };
            var loaded = System.Text.Json.JsonSerializer.Deserialize<GameState>(System.Text.Json.JsonSerializer.Serialize(s.State, opts), opts);
            var r = new GameSession(loaded);
            Assert.AreEqual(ThemeId.WoodlandCabin, loaded.ActiveTheme);
            Assert.AreEqual(o.Id, r.Orders.PinnedOrder.Id);
            Assert.AreEqual(OrderService.Describe(o), OrderService.Describe(r.Orders.PinnedOrder));
        }
#endif
    }
}
