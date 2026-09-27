using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum ThemeId
    {
        WinterVillage,
        WoodlandCabin,
        MedievalCastle,
        HauntedManor,
        DeepSeaRuins,
        CelestialObservatory,
    }

    public sealed class ThemeDefinition
    {
        public ThemeId Id;
        public string DisplayName;
        public float ValueMultiplier;
        /// <summary>Extra material cost on top of the standard globe kit.</summary>
        public int ExtraKitCost;
        public int UnlockCost;
        public int UnlockDay;
        /// <summary>Target snow/liquid fill for this theme (0..1).</summary>
        public float SnowTarget;
        public string ProductionNote;
    }

    public static class ThemeCatalog
    {
        static readonly Dictionary<ThemeId, ThemeDefinition> Definitions = Build();

        public static ThemeDefinition Get(ThemeId id) { return Definitions[id]; }

        public static IEnumerable<ThemeDefinition> All { get { return Definitions.Values; } }

        static Dictionary<ThemeId, ThemeDefinition> Build()
        {
            var list = new[]
            {
                new ThemeDefinition { Id = ThemeId.WinterVillage, DisplayName = "Winter Village", ValueMultiplier = 1f, ExtraKitCost = 0, UnlockCost = 0, UnlockDay = 1, SnowTarget = 0.6f, ProductionNote = "Standard snow." },
                new ThemeDefinition { Id = ThemeId.WoodlandCabin, DisplayName = "Woodland Cabin", ValueMultiplier = 1.25f, ExtraKitCost = 3, UnlockCost = 300, UnlockDay = 4, SnowTarget = 0.45f, ProductionNote = "Lighter snow; pine scenery must face the front." },
                new ThemeDefinition { Id = ThemeId.MedievalCastle, DisplayName = "Medieval Castle", ValueMultiplier = 1.6f, ExtraKitCost = 6, UnlockCost = 900, UnlockDay = 7, SnowTarget = 0.55f, ProductionNote = "Tall scenery needs the assembly jig to seat the dome." },
                new ThemeDefinition { Id = ThemeId.HauntedManor, DisplayName = "Haunted Manor", ValueMultiplier = 2f, ExtraKitCost = 10, UnlockCost = 1800, UnlockDay = 10, SnowTarget = 0.35f, ProductionNote = "Dim lighting hides small movements. Customers love it." },
                new ThemeDefinition { Id = ThemeId.DeepSeaRuins, DisplayName = "Deep-Sea Ruins", ValueMultiplier = 2.6f, ExtraKitCost = 16, UnlockCost = 3500, UnlockDay = 14, SnowTarget = 0.8f, ProductionNote = "Liquid fill instead of snow; any seal leak is visible." },
                new ThemeDefinition { Id = ThemeId.CelestialObservatory, DisplayName = "Celestial Observatory", ValueMultiplier = 3.5f, ExtraKitCost = 25, UnlockCost = 7000, UnlockDay = 18, SnowTarget = 0.3f, ProductionNote = "Star-dust fill glows; requires the premium sealer." },
            };
            var dict = new Dictionary<ThemeId, ThemeDefinition>();
            foreach (var d in list) dict[d.Id] = d;
            return dict;
        }
    }
}
