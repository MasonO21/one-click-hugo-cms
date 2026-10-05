namespace AetherRift.Meta
{
    /// <summary>Daily rewarded-ad cap. Persist server-side so clients can't reset it.</summary>
    public sealed class AdCap
    {
        public const int DailyLimit = 6;
        public string Day = ""; public int Used;
        public int Left(string today) => Day == today ? DailyLimit - Used : DailyLimit;
        public bool TryConsume(string today)
        {
            if (Day != today) { Day = today; Used = 0; }
            if (Used >= DailyLimit) return false; Used++; return true;
        }
    }
}
