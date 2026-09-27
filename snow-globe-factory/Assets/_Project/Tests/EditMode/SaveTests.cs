using NUnit.Framework;

namespace SnowGlobe.Core.Tests
{
    public class SaveValidatorTests
    {
        [Test]
        public void DuplicateIds_AreReassigned_NotDeleted()
        {
            var s = GameState.NewGame(1);
            s.Products[1].Id = s.Products[0].Id;
            int count = s.Products.Count;
            SaveValidator.Repair(s);
            Assert.AreEqual(count, s.Products.Count);
            Assert.AreNotEqual(s.Products[0].Id, s.Products[1].Id);
            Assert.Greater(s.NextId, s.Products[1].Id);
        }

        [Test]
        public void CarriedAndEscapedItems_AreMadeSafeOnLoad()
        {
            var s = GameState.NewGame(1);
            s.Products[0].Location = ProductLocation.Carried();
            s.Products[1].Location = ProductLocation.Loose(1, 2, 3);
            SaveValidator.Repair(s);
            Assert.AreEqual(LocationKind.Holding, s.Products[0].Location.Kind);
            Assert.AreEqual(LocationKind.Holding, s.Products[1].Location.Kind);
        }

        [Test]
        public void ShelfInconsistencies_AreRepaired()
        {
            var session = GameSession.NewGame(1);
            var p = TestFlow.RunToPackaged(session);
            var s = session.State;
            s.Store.Slots[0] = p.Id;       // points at a packaged (not displayed) product
            s.Store.Slots[1] = 9999;       // points at nothing
            var q = TestFlow.RunToPackaged(session);
            q.Stage = ProductStage.Displayed; // displayed but in no slot
            SaveValidator.Repair(s);
            Assert.AreNotEqual(p.Id, s.Store.Slots[0]);
            Assert.AreNotEqual(9999, s.Store.Slots[1]);
            Assert.IsTrue(s.Store.Slots.Contains(q.Id));
            Assert.AreEqual(LocationKind.Shelf, q.Location.Kind);
        }

        [Test]
        public void SoldProducts_NeverStayOnShelves()
        {
            var session = GameSession.NewGame(1);
            var p = TestFlow.RunToPackaged(session);
            session.Store.Display(p, 0);
            p.Stage = ProductStage.Sold;
            SaveValidator.Repair(session.State);
            Assert.IsFalse(session.State.Store.Slots.Contains(p.Id));
        }

#if !UNITY_5_3_OR_NEWER
        // Round trip through a field-based JSON serializer, mirroring what Unity's JsonUtility sees.
        static readonly System.Text.Json.JsonSerializerOptions Options = new System.Text.Json.JsonSerializerOptions { IncludeFields = true };

        [Test]
        public void RoundTrip_PreservesIdentityTimersAndState()
        {
            var session = GameSession.NewGame(99);
            var packaged = TestFlow.RunToPackaged(session);
            session.Store.Display(packaged, 2);
            var prepared = TestFlow.FirstHolding(session);
            prepared.Location = ProductLocation.At(StationId.PrepCradle);
            session.Production.Inject(prepared, 0.7f);
            session.Production.Tick(12.5f, 1f);
            session.Upgrades.Purchase(UpgradeId.PrepCradle);
            session.State.Exposure.Value = 33f;
            uint rngBefore = session.State.Rng.State;

            string json = System.Text.Json.JsonSerializer.Serialize(session.State, Options);
            var loaded = System.Text.Json.JsonSerializer.Deserialize<GameState>(json, Options);
            var restored = new GameSession(loaded);

            Assert.AreEqual(session.State.Products.Count, loaded.Products.Count);
            var lp = loaded.Find(prepared.Id);
            Assert.AreEqual(prepared.CharacterName, lp.CharacterName);
            Assert.AreEqual(ProductStage.Prepared, lp.Stage);
            Assert.AreEqual(prepared.SerumRemaining, lp.SerumRemaining, 0.0001f);
            Assert.AreEqual(packaged.Id, loaded.Store.Slots[2]);
            Assert.AreEqual(ProductStage.Displayed, loaded.Find(packaged.Id).Stage);
            Assert.IsTrue(restored.Upgrades.Owns(UpgradeId.PrepCradle));
            Assert.AreEqual(session.State.Wallet.Cash, loaded.Wallet.Cash);
            Assert.AreEqual(33f, loaded.Exposure.Value);
            Assert.AreEqual(rngBefore, loaded.Rng.State);
            Assert.AreEqual(session.State.NextId, loaded.NextId);
        }
#endif
    }
}
