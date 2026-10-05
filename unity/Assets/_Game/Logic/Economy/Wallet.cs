using System;

namespace AetherRift.Economy
{
    public sealed class Wallet
    {
        public long Coins { get; private set; }
        public long Gems { get; private set; }
        public Wallet(long coins = 0, long gems = 0) { Coins = coins; Gems = gems; }
        public void AddCoins(long n) { if (n < 0) throw new ArgumentOutOfRangeException(nameof(n)); Coins += n; }
        public void AddGems(long n) { if (n < 0) throw new ArgumentOutOfRangeException(nameof(n)); Gems += n; }
        public bool TrySpendCoins(long n) { if (n < 0 || Coins < n) return false; Coins -= n; return true; }
        public bool TrySpendGems(long n) { if (n < 0 || Gems < n) return false; Gems -= n; return true; }
    }
}
