namespace AetherRift.Meta
{
    public static class Rank
    {
        private static readonly (string name, int min)[] Tiers =
            { ("Bronze",0),("Silver",100),("Gold",250),("Platinum",450),("Diamond",700),("Master",1000),("Grandmaster",1400) };
        public const int WinGain = 25, LossPenalty = 15;

        public static string NameOf(int trophies)
        {
            var n = Tiers[0].name; foreach (var t in Tiers) if (trophies >= t.min) n = t.name; return n;
        }
        /// <summary>Returns the new trophy total. Losing never drops below 0.</summary>
        public static int Apply(int trophies, bool won) =>
            won ? trophies + WinGain : trophies >= LossPenalty ? trophies - LossPenalty : 0;
    }
}
