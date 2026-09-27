using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum UpgradeId
    {
        PrepCradle,
        BetterInjector,
        AssemblyJig,
        ShortConveyor,
        ImprovedSealer,
        PackagingMachine,
        BasementSoundproofing,
        AutoPrepStation,
        PremiumDisplayCase,
    }

    public enum UpgradeCategory
    {
        ProductionSpeed,
        HandlingReliability,
        StorageCapacity,
        SecurityAndSecrecy,
        ProductQuality,
        StoreAppeal,
        Automation,
    }

    /// <summary>Aggregated effect of every owned upgrade. Systems read this, never upgrade ids.</summary>
    public struct UpgradeModifiers
    {
        public float SerumWindowMultiplier;
        public float PrepZoneWidthMultiplier;
        public bool CradlePreventsSlipping;
        public float AssemblyTimeMultiplier;
        public float DomeAlignAssist;
        public float SealDefectMultiplier;
        public float NoiseLeakMultiplier;
        public int DisplayCapacityBonus;
        public float DisplayVisibilityMultiplier;
        public int PowerDraw;
        public float MachineNoise;
        public bool HasConveyor;
        public bool AutoPackaging;
        public bool AutoPrep;

        public static UpgradeModifiers Default
        {
            get
            {
                return new UpgradeModifiers
                {
                    SerumWindowMultiplier = 1f,
                    PrepZoneWidthMultiplier = 1f,
                    AssemblyTimeMultiplier = 1f,
                    SealDefectMultiplier = 1f,
                    NoiseLeakMultiplier = 1f,
                    DisplayVisibilityMultiplier = 1f,
                };
            }
        }

        public bool IsOverPowered { get { return PowerDraw > GameBalance.BasePowerCapacity; } }
    }

    public delegate void ModifierApplier(ref UpgradeModifiers m);

    public sealed class UpgradeDefinition
    {
        public UpgradeId Id;
        public string Name;
        public int Cost;
        public UpgradeCategory Category;
        public int UnlockDay;
        public string Solves;
        public string Tradeoff;
        /// <summary>False = the data exists but the prototype has no scene object for it yet.</summary>
        public bool PrototypeFunctional;
        public ModifierApplier Apply;
    }

    public static class UpgradeCatalog
    {
        static readonly Dictionary<UpgradeId, UpgradeDefinition> Definitions = Build();

        public static UpgradeDefinition Get(UpgradeId id) { return Definitions[id]; }

        public static IEnumerable<UpgradeDefinition> All { get { return Definitions.Values; } }

        public static UpgradeModifiers Aggregate(IEnumerable<UpgradeId> owned)
        {
            var m = UpgradeModifiers.Default;
            foreach (var id in owned) Definitions[id].Apply(ref m);
            return m;
        }

        static Dictionary<UpgradeId, UpgradeDefinition> Build()
        {
            var list = new[]
            {
                new UpgradeDefinition
                {
                    Id = UpgradeId.PrepCradle, Name = "Preparation Cradle", Cost = 60, Category = UpgradeCategory.HandlingReliability, UnlockDay = 1,
                    Solves = "Characters slip away before the injection lands.", Tradeoff = "None — a cheap first win.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.PrepZoneWidthMultiplier *= 1.6f; m.CradlePreventsSlipping = true; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.BetterInjector, Name = "Better Injector", Cost = 100, Category = UpgradeCategory.HandlingReliability, UnlockDay = 1,
                    Solves = "Serum wears off before the globe is sealed.", Tradeoff = "None.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.SerumWindowMultiplier *= 1.5f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.AssemblyJig, Name = "Assembly Jig", Cost = 150, Category = UpgradeCategory.ProductionSpeed, UnlockDay = 1,
                    Solves = "Base, pose and dome placement are slow and fiddly.", Tradeoff = "None.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.AssemblyTimeMultiplier *= 0.6f; m.DomeAlignAssist += 0.15f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.ShortConveyor, Name = "Short Conveyor", Cost = 250, Category = UpgradeCategory.Automation, UnlockDay = 3,
                    Solves = "Walking every globe from the sealer to packaging.", Tradeoff = "Uses power; heavy characters can jam it.", PrototypeFunctional = false,
                    Apply = (ref UpgradeModifiers m) => { m.HasConveyor = true; m.PowerDraw += 1; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.ImprovedSealer, Name = "Improved Sealer", Cost = 400, Category = UpgradeCategory.ProductQuality, UnlockDay = 2,
                    Solves = "Defective stasis seals let figures move on the shelf.", Tradeoff = "Uses power and hums loudly.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.SealDefectMultiplier *= 0.4f; m.PowerDraw += 1; m.MachineNoise += 0.1f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.PackagingMachine, Name = "Packaging Machine", Cost = 650, Category = UpgradeCategory.Automation, UnlockDay = 4,
                    Solves = "Boxing every globe by hand.", Tradeoff = "Machine folds are only 'good' — hand folding scores higher.", PrototypeFunctional = false,
                    Apply = (ref UpgradeModifiers m) => { m.AutoPackaging = true; m.PowerDraw += 1; m.MachineNoise += 0.1f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.BasementSoundproofing, Name = "Basement Soundproofing", Cost = 500, Category = UpgradeCategory.SecurityAndSecrecy, UnlockDay = 2,
                    Solves = "Customers hear things through the staff door.", Tradeoff = "You also hear less of what's happening down there.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.NoiseLeakMultiplier *= 0.35f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.AutoPrepStation, Name = "Automated Preparation Station", Cost = 1000, Category = UpgradeCategory.Automation, UnlockDay = 5,
                    Solves = "Hand-injecting every character.", Tradeoff = "Average timing only; heavy power draw.", PrototypeFunctional = false,
                    Apply = (ref UpgradeModifiers m) => { m.AutoPrep = true; m.PowerDraw += 2; m.MachineNoise += 0.2f; },
                },
                new UpgradeDefinition
                {
                    Id = UpgradeId.PremiumDisplayCase, Name = "Premium Display Case", Cost = 800, Category = UpgradeCategory.StorageCapacity, UnlockDay = 3,
                    Solves = "Too few shelf slots; fragile stock gets inspected up close.", Tradeoff = "Frosted glass lowers store appeal slightly.", PrototypeFunctional = true,
                    Apply = (ref UpgradeModifiers m) => { m.DisplayCapacityBonus += 4; m.DisplayVisibilityMultiplier *= 0.5f; },
                },
            };
            var dict = new Dictionary<UpgradeId, UpgradeDefinition>();
            foreach (var d in list) dict[d.Id] = d;
            return dict;
        }
    }

    public sealed class UpgradeService
    {
        readonly GameState _state;

        public UpgradeService(GameState state) { _state = state; }

        public bool Owns(UpgradeId id) { return _state.OwnedUpgrades.Contains(id); }

        public ActionResult Purchase(UpgradeId id)
        {
            var def = UpgradeCatalog.Get(id);
            if (Owns(id)) return ActionResult.Fail(def.Name + " is already installed.");
            if (def.UnlockDay > _state.Day.Day) return ActionResult.Fail(def.Name + " unlocks on day " + def.UnlockDay + ".");
            if (!_state.Wallet.TrySpend(def.Cost)) return ActionResult.Fail("Need $" + def.Cost + " for " + def.Name + ".");
            _state.OwnedUpgrades.Add(id);
            _state.Day.Stats.Expenses += def.Cost;
            _state.InvalidateModifiers();
            if (id == UpgradeId.PremiumDisplayCase) _state.Store.EnsureCapacity(_state.ShelfCapacity);
            return ActionResult.Ok(def.Name + " installed.");
        }
    }
}
