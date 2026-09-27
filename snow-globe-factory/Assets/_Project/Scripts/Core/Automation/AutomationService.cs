using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum MachineId
    {
        AutoPrep = 0,
        Conveyor = 1,
        PackagingMachine = 2,
    }

    [Serializable]
    public sealed class MachineState
    {
        public MachineId Id;
        /// <summary>Manual override: false = the station is worked by hand even though the machine is installed.</summary>
        public bool Enabled = true;
        /// <summary>1 = freshly serviced; wears with every item; low condition raises breakdown odds.</summary>
        public float Condition = 1f;
        public bool Broken;
        public bool Jammed;
        public float Progress;
        public int ItemsProcessed;
        /// <summary>Current reason the machine is waiting, "" when running freely. Used to report blockages once.</summary>
        public string BlockedReason = "";
        /// <summary>Seconds left of a figure gripping the belt (ConveyorGrab threat). Belt stops meanwhile.</summary>
        public float GripSeconds;
    }

    [Serializable]
    public sealed class AutomationState
    {
        public List<MachineState> Machines = new List<MachineState>();
        public int NextHopperOrder = 1;
    }

    public enum AutomationEventType
    {
        Moved,      // a product changed location (view must follow)
        Completed,  // a machine finished its step on a product
        Blocked,    // a machine started waiting (reason in Message)
        Breakdown,  // a machine broke; needs repair
        Jammed,     // a heavy load jammed the conveyor
        Repaired,
    }

    public struct AutomationEvent
    {
        public AutomationEventType Type;
        public MachineId Machine;
        public int ProductId;
        public string Message;
    }

    /// <summary>
    /// The factory's automated half. Machines only ever move a product from one explicit location
    /// to another; if the next place is occupied or full they stop and wait ("safe blocking"), so a
    /// product can never be lost to a full inventory. Product.Location stays the single truth:
    /// a player grabbing something off the belt simply removes it from the machine's world.
    /// </summary>
    public sealed class AutomationService
    {
        public const int HopperCapacity = 3;
        public const int OutputShelfCapacity = 4;
        public const int ConveyorCapacity = 3;
        public const float ConveyorTravelSeconds = 6f;
        public const float ConveyorSpacing = 0.34f;
        public const float AutoPrepBaseSeconds = 3f;
        public const float AutoPrepTimingScore = 0.6f;
        public const float PackagingSeconds = 4f;
        public const float MachinePackagingScore = 0.7f;
        public const float WearPerItem = 0.04f;
        public const float HeavyJamChance = 0.35f;
        public const int RepairCost = 15;
        public const int ServiceCost = 5;

        readonly GameState _state;
        readonly ProductionService _production;
        readonly List<AutomationEvent> _events = new List<AutomationEvent>();
        readonly List<Product> _scratch = new List<Product>();

        public AutomationService(GameState state, ProductionService production)
        {
            _state = state;
            _production = production;
            if (_state.Automation == null) _state.Automation = new AutomationState();
            foreach (MachineId id in Enum.GetValues(typeof(MachineId))) Get(id);
        }

        public static UpgradeId UpgradeFor(MachineId id)
        {
            switch (id)
            {
                case MachineId.AutoPrep: return UpgradeId.AutoPrepStation;
                case MachineId.Conveyor: return UpgradeId.ShortConveyor;
                default: return UpgradeId.PackagingMachine;
            }
        }

        public static string NameOf(MachineId id)
        {
            switch (id)
            {
                case MachineId.AutoPrep: return "Automated Prep";
                case MachineId.Conveyor: return "Conveyor";
                default: return "Packaging Machine";
            }
        }

        public MachineState Get(MachineId id)
        {
            foreach (var m in _state.Automation.Machines) if (m.Id == id) return m;
            var created = new MachineState { Id = id };
            _state.Automation.Machines.Add(created);
            return created;
        }

        public bool Owns(MachineId id) { return _state.OwnedUpgrades.Contains(UpgradeFor(id)); }

        /// <summary>Installed, switched to automatic, not broken or jammed, and powered.</summary>
        public bool IsRunning(MachineId id, bool powerAvailable)
        {
            var m = Get(id);
            return Owns(id) && m.Enabled && !m.Broken && !m.Jammed && powerAvailable;
        }

        /// <summary>Installed and switched to automatic (whether or not it's currently able to run).</summary>
        public bool IsAutomatic(MachineId id) { return Owns(id) && Get(id).Enabled; }

        public ActionResult SetEnabled(MachineId id, bool enabled)
        {
            if (!Owns(id)) return ActionResult.Fail(NameOf(id) + " isn't installed.");
            var m = Get(id);
            m.Enabled = enabled;
            m.Progress = 0f;
            m.BlockedReason = "";
            return ActionResult.Ok(NameOf(id) + (enabled ? " set to AUTOMATIC." : " set to MANUAL."));
        }

        /// <summary>Fixes a breakdown or jam ($15) or services a worn machine ($5). Resets condition.</summary>
        public ActionResult Repair(MachineId id)
        {
            if (!Owns(id)) return ActionResult.Fail(NameOf(id) + " isn't installed.");
            var m = Get(id);
            bool fault = m.Broken || m.Jammed;
            if (!fault && m.Condition > 0.9f) return ActionResult.Fail(NameOf(id) + " is running fine.");
            int cost = fault ? RepairCost : ServiceCost;
            if (!_state.Wallet.TrySpend(cost)) return ActionResult.Fail("Parts cost $" + cost + ".");
            _state.Day.Stats.Expenses += cost;
            m.Broken = false;
            m.Jammed = false;
            m.Condition = 1f;
            m.BlockedReason = "";
            return ActionResult.Ok(NameOf(id) + (fault ? " repaired" : " serviced") + " ($" + cost + ").");
        }

        // ------------------------------------------------------------------ queries

        public Product At(StationId station)
        {
            foreach (var p in _state.Products) if (p.Stage != ProductStage.Sold && p.Location.IsStation(station)) return p;
            return null;
        }

        public List<Product> Hopper()
        {
            _scratch.Clear();
            foreach (var p in _state.Products) if (p.Location.Kind == LocationKind.Hopper) _scratch.Add(p);
            _scratch.Sort((a, b) => a.Location.Index.CompareTo(b.Location.Index));
            return new List<Product>(_scratch);
        }

        /// <summary>Items on the belt, front (closest to packaging) first.</summary>
        public List<Product> OnConveyor()
        {
            var list = new List<Product>();
            foreach (var p in _state.Products) if (p.Location.Kind == LocationKind.Conveyor) list.Add(p);
            list.Sort((a, b) => b.Location.X.CompareTo(a.Location.X));
            return list;
        }

        public Product OnOutputSlot(int slot)
        {
            foreach (var p in _state.Products) if (p.Location.Kind == LocationKind.OutputShelf && p.Location.Index == slot) return p;
            return null;
        }

        public int FreeOutputSlot()
        {
            for (int i = 0; i < OutputShelfCapacity; i++) if (OnOutputSlot(i) == null) return i;
            return -1;
        }

        public bool CanAddToHopper(Product p)
        {
            return p != null && p.Stage == ProductStage.Unprepared && Owns(MachineId.AutoPrep) && Hopper().Count < HopperCapacity;
        }

        public ActionResult AddToHopper(Product p)
        {
            if (!Owns(MachineId.AutoPrep)) return ActionResult.Fail("No automated prep station installed.");
            if (p == null || p.Stage != ProductStage.Unprepared) return ActionResult.Fail("Only awake characters go in the hopper.");
            if (p.Location.Kind == LocationKind.Hopper) return ActionResult.Ok();
            if (Hopper().Count >= HopperCapacity) return ActionResult.Fail("The hopper is full.");
            p.Location = ProductLocation.InHopper(_state.Automation.NextHopperOrder++);
            return ActionResult.Ok(p.CharacterName + " is queued for preparation.");
        }

        // ------------------------------------------------------------------ simulation

        /// <summary>Advances every installed machine. The returned list is reused each call.</summary>
        public List<AutomationEvent> Tick(float dt, bool powerAvailable)
        {
            _events.Clear();
            TickAutoPrep(dt, powerAvailable);
            TickConveyor(dt, powerAvailable);
            TickPackaging(dt, powerAvailable);
            return _events;
        }

        void TickAutoPrep(float dt, bool power)
        {
            var m = Get(MachineId.AutoPrep);
            if (!IsRunning(MachineId.AutoPrep, power)) return;
            var inCradle = At(StationId.PrepCradle);
            if (inCradle == null)
            {
                var queue = Hopper();
                if (queue.Count == 0) { Unblock(m); return; }
                var next = queue[0];
                next.Location = ProductLocation.At(StationId.PrepCradle);
                Emit(AutomationEventType.Moved, m.Id, next.Id, "");
                m.Progress = 0f;
                return;
            }
            if (inCradle.Stage != ProductStage.Unprepared)
            {
                Block(m, "Waiting for someone to take " + inCradle.CharacterName + " out of the cradle.");
                return;
            }
            if (_state.Inventory.SerumCharges <= 0)
            {
                Block(m, "Out of serum charges.");
                return;
            }
            Unblock(m);
            m.Progress += dt;
            if (m.Progress < AutoPrepBaseSeconds * inCradle.Definition.PrepDurationSeconds) return;
            m.Progress = 0f;
            var r = _production.Inject(inCradle, AutoPrepTimingScore);
            if (!r.Success) { Block(m, r.Message); return; }
            Emit(AutomationEventType.Completed, m.Id, inCradle.Id, r.Message);
            Wear(m);
        }

        /// <summary>A figure on the belt grabs the rail: the belt stalls until pried loose or it lets go.</summary>
        public void GripConveyor(float seconds)
        {
            Get(MachineId.Conveyor).GripSeconds = seconds;
        }

        public bool ConveyorGripped { get { return Get(MachineId.Conveyor).GripSeconds > 0f; } }

        public ActionResult PryConveyor()
        {
            var m = Get(MachineId.Conveyor);
            if (m.GripSeconds <= 0f) return ActionResult.Fail("Nothing is holding the belt.");
            m.GripSeconds = 0f;
            m.BlockedReason = "";
            return ActionResult.Ok("You pry tiny fingers off the rail. The belt lurches on.");
        }

        void TickConveyor(float dt, bool power)
        {
            var m = Get(MachineId.Conveyor);
            if (!IsRunning(MachineId.Conveyor, power)) return;
            if (m.GripSeconds > 0f)
            {
                m.GripSeconds = Math.Max(0f, m.GripSeconds - dt);
                if (m.GripSeconds > 0f) { Block(m, "Something on the belt is holding on."); return; }
                Unblock(m);
            }
            var items = OnConveyor();

            // Intake from the sealer once there's room at the start of the belt.
            var atSealer = At(StationId.Sealer);
            bool intakeFree = items.Count < ConveyorCapacity && (items.Count == 0 || items[items.Count - 1].Location.X >= ConveyorSpacing);
            if (atSealer != null && (atSealer.Stage == ProductStage.Sealed || atSealer.Stage == ProductStage.Inspected) && intakeFree)
            {
                atSealer.Location = ProductLocation.OnConveyor(0f);
                Emit(AutomationEventType.Moved, m.Id, atSealer.Id, "");
                if (atSealer.Definition.Special == SpecialBehavior.HeavyLoad && _state.Rng.Chance(HeavyJamChance))
                {
                    m.Jammed = true;
                    Emit(AutomationEventType.Jammed, m.Id, atSealer.Id, "The conveyor jammed under a heavy globe.");
                    return;
                }
                items = OnConveyor();
            }

            float step = dt / ConveyorTravelSeconds;
            float limit = 1f;
            bool frontWaiting = false;
            for (int i = 0; i < items.Count; i++)
            {
                var p = items[i];
                float x = Math.Min(p.Location.X + step, limit);
                if (x < p.Location.X) x = p.Location.X; // never move backwards
                p.Location.X = x;
                if (i == 0 && x >= 1f)
                {
                    if (At(StationId.Packaging) == null)
                    {
                        p.Location = ProductLocation.At(StationId.Packaging);
                        Emit(AutomationEventType.Moved, m.Id, p.Id, "");
                        Emit(AutomationEventType.Completed, m.Id, p.Id, "");
                        Wear(m);
                        continue;
                    }
                    frontWaiting = true;
                }
                limit = p.Location.Kind == LocationKind.Conveyor ? p.Location.X - ConveyorSpacing : 1f;
            }
            if (frontWaiting) Block(m, "The packaging table is occupied — belt stopped.");
            else Unblock(m);
        }

        void TickPackaging(float dt, bool power)
        {
            var m = Get(MachineId.PackagingMachine);
            if (!IsRunning(MachineId.PackagingMachine, power)) return;
            var onTable = At(StationId.Packaging);
            if (onTable == null) { Unblock(m); m.Progress = 0f; return; }

            if (onTable.Stage == ProductStage.Packaged)
            {
                // Finished box waiting for room on the output rack.
                int slot = FreeOutputSlot();
                if (slot < 0) { Block(m, "Output rack is full — take some boxes to the shop."); return; }
                onTable.Location = ProductLocation.OnOutputShelf(slot);
                Emit(AutomationEventType.Moved, m.Id, onTable.Id, "");
                Unblock(m);
                return;
            }
            if (onTable.Stage != ProductStage.Sealed && onTable.Stage != ProductStage.Inspected) return;
            if (_state.Inventory.PackagingBoxes <= 0) { Block(m, "Out of packaging boxes."); return; }
            Unblock(m);
            m.Progress += dt;
            if (m.Progress < PackagingSeconds) return;
            m.Progress = 0f;
            var r = _production.Package(onTable, MachinePackagingScore);
            if (!r.Success) { Block(m, r.Message); return; }
            Emit(AutomationEventType.Completed, m.Id, onTable.Id, r.Message);
            Wear(m);
        }

        void Wear(MachineState m)
        {
            m.ItemsProcessed++;
            float wear = WearPerItem * (_state.Modifiers.IsOverPowered ? 1.5f : 1f);
            m.Condition = MathUtil.Clamp01(m.Condition - wear);
            float weakness = 1f - m.Condition;
            if (_state.Rng.Chance(weakness * weakness * 0.5f))
            {
                m.Broken = true;
                m.Progress = 0f;
                Emit(AutomationEventType.Breakdown, m.Id, 0, NameOf(m.Id) + " broke down. Repair it at its control panel.");
            }
        }

        void Block(MachineState m, string reason)
        {
            if (m.BlockedReason == reason) return;
            m.BlockedReason = reason;
            Emit(AutomationEventType.Blocked, m.Id, 0, reason);
        }

        static void Unblock(MachineState m) { m.BlockedReason = ""; }

        void Emit(AutomationEventType type, MachineId machine, int productId, string message)
        {
            _events.Add(new AutomationEvent { Type = type, Machine = machine, ProductId = productId, Message = message });
        }
    }
}
