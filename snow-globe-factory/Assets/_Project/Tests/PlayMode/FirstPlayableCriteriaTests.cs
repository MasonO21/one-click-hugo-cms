using System.Collections;
using System.Linq;
using NUnit.Framework;
using SnowGlobe.Core;
using UnityEngine;
using UnityEngine.TestTools;

namespace SnowGlobe.Game.Tests
{
    /// <summary>
    /// In-world checks for the first-playable acceptance criteria (DESIGN_PLAN §9) that the core
    /// tests can only cover in simulation: serum expiry, the escape threat, the day loop and settings.
    /// </summary>
    public class FirstPlayableCriteriaTests
    {
        GameObject _boot;

        [SetUp]
        public void SetUp()
        {
            SaveSystem.DirectoryOverride = System.IO.Path.Combine(Application.temporaryCachePath, "CriteriaTestSaves");
            System.IO.Directory.CreateDirectory(SaveSystem.DirectoryOverride);
        }

        [TearDown]
        public void TearDown()
        {
            SaveSystem.DirectoryOverride = null;
            Time.timeScale = 1f;
            if (_boot != null) Object.Destroy(_boot);
            foreach (var v in Object.FindObjectsByType<ProductView>(FindObjectsSortMode.None)) Object.Destroy(v.gameObject);
        }

        IEnumerator Boot()
        {
            _boot = new GameObject("CriteriaTestBootstrap");
            _boot.AddComponent<GameBootstrap>();
            yield return null;
            yield return null;
            GameRoot.I.StartNewGame();
            GameRoot.I.Hud.CloseAllPanels();
            yield return null;
        }

        /// <summary>Waits (in scaled game time) until the condition holds or the limit passes.</summary>
        static IEnumerator WaitFor(System.Func<bool> condition, float limit)
        {
            float t = 0f;
            while (!condition() && t < limit)
            {
                t += Time.deltaTime;
                yield return null;
            }
        }

        // §9.4: the serum warns at 15 s; expiry turns the character loose and catchable, the kit is lost, the character still exists.
        [UnityTest]
        public IEnumerator Serum_WarnsAt15s_ThenWakesLoose_KitLost_CharacterKept()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            var cell = root.Level.Cells.First(c => c.Occupant != null);
            cell.Door.SetOpen(true);
            var v = cell.Occupant;
            var p = v.P;

            v.BeginCarry();
            root.Level.Prep.Socket.Place(v);
            Assert.IsTrue(s.Production.Inject(p, 1f).Success);
            v.BeginCarry();
            root.Level.Assembly.Socket.Place(v);
            int kits = s.State.Inventory.GlobeKits;
            Assert.IsTrue(s.Production.Mount(p, 0, 1f).Success);
            Assert.AreEqual(kits - 1, s.State.Inventory.GlobeKits, "mounting uses a kit");

            p.SerumRemaining = GameBalance.SerumWarningSeconds + 1f;
            Time.timeScale = 4f;
            yield return WaitFor(() => p.SerumWarningSent, 5f);
            Assert.IsTrue(p.SerumWarningSent, "warned");
            Assert.That(p.SerumRemaining, Is.InRange(GameBalance.SerumWarningSeconds - 1f, GameBalance.SerumWarningSeconds));
            Assert.AreEqual(ProductStage.Mounted, p.Stage, "still workable during the warning");

            yield return WaitFor(() => p.Stage == ProductStage.Unprepared, GameBalance.SerumWarningSeconds + 5f);
            Time.timeScale = 1f;
            yield return null;
            Assert.AreEqual(ProductStage.Unprepared, p.Stage, "woke up");
            Assert.AreEqual(1, s.State.Day.Stats.KitsRuined, "the kit is lost");
            Assert.AreEqual(kits - 1, s.State.Inventory.GlobeKits, "and not refunded");
            Assert.IsTrue(s.State.Products.Contains(p), "the character still exists");
            Assert.IsTrue(root.Views.ContainsKey(p.Id) && v != null, "and is still in the world");
            Assert.IsTrue(v.IsEscaped, "loose");
            Assert.AreEqual(LocationKind.Loose, p.Location.Kind);
            Assert.Greater(v.transform.position.y, -1f, "somewhere on the backroom floor, not at the origin or under the map");

