using System;

namespace SnowGlobe.Core
{
    /// <summary>
    /// Small xorshift32 generator whose whole state is one serializable uint,
    /// so saves reproduce the same future rolls (seal defects, events, customers).
    /// </summary>
    [Serializable]
    public sealed class DeterministicRandom
    {
        const uint FallbackSeed = 0x9E3779B9u;

        public uint State = FallbackSeed;

        public DeterministicRandom() { }

        public DeterministicRandom(uint seed)
        {
            State = seed == 0 ? FallbackSeed : seed;
        }

        public uint NextUInt()
        {
            uint x = State == 0 ? FallbackSeed : State;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            State = x;
            return x;
        }

        /// <summary>Uniform float in [0, 1).</summary>
        public float NextFloat()
        {
            return (NextUInt() >> 8) * (1f / 16777216f);
        }

        public float Range(float min, float max)
        {
            return min + (max - min) * NextFloat();
        }

        /// <summary>Uniform int in [minInclusive, maxExclusive).</summary>
        public int Range(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;
            return minInclusive + (int)(NextUInt() % (uint)(maxExclusive - minInclusive));
        }

        public bool Chance(float probability)
        {
            return NextFloat() < probability;
        }
    }

    public static class MathUtil
    {
        public static float Clamp01(float v)
        {
            return v < 0f ? 0f : (v > 1f ? 1f : v);
        }

        public static float Clamp(float v, float min, float max)
        {
            return v < min ? min : (v > max ? max : v);
        }

        public static float Lerp(float a, float b, float t)
        {
            return a + (b - a) * Clamp01(t);
        }
    }

    /// <summary>Outcome of a gameplay action; Message is player-facing.</summary>
    public readonly struct ActionResult
    {
        public readonly bool Success;
        public readonly string Message;

        ActionResult(bool success, string message)
        {
            Success = success;
            Message = message;
        }

        public static ActionResult Ok(string message = "") { return new ActionResult(true, message); }
        public static ActionResult Fail(string message) { return new ActionResult(false, message); }

        public override string ToString() { return (Success ? "OK: " : "FAIL: ") + Message; }
    }
}
