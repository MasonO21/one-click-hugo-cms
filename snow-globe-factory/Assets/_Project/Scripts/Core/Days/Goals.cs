using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum GoalKind
    {
        SellGlobes,
        SellTheme,
        SellCertified,
        SellFine,
        FulfilOrder,
        CalmDay,
    }

    [Serializable]
    public sealed class DailyGoal
    {
        public GoalKind Kind;
        public ThemeId Theme;
        public int Target = 1;
        public int Progress;
        public int Reward;
        public bool Done;
        public bool Failed;

        public string Describe()
        {
            switch (Kind)
            {
                case GoalKind.SellGlobes: return "Sell " + Target + " globes";
                case GoalKind.SellTheme: return "Sell " + Target + " " + ThemeCatalog.Get(Theme).DisplayName + " globes";
                case GoalKind.SellCertified: return "Sell " + Target + " inspected globes";
                case GoalKind.SellFine: return "Sell " + Target + (Target == 1 ? " globe" : " globes") + " of Fine quality or better";
                case GoalKind.FulfilOrder: return "Fill a special order";
                default: return "No customer leaves unsettled";
            }
        }
    }

    [Serializable]
    public sealed class GoalState
    {
        public List<DailyGoal> Today = new List<DailyGoal>();
        /// <summary>The day these goals belong to.</summary>
        public int Day;
        /// <summary>Consecutive days with every goal done.</summary>
        public int Streak;
        public int LastDone, LastTotal, LastBonus;
        /// <summary>"Goal complete" lines for the view layer to show (not saved).</summary>
        [NonSerialized] public List<string> Messages = new List<string>();
    }

    /// <summary>
    /// Three small goals each morning, with a cash reward each and a growing bonus for clearing all three several days
    /// running. They give each day a shape without adding a new currency: sell a theme, sell inspected stock, keep the
    /// shop calm.
    /// </summary>
    public static class GoalRules
    {
        public const int PerDay = 3;
        public const int StreakStep = 3;
        public const int StreakCap = 20;

        /// <param name="rng">Randomness for the pick; defaults to the game's own. Save repair passes a derived one so loading
        /// never advances the game's random sequence.</param>
        public static void NewDay(GameState s, DeterministicRandom rng = null)
        {
            if (rng == null) rng = s.Rng;
            var g = s.Goals;
            g.Today.Clear();
            g.Day = s.Day.Day;
            int day = s.Day.Day;
            // Rewards grow with the economy but stay a side dish (about a tenth of a day's profit), so goals shape the day
            // without changing the campaign's pace (checked with tools/BalanceSim).
            float scale = 1f + 0.1f * (day - 1);
            if (day <= 1)
            {
                Add(g, GoalKind.SellGlobes, 2, 5, ThemeId.WinterVillage);
                Add(g, GoalKind.SellFine, 1, 5, ThemeId.WinterVillage);
                Add(g, GoalKind.CalmDay, 1, 5, ThemeId.WinterVillage);
                return;
            }
            var pool = new List<GoalKind> { GoalKind.SellGlobes, GoalKind.SellCertified, GoalKind.SellFine, GoalKind.CalmDay };
            ThemeId theme = ThemeId.WinterVillage;
            if (s.UnlockedThemes.Count >= 2)
            {
                var others = s.UnlockedThemes.FindAll(t => t != ThemeId.WinterVillage);
                theme = others[rng.Range(0, others.Count)];
                pool.Add(GoalKind.SellTheme);
            }
            if (DayProgression.SpecialOrdersEnabled(day)) pool.Add(GoalKind.FulfilOrder);
            for (int i = 0; i < PerDay && pool.Count > 0; i++)
            {
                var kind = pool[rng.Range(0, pool.Count)];
                pool.Remove(kind);
                switch (kind)
                {
                    case GoalKind.SellGlobes: { int n = Math.Min(10, 2 + day / 3); Add(g, kind, n, (int)(2 * n * scale), theme); break; }
                    case GoalKind.SellTheme: Add(g, kind, 2, (int)(12 * scale), theme); break;
                    case GoalKind.SellCertified: Add(g, kind, 2, (int)(10 * scale), theme); break;
                    case GoalKind.SellFine: { int n = Math.Min(3, 1 + day / 8); Add(g, kind, n, (int)(10 * n * scale), theme); break; }
                    case GoalKind.FulfilOrder: Add(g, kind, 1, (int)(15 * scale), theme); break;
                    default: Add(g, kind, 1, (int)(8 * scale), theme); break;
                }
            }
        }

        static void Add(GoalState g, GoalKind kind, int target, int reward, ThemeId theme)
        {
            g.Today.Add(new DailyGoal { Kind = kind, Target = target, Reward = reward, Theme = theme });
        }

        /// <summary>A globe left the shop sold (walk-in, collector or order).</summary>
        public static void OnSale(GameState s, Product p)
        {
            foreach (var goal in s.Goals.Today)
            {
                if (goal.Done || goal.Failed) continue;
                bool counts = goal.Kind == GoalKind.SellGlobes
                    || (goal.Kind == GoalKind.SellTheme && p.Theme == goal.Theme)
                    || (goal.Kind == GoalKind.SellCertified && p.Certified)
                    || (goal.Kind == GoalKind.SellFine && QualityModel.Tier(QualityModel.Compute(p)) >= QualityTier.Fine);
                if (counts) Advance(s, goal);
            }
        }

        public static void OnOrderFulfilled(GameState s)
        {
            foreach (var goal in s.Goals.Today)
                if (!goal.Done && goal.Kind == GoalKind.FulfilOrder) Advance(s, goal);
        }

        /// <summary>A customer left the shop investigating or alarmed.</summary>
        public static void OnUnsettledCustomer(GameState s)
        {
            foreach (var goal in s.Goals.Today)
                if (!goal.Done && goal.Kind == GoalKind.CalmDay) goal.Failed = true;
        }

        static void Advance(GameState s, DailyGoal goal)
        {
            goal.Progress++;
            if (goal.Progress >= goal.Target) Complete(s, goal);
        }

        static void Complete(GameState s, DailyGoal goal)
        {
            if (goal.Done) return;
            goal.Done = true;
            goal.Progress = goal.Target;
            s.Wallet.Earn(goal.Reward);
            Messages(s).Add("Goal complete: " + goal.Describe() + "  +$" + goal.Reward);
        }

        /// <summary>
        /// Closing time: a calm day counts if at least one globe was sold and nobody left unsettled. Clearing every goal
        /// extends the streak and pays its bonus; missing one resets it. Call once per day.
        /// </summary>
        public static void EndOfDay(GameState s)
        {
            var g = s.Goals;
            foreach (var goal in g.Today)
                if (goal.Kind == GoalKind.CalmDay && !goal.Done && !goal.Failed && s.Day.Stats.GlobesSold > 0) Complete(s, goal);
            int done = g.Today.FindAll(x => x.Done).Count;
            g.LastDone = done;
            g.LastTotal = g.Today.Count;
            g.LastBonus = 0;
            if (g.Today.Count > 0 && done == g.Today.Count)
            {
                g.Streak++;
                g.LastBonus = Math.Min(StreakCap, StreakStep * g.Streak);
                s.Wallet.Earn(g.LastBonus);
                Messages(s).Add("Every goal done! " + g.Streak + "-day streak  +$" + g.LastBonus);
            }
            else g.Streak = 0;
        }

        public static List<string> Messages(GameState s)
        {
            if (s.Goals.Messages == null) s.Goals.Messages = new List<string>();
            return s.Goals.Messages;
        }
    }
}
