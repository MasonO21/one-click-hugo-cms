using System.Collections;
using System.Linq;
using NUnit.Framework;
using SnowGlobe.Core;
using UnityEngine;
using UnityEngine.TestTools;

namespace SnowGlobe.Game.Tests
{
    /// <summary>
    /// Boots the real prototype in play mode and drives it through code (not input). Any exception
    /// or error log during these frames fails the test, which is the main point: catching runtime
    /// errors that a compile check cannot.
    /// </summary>
    public class PrototypeSmokeTests
    {
        GameObject _boot;

        IEnumerator Boot()
        {
            _boot = new GameObject("SmokeTestBootstrap");
            _boot.AddComponent<GameBootstrap>();
            yield return null; // Start() builds everything
            yield return null;
            Assert.IsNotNull(GameRoot.I, "GameRoot booted");
            GameRoot.I.StartNewGame();
            GameRoot.I.Hud.CloseAllPanels();
            yield return null;
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            if (_boot != null) Object.Destroy(_boot);
            foreach (var v in Object.FindObjectsByType<ProductView>(FindObjectsSortMode.None)) Object.Destroy(v.gameObject);
        }

        [UnityTest]
        public IEnumerator Boot_BuildsAllThreeRooms_AndSpawnsEveryProduct()
        {
            yield return Boot();
            var root = GameRoot.I;
            Assert.AreEqual(10, root.Level.Cells.Count, "glass cabinet cells");
            Assert.AreEqual(GameBalance.BaseShelfCapacity + 4, root.Level.ShelfSlots.Count, "display slots");
            Assert.AreEqual(5, root.Level.Stations.Count(), "production stations");
            Assert.AreEqual(root.Session.State.Products.Count(p => p.Stage != ProductStage.Sold), root.Views.Count, "one view per product");
            Assert.AreEqual(GameBalance.StartingCharacters, root.Level.Cells.Count(c => c.Occupant != null), "starting stock sits in cabinets");
            for (int i = 0; i < 30; i++) yield return null; // let every Update run for a while
        }

        [UnityTest]
        public IEnumerator FullManualLine_FromCabinet_ToSale()
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
            yield return null;

            v.BeginCarry();
            root.Level.Assembly.Socket.Place(v);
            Assert.IsTrue(s.Production.Mount(p, 0, 1f).Success);
            p.DecorationCode = 0;
            Assert.IsTrue(s.Production.Decorate(p, 1f, GameBalance.SnowTarget).Success);
            yield return null;

            v.BeginCarry();
            root.Level.Sealer.Socket.Place(v);
            Assert.IsTrue(s.Production.FitDome(p, 1f).Success);
            Assert.IsTrue(s.Production.Seal(p, true).Success);
            yield return null;

            v.BeginCarry();
            root.Level.Packaging.Socket.Place(v);
            Assert.IsTrue(s.Production.Package(p, 1f).Success);
            yield return null;

            v.BeginCarry();
            root.Level.ShelfSlots[0].Socket.Place(v);
            Assert.AreEqual(ProductStage.Displayed, p.Stage);
            yield return null;

            int cash = s.State.Wallet.Cash;
            Assert.IsTrue(s.Store.Reserve(p, 999).Success);
            ActionResult r;
            int price = s.Store.CompleteSale(p, 999, out r);
            root.OnProductSold(p);
            Assert.Greater(price, 0);
            Assert.AreEqual(cash + price, s.State.Wallet.Cash);
            Assert.IsFalse(root.Views.ContainsKey(p.Id));
            for (int i = 0; i < 10; i++) yield return null;
        }

        [UnityTest]
        public IEnumerator Automation_HopperToCradle_RunsInTheScene()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            s.State.Day.Day = 10;
            s.State.Wallet.Cash = 10000;
            Assert.IsTrue(s.Upgrades.Purchase(UpgradeId.AutoPrepStation).Success);
            yield return null; // rig appears
            Assert.IsTrue(root.Level.AutoPrepRig.activeSelf);

            var cell = root.Level.Cells.First(c => c.Occupant != null);
            cell.Door.SetOpen(true);
            var v = cell.Occupant;
            v.BeginCarry();
            Assert.IsTrue(root.Level.PrepHopper.CanAccept(v));
            root.Level.PrepHopper.Place(v);
            Assert.AreEqual(LocationKind.Hopper, v.P.Location.Kind);

