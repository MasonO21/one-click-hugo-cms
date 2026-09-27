using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class StoryAndLateGameTests
    {
        static GameSession OnDay(int day, int cash = 20000)
        {
            var s = GameSession.NewGame(21);
            s.State.Day.Day = day;
            s.State.Wallet.Cash = cash;
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 50;
            return s;
        }

        /// <summary>A carefully made, inspected, boxed globe.</summary>
        static Product Boxed(GameSession s, ArchetypeId archetype, ThemeId theme)
        {
            if (!s.Themes.IsUnlocked(theme)) TestFlow.Ok(s.Themes.Unlock(theme));
            TestFlow.Ok(s.Themes.Select(theme));
            var p = s.State.AddCharacter(archetype, ProductLocation.At(StationId.PrepCradle));
            TestFlow.Ok(s.Production.Inject(p, 1f));
            p.Location = ProductLocation.At(StationId.Assembly);
            var card = AssemblyCard.For(s.State, p);
            TestFlow.Ok(s.Production.Mount(p, card.Pose, 1f));
            p.DecorationCode = card.SceneryCode;
            TestFlow.Ok(s.Production.Decorate(p, 1f, ThemeCatalog.Get(theme).SnowTarget));
            p.Location = ProductLocation.At(StationId.Sealer);
            TestFlow.Ok(s.Production.FitDome(p, 1f));
            TestFlow.Ok(s.Production.Seal(p, true));
            p.Location = ProductLocation.At(StationId.Inspection);
            s.Production.Inspect(p);
            p.Location = ProductLocation.At(StationId.Packaging);
            TestFlow.Ok(s.Production.Package(p, 1f));
            return p;
        }

        static Product DecoratedAtSealer(GameSession s, ThemeId theme)
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

        // ------------------------------------------------------------------ the ledger

        [Test]
        public void LedgerRequests_ArriveOnTheirDay_AndWait()
        {
            var s = OnDay(7);
            Assert.IsFalse(s.Story.RequestOpen);
            Assert.IsNull(s.Story.MorningNote());
            Assert.IsFalse(s.Story.Pay().Success);
            s.State.Day.Day = 8;
            Assert.IsTrue(s.Story.RequestOpen);
            StringAssert.Contains("$400", s.Story.MorningNote());
            s.State.Day.Day = 11;
            Assert.IsTrue(s.Story.RequestOpen, "an unanswered request stays open");
            Assert.IsNull(s.Story.MorningNote(), "the envelope is only announced once");
        }

        [Test]
        public void Dues_MakeCharactersCheaper()
        {
            var s = OnDay(8);
            int full = StoryRules.CharacterCost(s.State, ArchetypeId.Performer);
            int cash = s.State.Wallet.Cash;
            TestFlow.Ok(s.Story.Pay());
            Assert.AreEqual(cash - 400, s.State.Wallet.Cash);
            Assert.AreEqual(1, s.State.Story.Chapter);
            int discounted = StoryRules.CharacterCost(s.State, ArchetypeId.Performer);
            Assert.Less(discounted, full);
            cash = s.State.Wallet.Cash;
            TestFlow.Ok(s.Supply.OrderCharacter(ArchetypeId.Performer));
            Assert.AreEqual(cash - discounted, s.State.Wallet.Cash, "orders are charged the discounted price");
        }

        [Test]
        public void Payment_FailsCleanly_WhenBrokeOrWhenAGlobeIsWanted()
        {
            var s = OnDay(8, cash: 100);
            Assert.IsFalse(s.Story.Pay().Success);
            Assert.AreEqual(100, s.State.Wallet.Cash);
            Assert.AreEqual(0, s.State.Story.Chapter);

            s.State.Wallet.Cash = 5000;
            TestFlow.Ok(s.Story.Pay());
            s.State.Day.Day = 12;
            var r = s.Story.Pay();
            Assert.IsFalse(r.Success);
            StringAssert.Contains("lift crate", r.Message);
            Assert.AreEqual(1, s.State.Story.Chapter);
        }

        [Test]
        public void SampleGlobe_GoesDownTheLift_ForDoublePrice()
        {
            var s = OnDay(8);
            TestFlow.Ok(s.Story.Pay());
            s.State.Day.Day = 12;

            string reason;
            var sleepy = Boxed(s, ArchetypeId.SleepyOne, ThemeId.WinterVillage);
            Assert.IsFalse(s.Story.CanSend(sleepy, out reason));
            StringAssert.Contains("Performer", reason);

            var performer = Boxed(s, ArchetypeId.Performer, ThemeId.WinterVillage);
            Assert.GreaterOrEqual(QualityModel.Tier(QualityModel.Compute(performer)), QualityTier.Fine, "precondition");
            Assert.IsTrue(s.Story.CanSend(performer, out reason), reason);
            int value = QualityModel.EstimateValue(performer);
            int cash = s.State.Wallet.Cash;
            ActionResult result;
            int paid = s.Story.SendGlobe(performer, out result);
            TestFlow.Ok(result);
            Assert.AreEqual(value * 2, paid);
            Assert.AreEqual(cash + paid, s.State.Wallet.Cash);
            Assert.AreEqual(ProductStage.Sold, performer.Stage);
            Assert.AreEqual(LocationKind.Gone, performer.Location.Kind);
            Assert.AreEqual(2, s.State.Story.Chapter);

            Assert.IsFalse(s.Story.CanSend(sleepy, out reason), "the crate is one-way again");
        }

        [Test]
        public void MachineOil_HalvesMachineWear()
        {
            var s = OnDay(16);
            s.State.Story.Chapter = StoryRules.OilChapter;
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.PackagingMachine));
            Assert.AreEqual(1f, StoryRules.WearMultiplier(s.State));
            TestFlow.Ok(s.Story.Pay());
            Assert.AreEqual(0.5f, StoryRules.WearMultiplier(s.State));

            var p = Boxed(s, ArchetypeId.SleepyOne, ThemeId.WinterVillage);
            p.Stage = ProductStage.Inspected; // unbox it again so the machine has something to package
            s.State.Inventory.PackagingBoxes = 5;
            for (int i = 0; i < 20; i++) s.Automation.Tick(0.5f, true);
            Assert.AreEqual(ProductStage.Packaged, p.Stage);
            Assert.AreEqual(1f - AutomationService.WearPerItem * 0.5f, s.Automation.Get(MachineId.PackagingMachine).Condition, 0.0001f);
        }

        [Test]
        public void LastPage_NeedsAChoice_AndEachEndingChangesTheShop()
        {
            var signed = OnDay(28);
            signed.State.Story.Chapter = LedgerCatalog.Count - 1;
            Assert.IsTrue(signed.Story.IsFinal(signed.Story.Current));
            Assert.IsFalse(signed.Story.Pay().Success, "must sign or tear");
            int cash = signed.State.Wallet.Cash;
            TestFlow.Ok(signed.Story.Pay(LedgerEnding.Signed));
            Assert.AreEqual(cash - 4000, signed.State.Wallet.Cash);
            Assert.IsTrue(signed.Story.Finished);
            Assert.IsNull(signed.Story.Current);
            Assert.AreEqual(0.6f, StoryRules.CharacterCostMultiplier(signed.State), 0.0001f);
            Assert.IsFalse(signed.Story.Pay(LedgerEnding.Torn).Success, "the ledger is closed");

            var torn = OnDay(28);
            torn.State.Story.Chapter = LedgerCatalog.Count - 1;
            torn.State.Exposure.Value = 60f;
            TestFlow.Ok(torn.Story.Pay(LedgerEnding.Torn));
            Assert.AreEqual(0f, torn.State.Exposure.Value);
            Assert.AreEqual(1.25f, StoryRules.CharacterCostMultiplier(torn.State), 0.0001f);
        }

        [Test]
        public void LedgerLog_ShowsRepliesOnlyForAnsweredRequests()
        {
            var s = OnDay(12);
            var log = s.Story.Log();
            Assert.AreEqual(1, log.Count, "dues asked, not yet answered; the day-12 request waits behind it");
            TestFlow.Ok(s.Story.Pay());
            log = s.Story.Log();
            Assert.AreEqual(3, log.Count);
            StringAssert.Contains("Reply", log[1]);
            StringAssert.Contains("Sample", log[2]);
        }

        [Test]
        public void SaveRepair_KeepsTheStoryConsistent()
        {
            var s = OnDay(10);
            s.State.Story.Chapter = 99;
            s.State.Story.Ending = LedgerEnding.None;
            var log = SaveValidator.Repair(s.State);
            Assert.AreEqual(LedgerCatalog.Count, s.State.Story.Chapter);
            Assert.AreEqual(LedgerEnding.Signed, s.State.Story.Ending);
            Assert.IsNotEmpty(log);

            s.State.Story.Chapter = 1;
            s.State.Story.Ending = LedgerEnding.Torn;
            SaveValidator.Repair(s.State);
            Assert.AreEqual(LedgerEnding.None, s.State.Story.Ending);

            s.State.Story = null;
            SaveValidator.Repair(s.State);
            Assert.IsNotNull(s.State.Story);
        }

        // ------------------------------------------------------------------ late-game upgrades

        [Test]
        public void SealingPress_DomesAndSealsWithoutThePlayer()
        {
            var s = OnDay(20);
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.SealingPress));
            var p = DecoratedAtSealer(s, ThemeId.WinterVillage);
            s.Automation.Tick(AutomationService.PressSeconds + 0.1f, true);
            Assert.AreEqual(ProductStage.Domed, p.Stage);
            Assert.AreEqual(AutomationService.PressDomeScore, p.DomeScore, 0.001f, "no jig, no assist");
            s.Automation.Tick(AutomationService.PressSeconds + 0.1f, true);
            Assert.AreEqual(ProductStage.Sealed, p.Stage);
            Assert.AreEqual(2, s.Automation.Get(MachineId.SealingPress).ItemsProcessed);
        }

        [Test]
        public void SealingPress_StopsForManualOverride_PowerCuts_AndCelestialWithoutTheSealer()
        {
            var s = OnDay(20);
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.SealingPress));
            var p = DecoratedAtSealer(s, ThemeId.WinterVillage);
            TestFlow.Ok(s.Automation.SetEnabled(MachineId.SealingPress, false));
            s.Automation.Tick(10f, true);
            Assert.AreEqual(ProductStage.Decorated, p.Stage, "manual mode leaves it to the player");
            TestFlow.Ok(s.Automation.SetEnabled(MachineId.SealingPress, true));
            s.Automation.Tick(10f, false);
            Assert.AreEqual(ProductStage.Decorated, p.Stage, "no power, no press");

            p.Location = ProductLocation.Holding(0);
            var celestial = DecoratedAtSealer(s, ThemeId.CelestialObservatory);
            bool blocked = false;
            for (int i = 0; i < 4; i++)
                foreach (var e in s.Automation.Tick(AutomationService.PressSeconds + 0.1f, true))
                    if (e.Type == AutomationEventType.Blocked && e.Message.Contains("Improved Sealer")) blocked = true;
            Assert.AreEqual(ProductStage.Domed, celestial.Stage, "domed, then it waits");
            Assert.IsTrue(blocked, "the panel says why");
        }

        [Test]
        public void FuseBox_RaisesPowerCapacity()
        {
            var s = OnDay(20);
            foreach (var id in new[] { UpgradeId.ShortConveyor, UpgradeId.ImprovedSealer, UpgradeId.PackagingMachine, UpgradeId.AutoPrepStation })
                TestFlow.Ok(s.Upgrades.Purchase(id));
            Assert.IsTrue(s.State.Modifiers.IsOverPowered);
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.RewiredFuseBox));
            Assert.IsFalse(s.State.Modifiers.IsOverPowered);
            Assert.AreEqual(GameBalance.BasePowerCapacity + 5, s.State.Modifiers.PowerCapacity);
        }

        [Test]
        public void NightlyBills_IncludeElectricity()
        {
            var s = OnDay(20);
            Assert.AreEqual(GameBalance.DailyOperatingCost, DayCycle.OperatingCost(s.State));
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.AutoPrepStation));
            int expected = GameBalance.DailyOperatingCost + 2 * GameBalance.ElectricityPerPowerUnit;
            Assert.AreEqual(expected, DayCycle.OperatingCost(s.State));
            TestFlow.Ok(s.Days.OpenStore());
            int cash = s.State.Wallet.Cash;
            var summary = s.Days.CloseStore();
            Assert.AreEqual(expected, summary.OperatingCost);
            Assert.AreEqual(cash - expected, s.State.Wallet.Cash);
        }

        [Test]
        public void WindowDisplay_BringsMoreWalkIns()
        {
            var s = OnDay(20);
            float before = s.Store.WalkInMultiplier();
            TestFlow.Ok(s.Upgrades.Purchase(UpgradeId.WindowDisplay));
            Assert.AreEqual(before * 1.25f, s.Store.WalkInMultiplier(), 0.0001f);
        }

#if !UNITY_5_3_OR_NEWER
        [Test]
        public void Story_SurvivesSaveLoad()
        {
            var s = OnDay(28);
            s.State.Story.Chapter = LedgerCatalog.Count - 1;
            TestFlow.Ok(s.Story.Pay(LedgerEnding.Torn));
            var opts = new System.Text.Json.JsonSerializerOptions { IncludeFields = true };
            var loaded = System.Text.Json.JsonSerializer.Deserialize<GameState>(System.Text.Json.JsonSerializer.Serialize(s.State, opts), opts);
            var r = new GameSession(loaded);
            Assert.AreEqual(LedgerEnding.Torn, loaded.Story.Ending);
            Assert.IsTrue(r.Story.Finished);
            Assert.AreEqual(1.25f, StoryRules.CharacterCostMultiplier(loaded), 0.0001f);
        }
#endif
    }
}
