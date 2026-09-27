using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum ArchetypeId
    {
        SleepyOne,
        Wiggler,
        Performer,
        Heavy,
        Screamer,
        EscapeArtist,
        Watcher,
    }

    public enum SpecialBehavior
    {
        None,
        SlipsGrip,       // Wiggler: can wriggle out of a loose grip while carried
        DrawsAttention,  // Performer: great poses, customers look longer
        HeavyLoad,       // Heavy: slows carrying, overloads conveyors
        MuffledNoise,    // Screamer: stress produces audible sounds
        SeeksExits,      // Escape Artist: heads for open doors/unattended stations
        MovesUnobserved, // Watcher: only moves when nobody is looking
    }

    public sealed class ArchetypeDefinition
    {
        public ArchetypeId Id;
        public string DisplayName;
        public string Description;
        public int AcquisitionCost;
        public int BaseSaleValue;
        /// <summary>0..1 — how often the character stirs when stasis is weak.</summary>
        public float MovementTendency;
        /// <summary>0..1 — how much sound the character makes when stressed or weakly sealed.</summary>
        public float NoiseTendency;
        /// <summary>Seconds the injection/settle step takes at the preparation cradle.</summary>
        public float PrepDurationSeconds;
        /// <summary>Multiplier on the Stillness Serum window (tougher characters shake it off sooner).</summary>
        public float SerumWindowMultiplier;
        /// <summary>0..1 — how narrow the injection timing zone is (0 = generous).</summary>
        public float HandlingDifficulty;
        public SpecialBehavior Special;
        public int UnlockDay;
    }

    public static class ArchetypeCatalog
    {
        static readonly Dictionary<ArchetypeId, ArchetypeDefinition> Definitions = Build();

        public static ArchetypeDefinition Get(ArchetypeId id) { return Definitions[id]; }

        public static IEnumerable<ArchetypeDefinition> All { get { return Definitions.Values; } }

        static Dictionary<ArchetypeId, ArchetypeDefinition> Build()
        {
            var list = new[]
            {
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.SleepyOne, DisplayName = "The Sleepy One",
                    Description = "Cheap, slow and easy to handle. Yawns a lot.",
                    AcquisitionCost = 8, BaseSaleValue = 40, MovementTendency = 0.15f, NoiseTendency = 0.1f,
                    PrepDurationSeconds = 1.5f, SerumWindowMultiplier = 1.1f, HandlingDifficulty = 0f,
                    Special = SpecialBehavior.None, UnlockDay = 1,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.Wiggler, DisplayName = "The Wiggler",
                    Description = "Struggles out of loose grips. Use the cradle.",
                    AcquisitionCost = 10, BaseSaleValue = 48, MovementTendency = 0.55f, NoiseTendency = 0.2f,
                    PrepDurationSeconds = 2.5f, SerumWindowMultiplier = 0.85f, HandlingDifficulty = 0.5f,
                    Special = SpecialBehavior.SlipsGrip, UnlockDay = 3,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.Performer, DisplayName = "The Performer",
                    Description = "Holds gorgeous poses. Customers stare at it a little too long.",
                    AcquisitionCost = 14, BaseSaleValue = 65, MovementTendency = 0.35f, NoiseTendency = 0.3f,
                    PrepDurationSeconds = 2f, SerumWindowMultiplier = 1f, HandlingDifficulty = 0.25f,
                    Special = SpecialBehavior.DrawsAttention, UnlockDay = 6,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.Heavy, DisplayName = "The Heavy One",
                    Description = "Valuable. Slows you down and jams light conveyors.",
                    AcquisitionCost = 16, BaseSaleValue = 80, MovementTendency = 0.2f, NoiseTendency = 0.2f,
                    PrepDurationSeconds = 3.5f, SerumWindowMultiplier = 1.2f, HandlingDifficulty = 0.2f,
                    Special = SpecialBehavior.HeavyLoad, UnlockDay = 7,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.Screamer, DisplayName = "The Screamer",
                    Description = "Makes muffled sounds when stressed. Soundproofing helps.",
                    AcquisitionCost = 12, BaseSaleValue = 55, MovementTendency = 0.3f, NoiseTendency = 0.85f,
                    PrepDurationSeconds = 2f, SerumWindowMultiplier = 0.9f, HandlingDifficulty = 0.35f,
                    Special = SpecialBehavior.MuffledNoise, UnlockDay = 8,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.EscapeArtist, DisplayName = "The Escape Artist",
                    Description = "Watches doors. Never leave its station unattended.",
                    AcquisitionCost = 15, BaseSaleValue = 70, MovementTendency = 0.6f, NoiseTendency = 0.2f,
                    PrepDurationSeconds = 2.5f, SerumWindowMultiplier = 0.75f, HandlingDifficulty = 0.6f,
                    Special = SpecialBehavior.SeeksExits, UnlockDay = 10,
                },
                new ArchetypeDefinition
                {
                    Id = ArchetypeId.Watcher, DisplayName = "The Watcher",
                    Description = "Rarely moves while observed. Changes position when unseen.",
                    AcquisitionCost = 20, BaseSaleValue = 95, MovementTendency = 0.5f, NoiseTendency = 0.05f,
                    PrepDurationSeconds = 3f, SerumWindowMultiplier = 1f, HandlingDifficulty = 0.4f,
                    Special = SpecialBehavior.MovesUnobserved, UnlockDay = 12,
                },
            };
            var dict = new Dictionary<ArchetypeId, ArchetypeDefinition>();
            foreach (var d in list) dict[d.Id] = d;
            return dict;
        }
    }

    public static class CharacterNames
    {
        static readonly string[] First =
        {
            "Pim", "Odette", "Bram", "Wren", "Tobiah", "Mags", "Ferris", "Nell", "Otto", "Juniper",
            "Hollis", "Birdie", "Cass", "Dov", "Elsie", "Grigor", "Ines", "Lark", "Mo", "Quill",
        };

        public static string Generate(DeterministicRandom rng, int id)
        {
            return First[rng.Range(0, First.Length)] + " #" + id;
        }
    }
}