            float waited = 0f;
            while (v.P.Stage != ProductStage.Prepared && waited < 15f)
            {
                waited += Time.deltaTime;
                yield return null;
            }
            Assert.AreEqual(ProductStage.Prepared, v.P.Stage, "auto-prep injected the character");
            Assert.AreEqual(root.Level.Prep.Socket, v.Socket, "view followed the product into the cradle");
        }

        [UnityTest]
        public IEnumerator SpecialOrder_PinnedBuiltAndDelivered_AtTheCounter()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            s.State.Day.Day = 4;
            var order = s.Orders.OnNewDay()[0];
            order.MinTier = QualityTier.Standard;
            order.RequireCertified = false;
            order.SpecificArchetype = false;
            Assert.IsTrue(s.Orders.Pin(order.Id).Success);

            var cell = root.Level.Cells.First(c => c.Occupant != null);
            cell.Door.SetOpen(true);
            var v = cell.Occupant;
            var p = v.P;
            v.BeginCarry();
            root.Level.Prep.Socket.Place(v);
            s.Production.Inject(p, 1f);
            v.BeginCarry();
            root.Level.Assembly.Socket.Place(v);
            var card = AssemblyCard.For(s.State, p);
            Assert.IsTrue(card.FromOrder);
            Assert.IsTrue(s.Production.Mount(p, card.Pose, 1f).Success);
            p.DecorationCode = card.SceneryCode;
            s.Production.Decorate(p, 1f, ThemeCatalog.Get(p.Theme).SnowTarget);
            v.BeginCarry();
            root.Level.Sealer.Socket.Place(v);
            s.Production.FitDome(p, 1f);
            s.Production.Seal(p, true);
            v.BeginCarry();
            root.Level.Packaging.Socket.Place(v);
            s.Production.Package(p, 1f);
            yield return null;

            int cash = s.State.Wallet.Cash;
            v.BeginCarry();
            root.Level.CounterSocket.Place(v); // order pickup
            yield return null;
            Assert.AreEqual(OrderState.Fulfilled, order.State);
            Assert.AreEqual(ProductStage.Sold, p.Stage);
            Assert.Greater(s.State.Wallet.Cash, cash + order.Bonus - 1);
            Assert.IsFalse(root.Views.ContainsKey(p.Id));
        }

        [UnityTest]
        public IEnumerator SecurityCameras_DeskShowsALiveFeed()
        {
            yield return Boot();
            var root = GameRoot.I;
            var s = root.Session;
            s.State.Day.Day = 6;
            s.State.Wallet.Cash = 5000;
            Assert.IsTrue(s.Upgrades.Purchase(UpgradeId.SecurityCameras).Success);
            root.Player.Teleport(root.Level.SecurityDesk.transform.position + Vector3.back * 1.2f + Vector3.up * 0.1f, 0f);
            root.Level.SecurityDesk.Interact(root.Interactor);
            yield return null;
            yield return null;
            Assert.AreEqual(root.Level.SecurityDesk, root.Interactor.LockedStation);
            Assert.IsTrue(Object.FindObjectsByType<Camera>(FindObjectsSortMode.None).Count(c => c.targetTexture != null && c.enabled) == 1, "exactly one feed renders");
            root.Level.SecurityDesk.CancelMinigame();
            Assert.IsNull(root.Interactor.LockedStation);
        }

        [UnityTest]
        public IEnumerator EscapeArtist_BoltsFromAnOpenUnwatchedCabinet()
        {
            yield return Boot();
            var root = GameRoot.I;
            var cell = root.Level.FreeCell();
            var p = root.Session.State.AddCharacter(ArchetypeId.EscapeArtist, ProductLocation.Holding(cell.Index));
            var v = root.SpawnView(p);
            cell.Door.SetOpen(true);
            root.Player.Teleport(root.Level.PlayerSpawn.position, 0f); // far away upstairs
            float waited = 0f;
            while (!v.IsEscaped && waited < GameBalance.EscapeArtistUnattendedSeconds + 3f)
            {
                waited += Time.deltaTime;
                yield return null;
            }
            Assert.IsTrue(v.IsEscaped, "it took its chance");
            Assert.AreEqual(LocationKind.Loose, p.Location.Kind);
        }

        [UnityTest]
        public IEnumerator SaveAndLoad_RebuildsTheSameWorld()
        {
            yield return Boot();
            var root = GameRoot.I;
            string path = System.IO.Path.Combine(Application.temporaryCachePath, "smoke_save.json");
            Assert.IsTrue(root.Saves.Save(root.Session.State, path));
            int products = root.Session.State.Products.Count;
            Assert.IsTrue(root.LoadFrom(path));
            root.Hud.CloseAllPanels();
            yield return null;
            Assert.AreEqual(products, root.Session.State.Products.Count);
            Assert.AreEqual(products, root.Views.Count);
            for (int i = 0; i < 10; i++) yield return null;
        }
    }
}
