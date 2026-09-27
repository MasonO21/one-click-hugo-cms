using System;
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

        /// <summary>Rent and heating, plus the electricity every installed machine draws.</summary>
        public static int OperatingCost(GameState s)
        {
            return GameBalance.DailyOperatingCost + GameBalance.ElectricityPerPowerUnit * s.Modifiers.PowerDraw;
        }

        public bool PastClosingTime { get { return D.ClockMinutes >= GameBalance.ClosingHourMinutes; } }

        /// <summary>Closes the shop (early or on time): charges operating costs and processes returns.</summary>
        public DaySummary CloseStore()
        {
            var summary = new DaySummary { Day = D.Day };
            if (D.Phase == DayPhase.AfterClosing) return Summarize(summary);

            D.Phase = DayPhase.AfterClosing;
            int bill = OperatingCost(_state);
            _state.Wallet.ChargeBill(bill);
            summary.OperatingCost = bill;
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
            if (s.OperatingCost == 0 && D.Phase == DayPhase.AfterClosing) s.OperatingCost = OperatingCost(_state);
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

        /// <summary>
        /// Notes tucked into the supplier's crates. Together they slowly reveal who is sending the
        /// shipments. Purely narrative; derived from the day, so nothing needs saving.
        /// </summary>
        public static readonly string[] SupplierNotes =
        {
            "Day 2 — 'Keep them warm. Keep them quiet. Payment on delivery, as agreed. — H.'",
            "Day 3 — 'This batch wriggles. Mind your fingers, and theirs.'",
            "Day 4 — 'Your customers ask about custom work? Wonderful. We can source to order.'",
            "Day 5 — 'The lights. Did they flicker? They always flicker when a batch is homesick.'",
            "Day 6 — 'We noticed you installed eyes downstairs. So did they.'",
            "Day 8 — 'Some of them sing when the crate is closed. Do not open the crate to listen.'",
            "Day 10 — 'You asked where they come from. You already know. Look at the little suitcases.'",
            "Day 12 — 'The Watcher is our finest work. Never turn your back on the shelf you love.'",
        };

        static int NoteDay(int index)
        {
            var text = SupplierNotes[index];
            int end = text.IndexOf(' ', 4);
            return int.Parse(text.Substring(4, end - 4));
        }

        /// <summary>The note that arrives on this morning's crate, or null.</summary>
        public static string SupplierNoteFor(int day)
        {
            for (int i = 0; i < SupplierNotes.Length; i++) if (NoteDay(i) == day) return SupplierNotes[i];
            return null;
        }

        /// <summary>Every note received so far (for the Notes tab).</summary>
        public static List<string> NotesReceived(int day)
        {
            var list = new List<string>();
            for (int i = 0; i < SupplierNotes.Length; i++) if (NoteDay(i) <= day) list.Add(SupplierNotes[i]);
            return list;
        }

        public static bool SealDefectsEnabled(int day) { return day >= 2; }
        public static bool CustomersHandleGlobes(int day) { return day >= 4; }
        public static bool SpecialOrdersEnabled(int day) { return day >= 4; }

        /// <summary>
        /// Word of mouth: walk-in rate grows 3% per day, capped at +60% (day 21). Keeps later
        /// automation worth buying once the shop has outgrown hand production (see docs/BALANCE.md).
        /// </summary>
        public static float FootTrafficMultiplier(int day) { return Math.Min(1.6f, 1f + 0.03f * (day - 1)); }

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
