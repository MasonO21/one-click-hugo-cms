using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    [Serializable]
    public sealed class StoreState
    {
        /// <summary>Product id per display slot; 0 = empty.</summary>
        public List<int> Slots = new List<int>();

        public void EnsureCapacity(int capacity)
        {
            while (Slots.Count < capacity) Slots.Add(0);
        }

        public int FirstEmptySlot()
        {
            for (int i = 0; i < Slots.Count; i++) if (Slots[i] == 0) return i;
            return -1;
        }
    }

    /// <summary>
    /// Shelf stocking and sales. Guarantees: a product occupies at most one slot,
    /// only displayed products can be sold, a sale pays exactly once, and a globe
    /// reserved by one customer cannot be bought by another.
    /// </summary>
    public sealed class StoreService
    {
        readonly GameState _state;
        readonly Dictionary<int, int> _reservations = new Dictionary<int, int>(); // productId -> customerId (transient)

        public StoreService(GameState state) { _state = state; }

        /// <summary>Unbox a packaged globe onto a slot, or move a displayed globe to another slot.</summary>
        public ActionResult Display(Product p, int slot)
        {
            if (p == null) return ActionResult.Fail("Nothing to display.");
            _state.Store.EnsureCapacity(_state.ShelfCapacity);
            if (slot < 0 || slot >= _state.ShelfCapacity) return ActionResult.Fail("That shelf slot doesn't exist.");
            if (_state.Store.Slots[slot] != 0 && _state.Store.Slots[slot] != p.Id) return ActionResult.Fail("That slot is occupied.");
            if (p.Stage != ProductStage.Packaged && p.Stage != ProductStage.Displayed) return ActionResult.Fail("Only packaged globes can be unboxed onto a display.");

            ClearSlotOf(p.Id);
            _state.Store.Slots[slot] = p.Id;
            p.Stage = ProductStage.Displayed;
            p.Location = ProductLocation.Shelf(slot);
            return ActionResult.Ok(p.CharacterName + " is on display — $" + QualityModel.EstimateValue(p) + ".");
        }

        /// <summary>Pull a globe off display; it goes back into its box (no new box needed).</summary>
        public ActionResult PullFromDisplay(Product p)
        {
            if (p == null || p.Stage != ProductStage.Displayed) return ActionResult.Fail("That globe isn't on display.");
            _reservations.Remove(p.Id);
            ClearSlotOf(p.Id);
            p.Stage = ProductStage.Packaged;
            p.Location = ProductLocation.Carried();
            return ActionResult.Ok("Globe pulled from display.");
        }

        public bool IsReserved(int productId) { return _reservations.ContainsKey(productId); }

        public ActionResult Reserve(Product p, int customerId)
        {
            if (p == null || p.Stage != ProductStage.Displayed) return ActionResult.Fail("Not for sale.");
            int holder;
            if (_reservations.TryGetValue(p.Id, out holder) && holder != customerId) return ActionResult.Fail("Another customer is buying that.");
            _reservations[p.Id] = customerId;
            return ActionResult.Ok();
        }

        public void CancelReservation(int productId, int customerId)
        {
            int holder;
            if (_reservations.TryGetValue(productId, out holder) && holder == customerId) _reservations.Remove(productId);
        }

        public void CancelAllReservations(int customerId)
        {
            var toRemove = new List<int>();
            foreach (var kv in _reservations) if (kv.Value == customerId) toRemove.Add(kv.Key);
            foreach (var id in toRemove) _reservations.Remove(id);
        }

        /// <summary>Completes a sale. Returns the price paid, or 0 if the sale is invalid.</summary>
        public int CompleteSale(Product p, int customerId, out ActionResult result)
        {
            int holder;
            if (p == null) { result = ActionResult.Fail("No product."); return 0; }
            if (p.Stage == ProductStage.Sold) { result = ActionResult.Fail("Already sold."); return 0; }
            if (p.Stage != ProductStage.Displayed) { result = ActionResult.Fail("Only displayed globes can be sold."); return 0; }
            if (!_reservations.TryGetValue(p.Id, out holder) || holder != customerId) { result = ActionResult.Fail("That customer hasn't chosen this globe."); return 0; }

            int price = QualityModel.EstimateValue(p);
            _reservations.Remove(p.Id);
            ClearSlotOf(p.Id);
            p.Stage = ProductStage.Sold;
            p.Location = ProductLocation.Gone();
            p.SoldPrice = price;
            p.SoldOnDay = _state.Day.Day;
            _state.Wallet.Earn(price);
            _state.Day.Stats.Revenue += price;
            _state.Day.Stats.GlobesSold++;
            _state.Day.Stats.CustomersServed++;
            _state.LifetimeGlobesSold++;
            result = ActionResult.Ok("Sold " + p.CharacterName + " for $" + price + ".");
            return price;
        }

        /// <summary>
        /// Store appeal: well-stocked shelves draw more walk-ins. Multiplies the customer arrival
        /// rate: 0.7 with bare shelves, up to 1.3 with six or more globes on display.
        /// </summary>
        public float AppealMultiplier()
        {
            return 0.7f + 0.6f * MathUtil.Clamp01(DisplayedCount() / 6f);
        }

        public int DisplayedCount()
        {
            int n = 0;
            foreach (var id in _state.Store.Slots) if (id != 0) n++;
            return n;
        }

        void ClearSlotOf(int productId)
        {
            var slots = _state.Store.Slots;
            for (int i = 0; i < slots.Count; i++) if (slots[i] == productId) slots[i] = 0;
        }
    }
}
