using System;

namespace SnowGlobe.Core
{
    /// <summary>
    /// Explicit production states. One Product follows one living character from
    /// the basement to the customer's shopping bag; its Id is the character's identity.
    /// </summary>
    public enum ProductStage
    {
        Unprepared = 0, // loose, awake character (holding room, floor, carried)
        Prepared = 1,   // Stillness Serum active, timer running
        Mounted = 2,    // on a globe base, posed
        Decorated = 3,  // scenery + snow added
        Domed = 4,      // dome fitted, not yet sealed
        Sealed = 5,     // stasis mechanism active; serum no longer matters
        Inspected = 6,  // passed the lamp; defects known ("certified")
        Packaged = 7,   // boxed
        Displayed = 8,  // unboxed on a store shelf
        Sold = 9,       // left with a customer; out of the simulation
    }

    public enum LocationKind
    {
        Holding = 0,  // basement holding room (Index = room)
        Carried = 1,  // in the player's hands
        Station = 2,  // on a production station (Index = StationId)
        Shelf = 3,    // store display slot (Index = slot)
        Floor = 4,    // somewhere in the world (X/Y/Z)
        Loose = 5,    // awake and wandering (escaped) — X/Y/Z is last known position
        Gone = 6,     // sold
        Hatch = 7,    // delivery hatch, awaiting pickup
        Conveyor = 8, // on the short conveyor (X = progress 0..1 along the belt)
        Hopper = 9,   // auto-prep intake queue (Index = FIFO order)
        OutputShelf = 10, // packaging machine output rack (Index = slot)
    }

    public enum StationId
    {
        PrepCradle = 0,
        Assembly = 1,
        Sealer = 2,
        Inspection = 3,
        Packaging = 4,
        Counter = 5,
    }

    [Serializable]
    public struct ProductLocation
    {
        public LocationKind Kind;
        public int Index;
        public float X, Y, Z;

        public static ProductLocation Holding(int room) { return new ProductLocation { Kind = LocationKind.Holding, Index = room }; }
        public static ProductLocation At(StationId station) { return new ProductLocation { Kind = LocationKind.Station, Index = (int)station }; }
        public static ProductLocation Shelf(int slot) { return new ProductLocation { Kind = LocationKind.Shelf, Index = slot }; }
        public static ProductLocation Floor(float x, float y, float z) { return new ProductLocation { Kind = LocationKind.Floor, X = x, Y = y, Z = z }; }
        public static ProductLocation Loose(float x, float y, float z) { return new ProductLocation { Kind = LocationKind.Loose, X = x, Y = y, Z = z }; }
        public static ProductLocation Carried() { return new ProductLocation { Kind = LocationKind.Carried }; }
        public static ProductLocation Hatch() { return new ProductLocation { Kind = LocationKind.Hatch }; }
        public static ProductLocation Gone() { return new ProductLocation { Kind = LocationKind.Gone }; }
        public static ProductLocation OnConveyor(float progress) { return new ProductLocation { Kind = LocationKind.Conveyor, X = progress }; }
        public static ProductLocation InHopper(int order) { return new ProductLocation { Kind = LocationKind.Hopper, Index = order }; }
        public static ProductLocation OnOutputShelf(int slot) { return new ProductLocation { Kind = LocationKind.OutputShelf, Index = slot }; }

        public bool IsStation(StationId station) { return Kind == LocationKind.Station && Index == (int)station; }

        public override string ToString() { return Kind + (Kind == LocationKind.Station ? ":" + (StationId)Index : Kind == LocationKind.Shelf || Kind == LocationKind.Holding ? ":" + Index : ""); }
    }

    /// <summary>
    /// Serializable product record. Mutate only through ProductionService / StoreService
    /// so stage transitions stay legal.
    /// </summary>
    [Serializable]
    public sealed class Product
    {
        public int Id;
        public ArchetypeId Archetype;
        public string CharacterName;
        public ProductStage Stage;
        public ProductLocation Location;
        public ThemeId Theme;

        /// <summary>Seconds of Stillness Serum left. Only meaningful Prepared..Domed.</summary>
        public float SerumRemaining;
        public bool SerumWarningSent;

        public int PoseIndex;
        public float PoseScore;
        public float DecorationScore;
        /// <summary>Visual-only: which scenery piece sits in each of the three spots (base-4 digits).</summary>
        public int DecorationCode;
        public float SnowAmount;
        public float SnowScore;
        public float DomeScore;
        public float PackagingScore;
        public float Damage;

        /// <summary>0..1, set when sealed. Low integrity lets movement and sound return.</summary>
        public float SealIntegrity;
        /// <summary>Temporary integrity loss (power failures). Recovers over time.</summary>
        public float SealStrain;
        public bool Certified;
        public bool DefectRevealed;
        /// <summary>Seconds left of a shake showcase (price bonus, shoppers drawn to it).</summary>
        public float ShowcaseRemaining;

        public float Stress;
        public int SoldPrice;
        public int SoldOnDay;

        public ArchetypeDefinition Definition { get { return ArchetypeCatalog.Get(Archetype); } }

        public bool IsSerumActive
        {
            get { return Stage >= ProductStage.Prepared && Stage <= ProductStage.Domed; }
        }

        public bool IsSealedGlobe
        {
            get { return Stage >= ProductStage.Sealed && Stage <= ProductStage.Displayed; }
        }

        public float EffectiveIntegrity
        {
            get { return MathUtil.Clamp01(SealIntegrity - SealStrain); }
        }

        /// <summary>Clears all assembly progress; used when a character wakes or a globe is rejected.</summary>
        public void ResetAssembly()
        {
            SerumRemaining = 0f;
            SerumWarningSent = false;
            PoseIndex = 0;
            DecorationCode = 0;
            PoseScore = DecorationScore = SnowAmount = SnowScore = DomeScore = PackagingScore = 0f;
            SealIntegrity = SealStrain = 0f;
            Certified = DefectRevealed = false;
            Damage = 0f;
        }
    }
}
