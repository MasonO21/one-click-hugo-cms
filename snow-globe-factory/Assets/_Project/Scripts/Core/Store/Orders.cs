using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum OrderState
    {
        Open,
        Fulfilled,
        Expired,
    }

    /// <summary>A customer's special request, posted on the storefront order board (from day 4).</summary>
    [Serializable]
    public sealed class SpecialOrder
    {
        public int Id;
        public string Customer;
        public OrderState State;
        public int PoseIndex;
        /// <summary>Scenery for the three spots, same base-4 encoding as Product.DecorationCode.</summary>
        public int SceneryCode;
        public ThemeId Theme;
        public bool SpecificArchetype;
        public ArchetypeId Archetype;
        public QualityTier MinTier;
        public bool RequireCertified;
        public int Bonus;
        public int PostedDay;
        public int DueDay;

        public int SceneryAt(int spot) { return (SceneryCode >> (spot * 2)) & 3; }
    }

    /// <summary>
    /// What the assembly station asks for: the pinned special order if there is one, otherwise a
    /// house "order card" derived from the product so it survives reloads.
    /// </summary>
    public struct AssemblyCard
    {
        public const int PoseCount = 4;

        public int Pose;
        public int SceneryCode;
        public ThemeId Theme;
        public int OrderId;

        public bool FromOrder { get { return OrderId != 0; } }
        public int SceneryAt(int spot) { return (SceneryCode >> (spot * 2)) & 3; }

        public static AssemblyCard For(GameState s, Product p)
        {
            var order = OrderService.Pinned(s);
            if (order != null)
                return new AssemblyCard { Pose = order.PoseIndex, SceneryCode = order.SceneryCode, Theme = order.Theme, OrderId = order.Id };
            int code = 0;
            for (int spot = 0; spot < 3; spot++) code |= ((p.Id * 5 + spot * 3 + 1) % 3) << (spot * 2);
            return new AssemblyCard { Pose = (p.Id * 7 + 3) % PoseCount, SceneryCode = code, Theme = s.ActiveTheme };
        }
    }

    public sealed class OrderService
    {
        public const int MaxOpen = 3;
        public const int DaysToFulfil = 2;
        static readonly string[] Names = { "Mrs. Aldous", "Mr. Penhaligon", "the Voss twins", "Dr. Marchetti", "Little Oona", "Father Brennan", "Ms. Okafor", "a man in grey" };
        static readonly string[] PoseNames = { "Joyful Wave", "Little Skater", "Caroler", "Snow Angel" };

        readonly GameState _state;

        public OrderService(GameState state) { _state = state; }

        public IEnumerable<SpecialOrder> Open
        {
            get { foreach (var o in _state.Orders) if (o.State == OrderState.Open) yield return o; }
        }

        public int OpenCount
        {
            get
            {
                int n = 0;
                foreach (var o in _state.Orders) if (o.State == OrderState.Open) n++;
                return n;
            }
        }

        public static SpecialOrder Pinned(GameState s)
        {
            if (s.PinnedOrderId == 0) return null;
            foreach (var o in s.Orders) if (o.Id == s.PinnedOrderId && o.State == OrderState.Open) return o;
            return null;
        }

        public SpecialOrder PinnedOrder { get { return Pinned(_state); } }

        public SpecialOrder Find(int id)
        {
            foreach (var o in _state.Orders) if (o.Id == id) return o;
            return null;
        }

        public ActionResult Pin(int orderId)
        {
            var o = Find(orderId);
            if (o == null || o.State != OrderState.Open) return ActionResult.Fail("That order isn't open.");
            _state.PinnedOrderId = o.Id;
            return ActionResult.Ok("Pinned order #" + o.Id + " — the assembly card now follows it.");
        }

        public void Unpin() { _state.PinnedOrderId = 0; }

        /// <summary>Expires overdue orders and posts new ones. Call at the start of each day.</summary>
        public List<SpecialOrder> OnNewDay()
        {
            var posted = new List<SpecialOrder>();
            int day = _state.Day.Day;
            foreach (var o in _state.Orders)
            {
                if (o.State == OrderState.Open && o.DueDay < day)
                {
                    o.State = OrderState.Expired;
                    if (_state.PinnedOrderId == o.Id) _state.PinnedOrderId = 0;
                }
            }
            if (!DayProgression.SpecialOrdersEnabled(day)) return posted;
            int wanted = 1 + day % 2;
            for (int i = 0; i < wanted && OpenCount < MaxOpen; i++) posted.Add(Generate(day));
            return posted;
        }

        SpecialOrder Generate(int day)
        {
            var rng = _state.Rng;
            var o = new SpecialOrder
            {
                Id = _state.NextOrderId++,
                Customer = Names[rng.Range(0, Names.Length)],
                State = OrderState.Open,
                PoseIndex = rng.Range(0, AssemblyCard.PoseCount),
                Theme = _state.UnlockedThemes[rng.Range(0, _state.UnlockedThemes.Count)],
                PostedDay = day,
                DueDay = day + DaysToFulfil,
            };
            for (int spot = 0; spot < 3; spot++) o.SceneryCode |= rng.Range(0, 3) << (spot * 2);
            float roll = rng.NextFloat();
            o.MinTier = roll < 0.5f ? QualityTier.Standard : roll < 0.9f ? QualityTier.Fine : QualityTier.Exquisite;
            o.RequireCertified = rng.Chance(0.3f);
            var available = new List<ArchetypeId>();
            foreach (var a in ArchetypeCatalog.All) if (a.UnlockDay <= day) available.Add(a.Id);
            if (available.Count > 1 && rng.Chance(0.3f))
            {
                o.SpecificArchetype = true;
                o.Archetype = available[rng.Range(0, available.Count)];
            }
            // The bonus is on top of the globe's normal price and scales with the extra work asked.
            float bonus = 15f + 10f * (int)o.MinTier + (o.RequireCertified ? 10f : 0f) + (o.SpecificArchetype ? 10f : 0f);
            o.Bonus = (int)(bonus * ThemeCatalog.Get(o.Theme).ValueMultiplier + 0.5f);
            _state.Orders.Add(o);
            return o;
        }

        public static string Describe(SpecialOrder o)
        {
            var theme = ThemeCatalog.Get(o.Theme);
            string scenery = "";
            for (int spot = 0; spot < 3; spot++) scenery += theme.Scenery[o.SceneryAt(spot)] + (spot < 2 ? ", " : "");
            string who = o.SpecificArchetype ? ArchetypeCatalog.Get(o.Archetype).DisplayName : "any figure";
            return "#" + o.Id + " for " + o.Customer + ": " + theme.DisplayName + ", " + who + ", " + PoseNames[o.PoseIndex % PoseNames.Length] +
                   ", with " + scenery + ". " + o.MinTier + " or better" + (o.RequireCertified ? ", inspected" : "") +
                   ". Bonus $" + o.Bonus + ", due day " + o.DueDay + ".";
        }

        /// <summary>Does this boxed globe satisfy the order? Reason explains the first mismatch.</summary>
        public static bool Matches(SpecialOrder o, Product p, out string reason)
        {
            reason = "";
            if (o == null || o.State != OrderState.Open) { reason = "That order isn't open."; return false; }
            if (p == null || p.Stage != ProductStage.Packaged) { reason = "Orders go out boxed."; return false; }
            if (p.Theme != o.Theme) { reason = "Wrong theme (needs " + ThemeCatalog.Get(o.Theme).DisplayName + ")."; return false; }
            if (o.SpecificArchetype && p.Archetype != o.Archetype) { reason = "They asked for " + ArchetypeCatalog.Get(o.Archetype).DisplayName + "."; return false; }
            if (p.PoseIndex != o.PoseIndex) { reason = "Wrong pose (needs " + PoseNames[o.PoseIndex % PoseNames.Length] + ")."; return false; }
            if (p.DecorationCode != o.SceneryCode) { reason = "Scenery doesn't match the order."; return false; }
            if (QualityModel.Tier(QualityModel.Compute(p)) < o.MinTier) { reason = "Quality too low (needs " + o.MinTier + ")."; return false; }
            if (o.RequireCertified && !p.Certified) { reason = "It must be inspected first."; return false; }
            return true;
        }

        /// <summary>Hands a matching boxed globe over: pays price + bonus once, the globe leaves the game as sold.</summary>
        public int Fulfil(SpecialOrder o, Product p, out ActionResult result)
        {
            string reason;
            if (!Matches(o, p, out reason)) { result = ActionResult.Fail(reason); return 0; }
            int paid = ReputationService.RetailPrice(_state, p) + o.Bonus;
            p.Stage = ProductStage.Sold;
            p.Location = ProductLocation.Gone();
            p.SoldPrice = paid;
            p.SoldOnDay = _state.Day.Day;
            o.State = OrderState.Fulfilled;
            if (_state.PinnedOrderId == o.Id) _state.PinnedOrderId = 0;
            _state.Wallet.Earn(paid);
            _state.Day.Stats.Revenue += paid;
            _state.Day.Stats.GlobesSold++;
            _state.LifetimeGlobesSold++;
            result = ActionResult.Ok("Order #" + o.Id + " delivered to " + o.Customer + ". Paid $" + paid + " (incl. $" + o.Bonus + " bonus).");
            return paid;
        }
    }
}
