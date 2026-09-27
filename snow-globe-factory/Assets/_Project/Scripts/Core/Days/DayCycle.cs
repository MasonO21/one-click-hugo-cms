using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public struct DaySummary
    {
        public int Day;
        public int Revenue;
        public int Expenses;
        public int OperatingCost;
        public int Refunds;
        public int GlobesSold;
        public int GlobesProduced;
        public int CustomersLost;
        public int KitsRuined;
        public float Exposure;
        public ExposureLevel ExposureLevel;
        public ClosureVerdict Verdict;
        public int Net { get { return Revenue - Expenses - OperatingCost - Refunds; } }
    }

    /// <summary>
    /// Before opening (time frozen, prep stock) -> Open (clock runs, customers arrive)
    /// -> After closing (bills, repairs, upgrades, save). The player chooses when to open
    /// and may close early.
    /// </summary>
    public sealed class DayCycle
    {
        readonly GameState _state;

        public DayCycle(GameState state) { _state = state; }

        DayState D { get { return _state.Day; } }

        public bool IsOpen { get { return D.Phase == DayPhase.Open; } }

        public float MinutesOpen { get { return D.ClockMinutes - GameBalance.OpeningHourMinutes; } }

        public string ClockText
        {
            get
            {
                int total = (int)D.ClockMinutes;
                int h = total / 60, m = total % 60;
                string suffix = h >= 12 ? "pm" : "am";
                int h12 = h % 12 == 0 ? 12 : h % 12;
                return h12 + ":" + m.ToString("00") + suffix;
            }
        }

        public ActionResult OpenStore()
        {
            if (D.Phase != DayPhase.BeforeOpening) return ActionResult.Fail("The shop can only open once per day.");
            D.Phase = DayPhase.Open;
            return ActionResult.Ok("Sign flipped to OPEN.");
        }

        /// <summary>Advances the clock. Returns true on the frame closing time is reached.</summary>
        public bool Tick(float dt)
        {
            if (D.Phase != DayPhase.Open) return false;
            bool wasBefore = D.ClockMinutes < GameBalance.ClosingHourMinutes;
            D.ClockMinutes += dt / GameBalance.RealSecondsPerGameMinute;
            return wasBefore && D.ClockMinutes >= GameBalance.ClosingHourMinutes;
        }

        public bool PastClosingTime { get { return D.ClockMinutes >= GameBalance.ClosingHourMinutes; } }

        /// <summary>Closes the shop (early or on time): charges operating costs and processes returns.</summary>
        public DaySummary CloseStore()
        {
            var summary = new DaySummary { Day = D.Day };
            if (D.Phase == DayPhase.AfterClosing) return Summarize(summary);

            D.Phase = DayPhase.AfterClosing;
            _state.Wallet.ChargeBill(GameBalance.DailyOperatingCost);
            summary.OperatingCost = GameBalance.DailyOperatingCost;
            ProcessReturns();
            summary.Verdict = _state.Exposure.EndOfDay();
            return Summarize(summary);
        }

        DaySummary Summarize(DaySummary s)
        {
            var st = D.Stats;
            s.Revenue = st.Revenue;
            s.Expenses = st.Expenses;
            s.GlobesSold = st.GlobesSold;
            s.GlobesProduced = st.GlobesProduced;
            s.CustomersLost = st.CustomersLost;
            s.KitsRuined = st.KitsRuined;
            s.Refunds = st.Refunds;
            if (s.OperatingCost == 0 && D.Phase == DayPhase.AfterClosing) s.OperatingCost = GameBalance.DailyOperatingCost;
            s.Exposure = _state.Exposure.Value;
            s.ExposureLevel = _state.Exposure.Level;
            return s;
        }

        /// <summary>At high exposure, customers bring back defective globes they bought today. They come back in their box.</summary>
        void ProcessReturns()
        {
            float chance = _state.Exposure.RefundChance;
            if (chance <= 0f) return;
            foreach (var p in _state.Products)
            {
                if (p.Stage != ProductStage.Sold || p.SoldOnDay != D.Day || p.Certified) continue;
                if (p.SealIntegrity >= GameBalance.DefectRevealThreshold) continue;
                if (!_state.Rng.Chance(chance)) continue;
                _state.Wallet.Refund(p.SoldPrice);
                D.Stats.Refunds += p.SoldPrice;
                p.Stage = ProductStage.Packaged;
                p.Location = ProductLocation.At(StationId.Counter);
                p.SoldPrice = 0;
            }
        }

        public ActionResult StartNextDay()
        {
            if (D.Phase != DayPhase.AfterClosing) return ActionResult.Fail("Close the shop first.");
            D.Day++;
            D.Phase = DayPhase.BeforeOpening;
            D.ClockMinutes = GameBalance.OpeningHourMinutes;
            D.Stats = new DailyStats();
            D.ScriptedIncidentDone = false;
            return ActionResult.Ok("Day " + D.Day + ". " + DayProgression.Briefing(D.Day));
        }
    }

    /// <summary>What each early day introduces. Systems query this instead of hard-coding day numbers.</summary>
    public static class DayProgression
    {
        public static readonly Dictionary<int, string> Briefings = new Dictionary<int, string>
        {
            { 1, "Basic assembly and sales. Make a globe, put it on the shelf, sell it." },
            { 2, "Serum timing matters now, and cheap seals may let a figure twitch." },
            { 3, "A new shipment type: The Wiggler. Conveyors are available." },
            { 4, "Customers pick globes up for a closer look. Special orders begin." },
            { 5, "The building's wiring has been... unreliable lately." },
        };

        public static string Briefing(int day)
        {
            string text;
            return Briefings.TryGetValue(day, out text) ? text : "Business as usual. Mostly.";
        }

        public static bool SealDefectsEnabled(int day) { return day >= 2; }
        public static bool CustomersHandleGlobes(int day) { return day >= 4; }
        public static bool SpecialOrdersEnabled(int day) { return day >= 4; }

        /// <summary>How many shoppers may be inside at once.</summary>
        public static int MaxCustomers(int day) { return day < 3 ? 1 : day < 5 ? 2 : 3; }

        /// <summary>Day 5 guarantees one power failure 90 game-minutes after opening.</summary>
        public static DirectorEventId ScriptedThreat(DayState day)
        {
            if (day.Day == 5 && !day.ScriptedIncidentDone && day.Phase == DayPhase.Open
                && day.ClockMinutes - GameBalance.OpeningHourMinutes >= 90f)
            {
                return DirectorEventId.PowerFailure;
            }
            return DirectorEventId.None;
        }
    }
}
