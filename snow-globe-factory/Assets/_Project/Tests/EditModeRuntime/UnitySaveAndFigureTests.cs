using NUnit.Framework;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game.Tests
{
    /// <summary>Unity-only checks: the real JsonUtility save path, and that figures build without errors.</summary>
    public class UnitySaveAndFigureTests
    {
        [Test]
        public void JsonUtility_RoundTrip_PreservesEverythingThatMatters()
        {
            var session = GameSession.NewGame(4242);
            var s = session.State;
            s.Day.Day = 6;
            s.Wallet.Cash = 777;
            s.Wallet.Debt = 40;
            s.OwnedUpgrades.Add(UpgradeId.ShortConveyor);
            s.OwnedUpgrades.Add(UpgradeId.AutoPrepStation);
            s.InvalidateModifiers();
            var a = s.Products[0];
            a.Location = ProductLocation.OnConveyor(0.42f);
            a.Stage = ProductStage.Sealed;
            a.SealIntegrity = 0.55f;
            var b = s.Products[1];
            b.Location = ProductLocation.InHopper(3);
            var c = s.Products[2];
            c.Stage = ProductStage.Prepared;
            c.SerumRemaining = 23.5f;
            c.Location = ProductLocation.At(StationId.PrepCradle);
            session.Automation.Get(MachineId.Conveyor).Condition = 0.61f;
            session.Automation.Get(MachineId.AutoPrep).Enabled = false;
            s.Exposure.Value = 37f;
            uint rng = s.Rng.State;

            var saves = new SaveSystem();
            var loaded = saves.Deserialize(saves.Serialize(s));
            var restored = new GameSession(loaded);

            Assert.AreEqual(6, loaded.Day.Day);
            Assert.AreEqual(777, loaded.Wallet.Cash);
            Assert.AreEqual(40, loaded.Wallet.Debt);
            Assert.IsTrue(restored.Upgrades.Owns(UpgradeId.ShortConveyor));
            Assert.AreEqual(s.Products.Count, loaded.Products.Count);
            var la = loaded.Find(a.Id);
            Assert.AreEqual(LocationKind.Conveyor, la.Location.Kind);
            Assert.AreEqual(0.42f, la.Location.X, 0.0001f);
            Assert.AreEqual(0.55f, la.SealIntegrity, 0.0001f);
            Assert.AreEqual(LocationKind.Hopper, loaded.Find(b.Id).Location.Kind);
            Assert.AreEqual(23.5f, loaded.Find(c.Id).SerumRemaining, 0.0001f);
            Assert.AreEqual(a.CharacterName, la.CharacterName);
            Assert.AreEqual(0.61f, restored.Automation.Get(MachineId.Conveyor).Condition, 0.0001f);
            Assert.IsFalse(restored.Automation.Get(MachineId.AutoPrep).Enabled);
            Assert.AreEqual(37f, loaded.Exposure.Value, 0.0001f);
            Assert.AreEqual(rng, loaded.Rng.State);
            Assert.AreEqual(DirectorEventId.None, loaded.Director.ActiveThreat);
        }

        [Test]
        public void MiniFigure_BuildsTheReferenceLook()
        {
            var go = new GameObject("FigureTest");
            try
            {
                var body = go.AddComponent<MiniCharacterBody>();
                body.Build(7, ArchetypeId.SleepyOne);
                Assert.Greater(go.GetComponentsInChildren<Renderer>().Length, 30, "hat, scarf, coat, face...");
                Assert.IsNotNull(go.transform.Find("Hips/Head/HatSeg0"), "floppy hat chain");
                Assert.IsNotNull(go.transform.Find("Hips/ScarfTail"), "swinging scarf tail");
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }
    }
}
