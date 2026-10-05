using System;

namespace AetherRift.Gameplay
{
    /// <summary>Engine-agnostic health/shield/stun, shared by heroes, minions, towers and camps.</summary>
    public sealed class Vitals
    {
        public float Max { get; private set; }
        public float Hp { get; private set; }
        public float Shield { get; private set; }
        public float StunTime { get; private set; }
        public bool Dead => Hp <= 0;
        public Vitals(float max) { Max = max; Hp = max; }

        /// <summary>Applies damage (shield first). Returns damage that reached HP.</summary>
        public float TakeDamage(float amount)
        {
            if (Dead || amount <= 0) return 0;
            float absorbed = Math.Min(Shield, amount); Shield -= absorbed; amount -= absorbed;
            float dealt = Math.Min(Hp, amount); Hp -= dealt; return dealt;
        }
        public void Heal(float amount) { if (!Dead && amount > 0) Hp = Math.Min(Max, Hp + amount); }
        public void AddShield(float amount) { if (!Dead) Shield = Math.Max(Shield, amount); }
        public void Stun(float seconds) { if (!Dead) StunTime = Math.Max(StunTime, seconds); }
        public void Tick(float dt) { if (StunTime > 0) StunTime = Math.Max(0, StunTime - dt); }
        public void ScaleMax(float mult, float healFrac) { Max *= mult; Hp = Math.Min(Max, Hp + Max * healFrac); }
        public void Revive() { Hp = Max; Shield = 0; StunTime = 0; }
        public bool CanAct => !Dead && StunTime <= 0;
    }

    public static class Progression
    {
        public const int MaxLevel = 10;
        public static float XpForNext(int level) => 100f * level;
        public static float SkillScale(int level) => 1f + level * 0.06f;
        public static float RespawnSeconds(int level) => 8f + level * 1.2f;

        /// <summary>Adds XP and applies level-ups. Returns levels gained.</summary>
        public static int AddXp(ref int level, ref float xp, float gained)
        {
            int up = 0; xp += gained;
            while (level < MaxLevel && xp >= XpForNext(level)) { xp -= XpForNext(level); level++; up++; }
            return up;
        }
    }

    public sealed class Cooldown
    {
        public float Remaining { get; private set; }
        public bool Ready => Remaining <= 0;
        public bool TryUse(float duration) { if (!Ready) return false; Remaining = duration; return true; }
        public void Tick(float dt) { if (Remaining > 0) Remaining = Math.Max(0, Remaining - dt); }
    }
}
