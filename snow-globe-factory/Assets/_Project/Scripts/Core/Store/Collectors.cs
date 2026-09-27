using System.Collections.Generic;

namespace SnowGlobe.Core
{
    /// <summary>What a visiting collector is after: a particular kind of figure, or a particular theme.</summary>
    public sealed class CollectorRequest
    {
        public bool ByArchetype;
        public ArchetypeId Archetype;
        public ThemeId Theme;

        /// <summary>"Performer globe", "Haunted Manor globe".</summary>
        public string Name
        {
            get
            {
                string name = ByArchetype ? ArchetypeCatalog.Get(Archetype).DisplayName : ThemeCatalog.Get(Theme).DisplayName;
                if (name.StartsWith("The ")) name = name.Substring(4);
                return name + " globe";
            }
        }

        /// <summary>"a Performer globe", "an Escape Artist globe".</summary>
        public string Describe()
        {
            string n = Name;
            return ("AEIOU".IndexOf(n[0]) >= 0 ? "an " : "a ") + n;
        }
    }

    /// <summary>
    /// Collectors (from day 6): now and then a walk-in is a collector hunting for something specific. They pay double for
    /// it, and nothing else will do. They also look far more closely than ordinary shoppers.
    /// </summary>
    public static class Collectors
    {
        public const int FirstDay = 6;
        public const float SpawnChance = 0.15f;
        public const float Premium = 2f;
        public const float Attentiveness = 1.8f;

        /// <summary>Decides whether the next walk-in is a collector, and what they want. Null for an ordinary shopper.</summary>
        public static CollectorRequest Roll(GameState s, DeterministicRandom rng)
        {
            int day = s.Day.Day;
            if (day < FirstDay || !rng.Chance(SpawnChance)) return null;
            var figures = new List<ArchetypeId>();
            foreach (var a in ArchetypeCatalog.All)
                if (a.Id != ArchetypeId.SleepyOne && a.UnlockDay <= day) figures.Add(a.Id);
            var themes = new List<ThemeId>();
            foreach (var t in s.UnlockedThemes)
                if (t != ThemeId.WinterVillage) themes.Add(t);
            if (figures.Count == 0 && themes.Count == 0) return null;
            bool byFigure = themes.Count == 0 || (figures.Count > 0 && rng.Chance(0.5f));
            return byFigure
                ? new CollectorRequest { ByArchetype = true, Archetype = figures[rng.Range(0, figures.Count)] }
                : new CollectorRequest { ByArchetype = false, Theme = themes[rng.Range(0, themes.Count)] };
        }

        public static bool Matches(CollectorRequest r, Product p)
        {
            if (r == null || p == null) return false;
            return r.ByArchetype ? p.Archetype == r.Archetype : p.Theme == r.Theme;
        }
    }
}
