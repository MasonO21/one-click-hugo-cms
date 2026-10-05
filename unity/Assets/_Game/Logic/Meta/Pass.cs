using System.Collections.Generic;

namespace AetherRift.Meta
{
    public enum PassTrack { Free, Premium }
    public readonly struct PassReward
    {
        public readonly int Coins, Gems; public readonly string SkinId;
        public PassReward(int coins, int gems, string skin = null) { Coins = coins; Gems = gems; SkinId = skin; }
    }

    public sealed class PassProgress
    {
        public const int Levels = 20, XpPerLevel = 100;
        public int Xp; public bool Premium;
        public readonly HashSet<int> ClaimedFree = new HashSet<int>(), ClaimedPremium = new HashSet<int>();

        public int Level => System.Math.Min(Levels, Xp / XpPerLevel);
        public void AddXp(int xp) => Xp = System.Math.Min(Levels * XpPerLevel, Xp + xp);

        public static PassReward RewardFor(PassTrack track, int level) => track == PassTrack.Free
            ? (level % 5 == 0 ? new PassReward(0, 50) : new PassReward(500 * (1 + level % 3), 0))
            : (level % 10 == 0 ? new PassReward(0, 0, level == 10 ? "royal" : "solar")
              : level % 5 == 0 ? new PassReward(0, 120) : new PassReward(600, 30));

        public bool TryClaim(PassTrack track, int level, out PassReward reward)
        {
            reward = default;
            if (level < 1 || level > Level) return false;
            if (track == PassTrack.Premium && !Premium) return false;
            var set = track == PassTrack.Free ? ClaimedFree : ClaimedPremium;
            if (!set.Add(level)) return false;
            reward = RewardFor(track, level); return true;
        }
    }
}