            // Catchable: carry them back to a cabinet.
            v.BeginCarry();
            root.Level.FreeCell().Socket.Place(v);
            yield return null;
            Assert.IsFalse(v.IsEscaped);
            Assert.AreEqual(LocationKind.Holding, p.Location.Kind);
        }

        // §9.7: the escape is telegraphed for at least 8 s and produces a recapturable loose character; recapture resolves the threat.
        [UnityTest]
        public IEnumerator Escape_TelegraphedForEightSeconds_ThenLoose_RecaptureResolves()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            root.Player.Teleport(root.Level.PlayerSpawn.position, 0f); // upstairs, far from the cabinets

            root.Horror.ForceThreat(DirectorEventId.EscapeAttempt);
            var cell = root.Horror.ScratchCell;
            Assert.IsNotNull(cell, "a cabinet is picked and announced");
            var v = cell.Occupant;
            Assert.GreaterOrEqual(root.Horror.WarningRemaining, 8f, "at least 8 s of warning");

            float start = Time.time;
            yield return WaitFor(() => v.IsEscaped, 12f);
            Assert.IsTrue(v.IsEscaped, "unattended, they get out");
            Assert.GreaterOrEqual(Time.time - start, 7.9f, "not before the warning ran out");
            Assert.AreEqual(DirectorEventId.EscapeAttempt, s.Director.ActiveThreat, "the threat stays active while they're loose");

