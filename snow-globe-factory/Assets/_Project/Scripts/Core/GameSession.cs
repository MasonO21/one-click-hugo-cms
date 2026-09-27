using System.Collections.Generic;

namespace SnowGlobe.Core
{
    /// <summary>
    /// Wires every core system around one GameState. The Unity layer owns exactly one
    /// GameSession and talks to the simulation only through it, which keeps the rules
    /// engine-independent and unit-testable.
    /// </summary>
    public sealed class GameSession
    {
        public GameState State { get; private set; }
        public ProductionService Production { get; private set; }
        public StoreService Store { get; private set; }
        public SupplyService Supply { get; private set; }
        public UpgradeService Upgrades { get; private set; }
        public DayCycle Days { get; private set; }
        public AutomationService Automation { get; private set; }
        public OrderService Orders { get; private set; }
        public ThemeService Themes { get; private set; }
        public EventDirector Director { get; private set; }
        public SuspicionRegistry Suspicion { get; private set; }

        /// <summary>1 = normal; below 1 during power failures (weakens seals, stops the sealer).</summary>
        public float PowerFactor = 1f;
        public bool PowerAvailable { get { return PowerFactor >= 0.99f; } }

        public GameSession(GameState state)
        {
            Load(state);
        }

        public static GameSession NewGame(uint seed)
        {
            return new GameSession(GameState.NewGame(seed));
        }

        /// <summary>Swaps in a loaded state (repairing it first). Returns the repair log.</summary>
        public List<string> Load(GameState state)
        {
            var log = SaveValidator.Repair(state);
            State = state;
            Production = new ProductionService(state);
            Store = new StoreService(state);
            Supply = new SupplyService(state);
            Upgrades = new UpgradeService(state);
            Days = new DayCycle(state);
            Director = new EventDirector(state.Director, state.Rng);
            Automation = new AutomationService(state, Production);
            Orders = new OrderService(state);
            Themes = new ThemeService(state);
            Suspicion = new SuspicionRegistry();
            PowerFactor = 1f;
            return log;
        }

        /// <summary>Only allowed when no customers are inside and nothing is on fire, so saves are always clean.</summary>
        public bool CanSave(out string reason)
        {
            if (State.Day.Phase == DayPhase.Open) { reason = "Close the shop before saving."; return false; }
            if (Director.ActiveThreat != DirectorEventId.None) { reason = "Deal with the current emergency first."; return false; }
            reason = "";
            return true;
        }

        /// <summary>Fills day-plan fields of the director context and marks scripted incidents as used.</summary>
        public DirectorEventId TickDirector(float dt, DirectorContext ctx)
        {
            ctx.Day = State.Day.Day;
            ctx.StoreOpen = Days.IsOpen;
            ctx.OverPowered = State.Modifiers.IsOverPowered;
            ctx.ScriptedThreat = DayProgression.ScriptedThreat(State.Day);
            var ev = Director.Tick(dt, ctx);
            if (ev != DirectorEventId.None && ev == ctx.ScriptedThreat) State.Day.ScriptedIncidentDone = true;
            return ev;
        }

        public int HoldingCount()
        {
            return State.Count(p => p.Stage == ProductStage.Unprepared && p.Location.Kind == LocationKind.Holding);
        }
    }
}
