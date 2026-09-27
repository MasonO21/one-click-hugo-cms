using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    /// <summary>Shaking globes, collectors and daily goals.</summary>
    public class FunFeaturesTests
    {
        static GameSession OnDay(int day, uint seed = 9)
        {
            var s = GameSession.NewGame(seed);
            s.State.Day.Day = day;
            s.State.Wallet.Cash = 5000;
            s.State.Inventory.GlobeKits = s.State.Inventory.SerumCharges = s.State.Inventory.PackagingBoxes = 50;
            return s;
        }

        static Product Displayed(GameSession s, int slot = 0)
        {
            var p = TestFlow.RunToPackaged(s);
            TestFlow.Ok(s.Store.Display(p, slot));
            return p;
        }

        // ------------------------------------------------------------ shaking

        [Test]
        public void Shake_SoundSeal_ShowcasesWithoutRisk_AndRaisesThePrice()
        {
            var s = OnDay(3);
            var p = Displayed(s);
            p.SealIntegrity = 0.95f;
            int before = ReputationService.RetailPrice(s.State, p);
            for (int i = 0; i < 20; i++)
            {
                bool twitched;
                Showcase.Shake(s.State, p, out twitched);
                Assert.IsFalse(twitched, "a sound seal never lets the figure move");
            }
            Assert.AreEqual(Showcase.Seconds, p.ShowcaseRemaining, 1e-3f);
            Assert.AreEqual((int)(QualityModel.EstimateValue(p) * 1.1f + 0.5f), ReputationService.RetailPrice(s.State, p));
            Assert.Greater(ReputationService.RetailPrice(s.State, p), before);

            s.Production.Tick(Showcase.Seconds + 1f, 1f);
            Assert.AreEqual(before, ReputationService.RetailPrice(s.State, p), "the showcase wears off");
        }

        [Test]
        public void Shake_WeakSeal_OftenMovesTheFigure()
        {
            var s = OnDay(3);
            var p = Displayed(s);
            p.SealIntegrity = 0.3f;
            Assert.AreEqual(1f, Showcase.TwitchChance(p), 1e-4f, "very weak: always");
            p.SealIntegrity = GameBalance.DefectRevealThreshold - 0.01f;
            Assert.That(Showcase.TwitchChance(p), Is.InRange(0.5f, 0.6f), "just under the threshold: about even odds");
            Assert.IsFalse(Showcase.CanShake(TestFlow.FirstHolding(s)), "only sealed globes");
        }

        // ------------------------------------------------------------ biting

        [Test]
        public void Bite_OnlyAHeldCharacter_RemovesIt_AndUnsettlesTheRest()
        {
            var s = OnDay(3);
            var p = TestFlow.FirstHolding(s);
            Assert.IsFalse(s.Production.Bite(p).Success, "not while it's sitting in a cabinet");
            p.Location = ProductLocation.Carried();
            Assert.IsTrue(ProductionService.CanBite(p));
            var others = s.State.Products.FindAll(o => o != p);
            float stressBefore = others[0].Stress;
            int count = s.State.Products.Count;

            TestFlow.Ok(s.Production.Bite(p));
            Assert.AreEqual(count - 1, s.State.Products.Count, "gone for good");
            Assert.IsNull(s.State.Find(p.Id));
            Assert.AreEqual(1, s.State.Day.Stats.CharactersEaten);
            Assert.AreEqual(stressBefore + ProductionService.BiteStress, others[0].Stress, 1e-4f, "the others get restless");
            Assert.IsFalse(s.Production.Bite(p).Success, "only once");
        }

        [Test]
        public void Bite_NeverOnAGlobe()
        {
            var s = OnDay(3);
            var g = Displayed(s);
            g.Location = ProductLocation.Carried();
            Assert.IsFalse(ProductionService.CanBite(g), "a mounted or sealed figure can't be bitten");
        }

        [Test]
        public void WitnessingABite_AlarmsInstantly()
        {
            var sus = new CustomerSuspicion();
            Assert.IsTrue(sus.Witness(EvidenceType.WitnessedBite, 1f, 1f, -1));
            Assert.AreEqual(SuspicionStage.Alarmed, sus.Stage);
            Assert.IsTrue(sus.SawUndeniable);
        }

        // ------------------------------------------------------------ collectors

        [Test]
        public void Collectors_OnlyFromDay6_AndWantSomethingSpecific()
        {
            var rng = new DeterministicRandom(4);
            var early = OnDay(5);
            for (int i = 0; i < 200; i++) Assert.IsNull(Collectors.Roll(early.State, rng));

            var s = OnDay(12);
            s.State.UnlockedThemes.Add(ThemeId.WoodlandCabin);
            int collectors = 0;
            for (int i = 0; i < 1000; i++)
            {
                var r = Collectors.Roll(s.State, rng);
                if (r == null) continue;
                collectors++;
                if (r.ByArchetype) Assert.AreNotEqual(ArchetypeId.SleepyOne, r.Archetype);
                else Assert.AreEqual(ThemeId.WoodlandCabin, r.Theme);
            }
            Assert.That(collectors, Is.InRange(100, 200), "about 15% of walk-ins");
        }

        [Test]
        public void Collector_PaysDoubleForAMatch()
        {
            var s = OnDay(12);
            var p = Displayed(s);
            var want = new CollectorRequest { ByArchetype = true, Archetype = p.Archetype };
            Assert.IsTrue(Collectors.Matches(want, p));
            Assert.IsFalse(Collectors.Matches(new CollectorRequest { ByArchetype = true, Archetype = ArchetypeId.Watcher }, p));
            int retail = ReputationService.RetailPrice(s.State, p);
            TestFlow.Ok(s.Store.Reserve(p, 3));
            ActionResult r;
            Assert.AreEqual((int)(retail * Collectors.Premium + 0.5f), s.Store.CompleteSale(p, 3, out r, Collectors.Premium));
        }

        // ------------------------------------------------------------ daily goals

        [Test]
        public void Goals_ThreeEachMorning_Deterministic()
        {
            var a = OnDay(1, 21);
            Assert.AreEqual(GoalRules.PerDay, a.State.Goals.Today.Count, "a new game starts with day 1's goals");
            var b1 = OnDay(1, 5);
            var b2 = OnDay(1, 5);
            foreach (var s in new[] { b1, b2 })
            {
                s.State.Day.Day = 9;
                s.State.UnlockedThemes.Add(ThemeId.WoodlandCabin);
                GoalRules.NewDay(s.State);
            }
            Assert.AreEqual(3, b1.State.Goals.Today.Count);
            for (int i = 0; i < 3; i++) Assert.AreEqual(b1.State.Goals.Today[i].Kind, b2.State.Goals.Today[i].Kind, "same seed, same goals");
            Assert.AreEqual(3, b1.State.Goals.Today.ConvertAll(g => g.Kind).FindAll(k => true).Count);
            var kinds = new System.Collections.Generic.HashSet<GoalKind>(b1.State.Goals.Today.ConvertAll(g => g.Kind));
            Assert.AreEqual(3, kinds.Count, "no duplicate goals");
        }

        [Test]
        public void Goals_SalesComplete_PayOnce_AndStreakBonusNeedsAll()
        {
            var s = OnDay(1, 21);
            var goals = s.State.Goals.Today;
            var sell = goals.Find(g => g.Kind == GoalKind.SellGlobes);
            Assert.IsNotNull(sell);
            TestFlow.Ok(s.Days.OpenStore());
            int cash = s.State.Wallet.Cash;
            for (int i = 0; i < sell.Target; i++)
            {
                var p = Displayed(s, i);
                TestFlow.Ok(s.Store.Reserve(p, 10 + i));
                ActionResult r;
                cash += s.Store.CompleteSale(p, 10 + i, out r);
            }
            Assert.IsTrue(sell.Done);
            Assert.AreEqual(cash + sell.Reward, s.State.Wallet.Cash - OtherRewards(goals, sell), "reward paid on completion");
            Assert.IsNotEmpty(GoalRules.Messages(s.State));

            // Force the rest done except one: no streak.
            foreach (var g in goals) if (g != sell && g.Kind != GoalKind.CalmDay) g.Done = true;
            GoalRules.OnUnsettledCustomer(s.State);
            s.Days.CloseStore();
            Assert.AreEqual(0, s.State.Goals.Streak, "a missed goal breaks the streak");
            Assert.AreEqual(0, s.State.Goals.LastBonus);
        }

        [Test]
        public void Goals_CalmDay_CountsAtClose_AndStreakPays()
        {
            var s = OnDay(1, 21);
            foreach (var g in s.State.Goals.Today) if (g.Kind != GoalKind.CalmDay) g.Done = true;
            TestFlow.Ok(s.Days.OpenStore());
            s.State.Day.Stats.GlobesSold = 1;
            int cash = s.State.Wallet.Cash;
            var summary = s.Days.CloseStore();
            var calm = s.State.Goals.Today.Find(g => g.Kind == GoalKind.CalmDay);
            Assert.IsTrue(calm.Done, "nobody left unsettled and something sold");
            Assert.AreEqual(1, s.State.Goals.Streak);
            Assert.AreEqual(GoalRules.StreakStep, summary.GoalBonus);
            Assert.AreEqual(3, summary.GoalsDone);
            Assert.AreEqual(cash + calm.Reward + GoalRules.StreakStep - summary.OperatingCost, s.State.Wallet.Cash);

            TestFlow.Ok(s.Days.StartNextDay());
            Assert.AreEqual(2, s.State.Goals.Day, "fresh goals each morning");
            Assert.IsTrue(s.State.Goals.Today.TrueForAll(g => !g.Done));
        }

        static int OtherRewards(System.Collections.Generic.List<DailyGoal> goals, DailyGoal except)
        {
            int n = 0;
            foreach (var g in goals) if (g != except && g.Done) n += g.Reward;
            return n;
        }
    }
}