            yield return new WaitForSeconds(0.5f);
            v.BeginCarry();
            root.Level.FreeCell().Socket.Place(v);
            yield return null;
            yield return null;
            Assert.IsFalse(v.IsEscaped);
            Assert.AreEqual(DirectorEventId.None, s.Director.ActiveThreat, "recapture resolves it");
        }

        // §9.7: reaching the cabinet during the warning prevents the escape.
        [UnityTest]
        public IEnumerator Escape_PreventedByReachingTheCabinetInTime()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            root.Player.Teleport(root.Level.PlayerSpawn.position, 0f);
            root.Horror.ForceThreat(DirectorEventId.EscapeAttempt);
            var cell = root.Horror.ScratchCell;
            var v = cell.Occupant;

            yield return new WaitForSeconds(2f);
            var at = cell.ScratchPoint.position;
            root.Player.Teleport(new Vector3(at.x, Level.BasementFloorY, at.z), 0f);
            yield return WaitFor(() => root.Horror.Pending == DirectorEventId.None, 2f);
            Assert.AreEqual(DirectorEventId.None, root.Horror.Pending, "the latch holds");
            Assert.AreEqual(DirectorEventId.None, s.Director.ActiveThreat);

            yield return new WaitForSeconds(8f);
            Assert.IsFalse(v.IsEscaped, "and nobody gets out later");
            Assert.AreEqual(cell, v.Socket != null ? v.Socket.GetComponentInParent<HoldingCell>() : null, "still in the same cabinet");
        }

        // §9.11: open, auto-close at 5 pm, summary with bills, next day with a checkpoint.
        [UnityTest]
        public IEnumerator DayLoop_AutoClosesAtFive_BillsAndCheckpointsTheNextDay()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            System.IO.File.Delete(root.Saves.CheckpointPath);

            root.OpenShop();
            Assert.IsTrue(s.Days.IsOpen);
            Assert.IsTrue(root.Level.FrontDoor != null);

            int cash = s.State.Wallet.Cash;
            int bill = DayCycle.OperatingCost(s.State);
            Assert.Greater(bill, 0);
            s.State.Day.ClockMinutes = GameBalance.ClosingHourMinutes - 0.5f;
            float t = 0f;
            while (!root.Hud.SummaryShown && t < 5f)
            {
                root.Customers.DespawnAll(); // an arriving customer would (correctly) hold the door open
                t += Time.deltaTime;
                yield return null;
            }
            Assert.IsTrue(root.Hud.SummaryShown, "end-of-day summary appears");
            Assert.AreEqual(DayPhase.AfterClosing, s.State.Day.Phase);
            Assert.AreEqual(cash - bill, s.State.Wallet.Cash, "bills charged exactly once");

            root.Hud.CloseAllPanels();
            root.StartNextDay();
            Assert.AreEqual(2, s.State.Day.Day);
            Assert.AreEqual(DayPhase.BeforeOpening, s.State.Day.Phase);
            Assert.IsTrue(root.Hud.BriefingShown, "day 2 briefing");
            Assert.IsTrue(System.IO.File.Exists(root.Saves.CheckpointPath), "checkpoint written");
            var cp = root.Saves.Load(root.Saves.CheckpointPath);
            Assert.AreEqual(2, cp.Day.Day);
            Assert.AreEqual(s.State.Wallet.Cash, cp.Wallet.Cash);
        }

        // §9.12: reduced flicker actually tames flickering lights, and the options persist.
        [UnityTest]
        public IEnumerator Settings_ReducedFlickerWorks_AndOptionsPersist()
        {
            string[] keys = { "sgf.subtitles", "sgf.shake", "sgf.reducedFlicker", "sgf.mouse", "sgf.music" };
            var had = keys.Select(PlayerPrefs.HasKey).ToArray();
            Settings.Load(); // capture the player's stored values, not whatever the statics hold
            bool subs = Settings.Subtitles, flicker = Settings.ReducedFlicker;
            float shake = Settings.CameraShake, mouse = Settings.MouseSensitivity, music = Settings.MusicVolume;
            try
            {
                yield return Boot();
                var root = GameRoot.I;
                var light = root.Level.Lights.First(l => l.Area == LightArea.Store);
                var lamp = light.GetComponent<Light>();
                yield return new WaitForSeconds(0.5f);
                float baseIntensity = lamp.intensity;

                Settings.ReducedFlicker = false;
                light.Warning = true;
                float min = float.MaxValue;
                for (float t = 0f; t < 3f; t += Time.deltaTime) { min = Mathf.Min(min, lamp.intensity); yield return null; }
                Assert.Less(min, baseIntensity * 0.5f, "normal flicker dips hard");

                Settings.ReducedFlicker = true;
                yield return new WaitForSeconds(0.5f);
                min = float.MaxValue;
                for (float t = 0f; t < 3f; t += Time.deltaTime) { min = Mathf.Min(min, lamp.intensity); yield return null; }
                Assert.Greater(min, baseIntensity * 0.6f, "reduced flicker only dims gently");
                light.Warning = false;

                Settings.Subtitles = false;
                Settings.CameraShake = 0.25f;
                Settings.MouseSensitivity = 3.5f;
                Settings.MusicVolume = 0.2f;
                Settings.Save();
                Settings.Subtitles = true;
                Settings.ReducedFlicker = false;
                Settings.CameraShake = 1f;
                Settings.Load();
                Assert.IsFalse(Settings.Subtitles);
                Assert.IsTrue(Settings.ReducedFlicker);
                Assert.AreEqual(0.25f, Settings.CameraShake, 1e-4f);
                Assert.AreEqual(3.5f, Settings.MouseSensitivity, 1e-4f);
                Assert.AreEqual(0.2f, Settings.MusicVolume, 1e-4f);
            }
            finally
            {
                // Put the player's own preferences back exactly as they were.
                Settings.Subtitles = subs; Settings.ReducedFlicker = flicker;
                Settings.CameraShake = shake; Settings.MouseSensitivity = mouse; Settings.MusicVolume = music;
                Settings.Save();
                for (int i = 0; i < keys.Length; i++) if (!had[i]) PlayerPrefs.DeleteKey(keys[i]);
                PlayerPrefs.Save();
            }
        }
    }
}
