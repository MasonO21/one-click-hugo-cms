using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    /// <summary>
    /// The single source of truth for a run. Plain serializable fields only
    /// (Unity JsonUtility compatible: no dictionaries, properties or nullables),
    /// so this object IS the save file. Customers and in-flight minigames are
    /// transient and intentionally not saved.
    /// </summary>
    [Serializable]
    public sealed class GameState
    {
        public const int CurrentVersion = 1;

        public int Version = CurrentVersion;
        public int NextId = 1;
        public DayState Day = new DayState();
        public Wallet Wallet = new Wallet();
        public Inventory Inventory = new Inventory();
        public List<Product> Products = new List<Product>();
        public StoreState Store = new StoreState();
        public BusinessExposure Exposure = new BusinessExposure();
        public List<UpgradeId> OwnedUpgrades = new List<UpgradeId>();
        public List<ThemeId> UnlockedThemes = new List<ThemeId>();
        public List<PendingDelivery> Deliveries = new List<PendingDelivery>();
        public EventDirectorState Director = new EventDirectorState();
        public DeterministicRandom Rng = new DeterministicRandom(12345);
        public int EmergencyOrderDay;
        public int LifetimeGlobesSold;

        [NonSerialized] UpgradeModifiers _modifiers;
        [NonSerialized] bool _modifiersValid;

        public static GameState NewGame(uint seed)
        {
            var s = new GameState();
            s.Rng = new DeterministicRandom(seed);
            s.UnlockedThemes.Add(ThemeId.WinterVillage);
            s.Store.EnsureCapacity(s.ShelfCapacity);
            for (int i = 0; i < GameBalance.StartingCharacters; i++)
            {
                s.AddCharacter(ArchetypeId.SleepyOne, ProductLocation.Holding(i * 2));
            }
            return s;
        }

        public UpgradeModifiers Modifiers
        {
            get
            {
                if (!_modifiersValid)
                {
                    _modifiers = UpgradeCatalog.Aggregate(OwnedUpgrades);
                    _modifiersValid = true;
                }
                return _modifiers;
            }
        }

        public void InvalidateModifiers() { _modifiersValid = false; }

        public int ShelfCapacity { get { return GameBalance.BaseShelfCapacity + Modifiers.DisplayCapacityBonus; } }

        public Product AddCharacter(ArchetypeId archetype, ProductLocation location)
        {
            int id = NextId++;
            var p = new Product
            {
                Id = id,
                Archetype = archetype,
                CharacterName = CharacterNames.Generate(Rng, id),
                Stage = ProductStage.Unprepared,
                Location = location,
                Theme = ThemeId.WinterVillage,
            };
            Products.Add(p);
            return p;
        }

        public Product Find(int id)
        {
            for (int i = 0; i < Products.Count; i++)
            {
                if (Products[i].Id == id) return Products[i];
            }
            return null;
        }

        public int Count(Func<Product, bool> predicate)
        {
            int n = 0;
            foreach (var p in Products) if (predicate(p)) n++;
            return n;
        }
    }

    public enum DayPhase
    {
        BeforeOpening,
        Open,
        AfterClosing,
    }

    [Serializable]
    public sealed class DailyStats
    {
        public int Revenue;
        public int Expenses;
        public int GlobesSold;
        public int GlobesProduced;
        public int CustomersServed;
        public int CustomersLost;
        public int Incidents;
        public int KitsRuined;
        public int Refunds;
    }

    [Serializable]
    public sealed class DayState
    {
        public int Day = 1;
        public DayPhase Phase = DayPhase.BeforeOpening;
        /// <summary>Clock in minutes since midnight. Frozen outside open hours.</summary>
        public float ClockMinutes = GameBalance.OpeningHourMinutes;
        public DailyStats Stats = new DailyStats();
        public bool ScriptedIncidentDone;
    }
}
