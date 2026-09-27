using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class SuspicionTests
    {
        [Test]
        public void FirstSmallMovement_ReadsAsAMechanicalFeature()
        {
            var c = new CustomerSuspicion();
            c.Witness(EvidenceType.GlobeMovement, 0.4f, 1f, 10);
            Assert.AreEqual(SuspicionStage.Comfortable, c.Stage);
            Assert.IsFalse(c.SawUndeniable);
        }

        [Test]
        public void RepeatedClearEvidence_Escalates_ToAlarmed()
        {
            var c = new CustomerSuspicion();
            SuspicionStage last = c.Stage;
            for (int i = 0; i < 6; i++)
            {
                c.Witness(EvidenceType.GlobeMovement, 0.9f, 1f, 10);
                Assert.GreaterOrEqual((int)c.Stage, (int)last);
                last = c.Stage;
            }
            Assert.AreEqual(SuspicionStage.Alarmed, c.Stage);
            Assert.IsTrue(c.SawUndeniable);
        }

        [Test]
        public void NoEvidence_NeverRaisesSuspicion()
        {
            var c = new CustomerSuspicion();
            for (int i = 0; i < 1000; i++) c.Tick(0.1f);
            Assert.AreEqual(0f, c.Value);
        }

        [Test]
        public void Distraction_Helps_ButCannotEraseUndeniableEvidence()
        {
            var c = new CustomerSuspicion();
            c.Witness(EvidenceType.EscapedCharacter, 1f, 1f, 3);
            float floor = c.Floor;
            Assert.Greater(floor, 0f);
            Assert.IsTrue(c.TryDistract());
            Assert.GreaterOrEqual(c.Value, floor);
            Assert.IsFalse(c.TryDistract(), "cooldown");
            for (int i = 0; i < 1000; i++) c.Tick(0.1f);
            Assert.GreaterOrEqual(c.Value, floor);
        }

        [Test]
        public void MildCuriosity_FadesOverTime()
        {
            var c = new CustomerSuspicion();
            c.Witness(EvidenceType.StaffDoorNoise, 1f, 1f, -1);
            c.Witness(EvidenceType.StaffDoorNoise, 1f, 1f, -1);
            c.Witness(EvidenceType.EyesFollowing, 1f, 1f, 4);
            Assert.Greater(c.Value, 0f);
            for (int i = 0; i < 1000; i++) c.Tick(0.1f);
            Assert.AreEqual(0f, c.Value, 0.001f);
        }

        [Test]
        public void RemovingTheSuspiciousGlobe_OnlyHelpsIfItWasTheFocus()
        {
            var c = new CustomerSuspicion();
            for (int i = 0; i < 3; i++) c.Witness(EvidenceType.GlobeMovement, 0.6f, 1f, 42);
            Assert.GreaterOrEqual((int)c.Stage, (int)SuspicionStage.Curious);
            float before = c.Value;
            c.SourceRemoved(99);
            Assert.AreEqual(before, c.Value);
            c.SourceRemoved(42);
            Assert.Less(c.Value, before);
        }

        [Test]
        public void AlarmedCustomers_CannotBeCalmed()
        {
            var c = new CustomerSuspicion();
            c.Witness(EvidenceType.EscapedCharacter, 1f, 1f, 1);
            c.Witness(EvidenceType.UnpreparedCarriedInPublic, 1f, 1f, 1);
            Assert.AreEqual(SuspicionStage.Alarmed, c.Stage);
            Assert.IsFalse(c.TryDistract());
            Assert.IsFalse(c.TryOfferExchange());
        }

        [Test]
        public void Perception_ScalesEvidence()
        {
            var near = new CustomerSuspicion();
            var far = new CustomerSuspicion();
            near.Witness(EvidenceType.MuffledVoice, 1f, 1f, 1);
            far.Witness(EvidenceType.MuffledVoice, 1f, 0.2f, 1);
            Assert.Greater(near.Value, far.Value);
            var none = new CustomerSuspicion();
            none.Witness(EvidenceType.MuffledVoice, 1f, 0f, 1);
            Assert.AreEqual(0f, none.Value);
        }

        [Test]
        public void Closure_RequiresAnEarlierWarning()
        {
            var e = new BusinessExposure { Value = 100f, SeriousIncidents = 3, IncidentsToday = 1 };
            Assert.AreEqual(ClosureVerdict.Warning, e.EndOfDay());
            e.Value = 100f;
            e.IncidentsToday = 1;
            Assert.AreEqual(ClosureVerdict.Closure, e.EndOfDay());
        }

        [Test]
        public void CleanDays_ReduceExposure()
        {
            var e = new BusinessExposure { Value = 30f };
            e.EndOfDay();
            Assert.Less(e.Value, 30f);
        }

        [Test]
        public void AlarmedCustomerLeaving_IsASeriousIncident()
        {
            var e = new BusinessExposure();
            e.OnCustomerLeft(SuspicionStage.Alarmed, true);
            Assert.AreEqual(1, e.SeriousIncidents);
            Assert.Greater(e.Value, 10f);
        }
    }

    public class DirectorTests
    {
        static DirectorContext Ctx(PlayerArea area = PlayerArea.Storefront, int crises = 0)
        {
            return new DirectorContext { Day = 2, DisplayedGlobes = 2, HoldingCharacters = 3, PlayerArea = area, ActiveCrises = crises, ScriptedThreat = DirectorEventId.None };
        }

        [Test]
        public void Rhythm_CalmThenUneaseThenOneThreatThenRelief()
        {
            var d = new EventDirector(new EventDirectorState(), new DeterministicRandom(5));
            Assert.AreEqual(TensionPhase.Calm, d.Phase);

            int atmospherics = 0;
            DirectorEventId threat = DirectorEventId.None;
            for (int i = 0; i < 400 && threat == DirectorEventId.None; i++)
            {
                var ev = d.Tick(1f, Ctx());
                if (ev == DirectorEventId.None) continue;
                if (DirectorEventCatalog.Get(ev).Kind == DirectorEventKind.Atmospheric) atmospherics++;
                else threat = ev;
            }
            Assert.Greater(atmospherics, 0, "unease before emergency");
            Assert.AreNotEqual(DirectorEventId.None, threat);
            Assert.AreEqual(TensionPhase.Emergency, d.Phase);

            for (int i = 0; i < 100; i++) Assert.AreEqual(DirectorEventId.None, d.Tick(1f, Ctx()), "nothing stacks on an emergency");

            d.ResolveThreat();
            d.Tick(1f, Ctx());
            Assert.AreEqual(TensionPhase.Relief, d.Phase);
            for (int i = 0; i < (int)EventDirector.ReliefSeconds - 1; i++) Assert.AreEqual(DirectorEventId.None, d.Tick(1f, Ctx()));
        }

        [Test]
        public void NaturalCrisis_SuppressesDirectorThreats()
        {
            var d = new EventDirector(new EventDirectorState { Tension = 1f }, new DeterministicRandom(5));
            for (int i = 0; i < 200; i++) Assert.AreEqual(DirectorEventId.None, d.Tick(1f, Ctx(crises: 1)));
            Assert.AreEqual(TensionPhase.Emergency, d.Phase);
            d.Tick(1f, Ctx(crises: 0));
            Assert.AreEqual(TensionPhase.Relief, d.Phase);
        }

        [Test]
        public void DayOne_HasNoThreats()
        {
            var d = new EventDirector(new EventDirectorState(), new DeterministicRandom(5));
            var ctx = Ctx();
            ctx.Day = 1;
            for (int i = 0; i < 3000; i++)
            {
                var ev = d.Tick(1f, ctx);
                if (ev != DirectorEventId.None) Assert.AreEqual(DirectorEventKind.Atmospheric, DirectorEventCatalog.Get(ev).Kind);
            }
        }

        [Test]
        public void Atmospherics_RespectConditions()
        {
            var d = new EventDirector(new EventDirectorState { Tension = 0.5f }, new DeterministicRandom(9));
            var ctx = Ctx(PlayerArea.Basement);
            ctx.HoldingCharacters = 0;
            for (int i = 0; i < 600; i++)
            {
                var ev = d.Tick(1f, ctx);
                Assert.AreNotEqual(DirectorEventId.BasementLookToCorner, ev);
                Assert.AreNotEqual(DirectorEventId.GlobeTurnsToPlayer, ev);
                if (d.Phase == TensionPhase.Emergency) d.ResolveThreat();
            }
        }

        [Test]
        public void DayFive_ScriptsOnePowerFailure()
        {
            var s = GameSession.NewGame(1);
            s.State.Day.Day = 5;
            s.Days.OpenStore();
            s.State.Day.ClockMinutes = GameBalance.OpeningHourMinutes + 95f;
            var ev = s.TickDirector(0.1f, Ctx());
            Assert.AreEqual(DirectorEventId.PowerFailure, ev);
            Assert.IsTrue(s.State.Day.ScriptedIncidentDone);
            s.Director.ResolveThreat();
            for (int i = 0; i < 100; i++) Assert.AreNotEqual(DirectorEventId.PowerFailure, s.TickDirector(1f, Ctx()));
        }
    }
}
