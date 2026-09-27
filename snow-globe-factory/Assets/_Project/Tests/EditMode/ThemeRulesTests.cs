using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class ThemeRulesTests
    {
        static GameSession Rich(int day = 20)
        {
            var s = GameSession.NewGame(9);
            s.State.Day.Day = day;
            s.State.Wallet.Cash = 50000;
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 50;
            return s;
        }

        static Product ToSealer(GameSession s, ThemeId theme)
        {
            if (!s.Themes.IsUnlocked(theme)) TestFlow.Ok(s.Themes.Unlock(theme));
            TestFlow.Ok(s.Themes.Select(theme));
            var p = s.State.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.At(StationId.PrepCradle));
            TestFlow.Ok(s.Production.Inject(p, 1f));
            p.Location = ProductLocation.At(StationId.Assembly);
            TestFlow.Ok(s.Production.Mount(p, 0, 1f));
            TestFlow.Ok(s.Production.Decorate(p, 1f, ThemeCatalog.Get(theme).SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            return p;
        }

        [Test]
        public void MedievalCastle_NeedsTheJigForAGoodDome()
        {
            var s = Rich();
            var without = ToSealer(s, ThemeId.MedievalCastle);
            TestFlow.Ok(s.Production.FitDome(without, 0.9f));
            Assert.AreEqual(0.9f - ThemeRules.CastleWithoutJigPenalty, without.DomeScore, 0.001f);

            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.AssemblyJig));
            var with = ToSealer(s, ThemeId.MedievalCastle);
            TestFlow.Ok(s.Production.FitDome(with, 0.7f));
            Assert.AreEqual(0.85f, with.DomeScore, 0.001f, "jig assist, no penalty");

            var winter = ToSealer(s, ThemeId.WinterVillage);
            TestFlow.Ok(s.Production.FitDome(winter, 0.7f));
            Assert.AreEqual(0.85f, winter.DomeScore, 0.001f, "other themes unaffected");
        }

        [Test]
        public void Celestial_CanOnlyBeSealedWithTheImprovedSealer()
        {
            var s = Rich();
            var p = ToSealer(s, ThemeId.CelestialObservatory);
            TestFlow.Ok(s.Production.FitDome(p, 1f));
            var r = s.Production.Seal(p, true);
            Assert.IsFalse(r.Success);
            StringAssert.Contains("Improved Sealer", r.Message);
            Assert.AreEqual(ProductStage.Domed, p.Stage, "nothing lost; it waits for the upgrade");
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.ImprovedSealer));
            TestFlow.Ok(s.Production.Seal(p, true));
        }

        [Test]
        public void Haunted_HidesTwitches_DeepSea_ShowsThem()
        {
            Assert.Less(ThemeCatalog.Get(ThemeId.HauntedManor).MovementVisibility, 1f);
            Assert.Greater(ThemeCatalog.Get(ThemeId.DeepSeaRuins).MovementVisibility, 1f);
            Assert.AreEqual(1f, ThemeCatalog.Get(ThemeId.WinterVillage).MovementVisibility);
        }

        [Test]
        public void EveryTheme_HasThreeSceneryPieces_AndRisingValue()
        {
            float last = 0f;
            foreach (var t in ThemeCatalog.All)
            {
                Assert.AreEqual(3, t.Scenery.Length, t.DisplayName);
                Assert.Greater(t.ValueMultiplier, last, "themes are ordered by value");
                last = t.ValueMultiplier;
            }
        }
    }
}
