using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    [Serializable]
    public sealed class Wallet
    {
        public int Cash = GameBalance.StartingCash;
        /// <summary>Owed to the supplier (emergency orders, unpaid operating costs). Repaid from sales.</summary>
        public int Debt;

        public bool CanAfford(int amount) { return amount <= Cash; }

        public bool TrySpend(int amount)
        {
            if (amount < 0 || amount > Cash) return false;
            Cash -= amount;
            return true;
        }

        /// <summary>Adds sale revenue, automatically paying down debt. Returns cash actually kept.</summary>
        public int Earn(int gross)
        {
            if (gross <= 0) return 0;
            int repayment = 0;
            if (Debt > 0)
            {
                repayment = (int)(gross * GameBalance.DebtRepaymentShare);
                if (repayment > Debt) repayment = Debt;
                Debt -= repayment;
            }
            int kept = gross - repayment;
            Cash += kept;
            return kept;
        }

        /// <summary>Charges a bill; any shortfall becomes debt instead of negative cash.</summary>
        public void ChargeBill(int amount)
        {
            if (amount <= Cash)
            {
                Cash -= amount;
                return;
            }
            Debt += amount - Cash;
            Cash = 0;
        }

        public void Refund(int amount)
        {
            ChargeBill(amount);
        }
    }

    [Serializable]
    public sealed class Inventory
    {
        public int GlobeKits = GameBalance.StartingKits;
        public int SerumCharges = GameBalance.StartingSerum;
        public int PackagingBoxes = GameBalance.StartingBoxes;
    }

    [Serializable]
    public sealed class PendingDelivery
    {
        public ArchetypeId Archetype;
        public float SecondsRemaining;
    }

    public enum SupplyItem
    {
        GlobeKit,
        SerumCharge,
        PackagingBox,
    }

    public sealed class SupplyService
    {
        public const float CharacterDeliverySeconds = 20f;

        readonly GameState _state;

        public SupplyService(GameState state) { _state = state; }

        public static int UnitCost(SupplyItem item)
        {
            switch (item)
            {
                case SupplyItem.GlobeKit: return GameBalance.GlobeKitCost;
                case SupplyItem.SerumCharge: return GameBalance.SerumChargeCost;
                default: return GameBalance.PackagingCost;
            }
        }

        public ActionResult Buy(SupplyItem item, int quantity)
        {
            if (quantity <= 0) return ActionResult.Fail("Nothing to buy.");
            int cost = UnitCost(item) * quantity;
            if (!_state.Wallet.TrySpend(cost)) return ActionResult.Fail("Not enough cash ($" + cost + ").");
            switch (item)
            {
                case SupplyItem.GlobeKit: _state.Inventory.GlobeKits += quantity; break;
                case SupplyItem.SerumCharge: _state.Inventory.SerumCharges += quantity; break;
                case SupplyItem.PackagingBox: _state.Inventory.PackagingBoxes += quantity; break;
            }
            _state.Day.Stats.Expenses += cost;
            return ActionResult.Ok("Bought " + quantity + " x " + item + ".");
        }

        public ActionResult OrderCharacter(ArchetypeId archetype)
        {
            var def = ArchetypeCatalog.Get(archetype);
            if (def.UnlockDay > _state.Day.Day) return ActionResult.Fail("The supplier won't send " + def.DisplayName + " until day " + def.UnlockDay + ".");
            int cost = StoryRules.CharacterCost(_state, archetype);
            if (!_state.Wallet.TrySpend(cost)) return ActionResult.Fail("Not enough cash ($" + cost + ").");
            _state.Deliveries.Add(new PendingDelivery { Archetype = archetype, SecondsRemaining = CharacterDeliverySeconds });
            _state.Day.Stats.Expenses += cost;
            return ActionResult.Ok(def.DisplayName + " ordered. Something will knock on the hatch soon.");
        }

        /// <summary>Advances deliveries; returns products that just arrived at the hatch.</summary>
        public List<Product> Tick(float dt)
        {
            List<Product> arrived = null;
            for (int i = _state.Deliveries.Count - 1; i >= 0; i--)
            {
                var d = _state.Deliveries[i];
                d.SecondsRemaining -= dt;
                if (d.SecondsRemaining > 0f) continue;
                _state.Deliveries.RemoveAt(i);
                if (arrived == null) arrived = new List<Product>();
                arrived.Add(_state.AddCharacter(d.Archetype, ProductLocation.Hatch()));
            }
            return arrived;
        }

        /// <summary>
        /// Anti-bankruptcy valve: when the player cannot afford one production run and has
        /// nothing left to sell, the supplier fronts a small order repaid from future sales.
        /// </summary>
        public bool CanRequestEmergencyOrder()
        {
            int unitCost = StoryRules.CharacterCost(_state, ArchetypeId.SleepyOne) + GameBalance.GlobeKitCost + GameBalance.SerumChargeCost + GameBalance.PackagingCost;
            if (_state.Wallet.Cash >= unitCost) return false;
            if (_state.EmergencyOrderDay == _state.Day.Day) return false;
            if (_state.Wallet.Debt + GameBalance.EmergencyUnits * GameBalance.EmergencyDebtPerUnit > GameBalance.MaxDebt) return false;
            foreach (var p in _state.Products)
            {
                if (p.Stage >= ProductStage.Prepared && p.Stage <= ProductStage.Displayed) return false;
            }
            return true;
        }

        public ActionResult RequestEmergencyOrder()
        {
            if (!CanRequestEmergencyOrder()) return ActionResult.Fail("The supplier declines. You still have options.");
            int units = GameBalance.EmergencyUnits;
            _state.EmergencyOrderDay = _state.Day.Day;
            _state.Wallet.Debt += units * GameBalance.EmergencyDebtPerUnit;
            _state.Inventory.GlobeKits += units;
            _state.Inventory.SerumCharges += units;
            _state.Inventory.PackagingBoxes += units;
            for (int i = 0; i < units; i++) _state.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.Hatch());
            return ActionResult.Ok("Emergency supplies delivered. $" + (units * GameBalance.EmergencyDebtPerUnit) + " will be taken from future sales.");
        }
    }
}
