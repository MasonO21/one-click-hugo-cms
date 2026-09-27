using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum DirectorEventId
    {
        None = -1,
        // Atmospheric: harmless, never create customer suspicion.
        GlobeTurnsToPlayer = 0,
        BasementLookToCorner = 1,
        ShelfTapping = 2,
        MusicDropout = 3,
        WatcherRelocates = 4,
        // Threats: real production/secrecy problems, always telegraphed first.
        PowerFailure = 5,
        EscapeAttempt = 6,
        ConveyorGrab = 7,   // threat: something small grips the belt and won't let go
        CabinetShift = 8,   // atmospheric: a character is in a different cabinet than you left it
    }

    public enum DirectorEventKind
    {
        Atmospheric,
        Threat,
    }

    public enum TensionPhase
    {
        Calm,
        Unease,
        Emergency,
        Relief,
    }

    public enum PlayerArea
    {
        Storefront,
        Backroom,
        Basement,
    }

    public struct DirectorContext
    {
        public int Day;
        public bool StoreOpen;
        public int DisplayedGlobes;
        public int HoldingCharacters;
        public int CustomersInStore;
        /// <summary>True if any customer could currently see the shelves.</summary>
        public bool CustomerWatchingShelves;
        /// <summary>Crises already happening naturally (expired serum, escaped character...).</summary>
        public int ActiveCrises;
        public PlayerArea PlayerArea;
        public bool OverPowered;
        /// <summary>A scripted threat the day plan wants now (e.g. Day 5 power failure), or None.</summary>
        public DirectorEventId ScriptedThreat;
        /// <summary>Globes currently riding the conveyor.</summary>
        public int ConveyorItems;
    }

    public sealed class DirectorEventDefinition
    {
        public DirectorEventId Id;
        public DirectorEventKind Kind;
        public int MinDay;
        public float Weight;
        public float Cooldown;
        /// <summary>Seconds of warning signs before a threat actually bites.</summary>
        public float WarningSeconds;
        public string WarningCue;
        public Func<DirectorContext, bool> Condition;
    }

    public static class DirectorEventCatalog
    {
        public static readonly DirectorEventDefinition[] All =
        {
            new DirectorEventDefinition { Id = DirectorEventId.GlobeTurnsToPlayer, Kind = DirectorEventKind.Atmospheric, MinDay = 1, Weight = 3f, Cooldown = 120f,
                Condition = c => c.DisplayedGlobes > 0 && !c.CustomerWatchingShelves && c.PlayerArea == PlayerArea.Storefront },
            new DirectorEventDefinition { Id = DirectorEventId.BasementLookToCorner, Kind = DirectorEventKind.Atmospheric, MinDay = 1, Weight = 3f, Cooldown = 150f,
                Condition = c => c.HoldingCharacters >= 2 && c.PlayerArea == PlayerArea.Basement },
            new DirectorEventDefinition { Id = DirectorEventId.ShelfTapping, Kind = DirectorEventKind.Atmospheric, MinDay = 2, Weight = 2f, Cooldown = 180f,
                Condition = c => c.DisplayedGlobes > 0 && c.CustomersInStore == 0 && c.PlayerArea != PlayerArea.Basement },
            new DirectorEventDefinition { Id = DirectorEventId.MusicDropout, Kind = DirectorEventKind.Atmospheric, MinDay = 2, Weight = 1.5f, Cooldown = 240f,
                Condition = c => c.PlayerArea != PlayerArea.Basement },
            new DirectorEventDefinition { Id = DirectorEventId.WatcherRelocates, Kind = DirectorEventKind.Atmospheric, MinDay = 12, Weight = 2f, Cooldown = 200f,
                Condition = c => c.HoldingCharacters > 0 && c.PlayerArea != PlayerArea.Basement },
            new DirectorEventDefinition { Id = DirectorEventId.PowerFailure, Kind = DirectorEventKind.Threat, MinDay = 5, Weight = 1f, Cooldown = 420f, WarningSeconds = 6f,
                WarningCue = "The lights flicker and the sealer hum drops an octave...",
                Condition = c => true },
            new DirectorEventDefinition { Id = DirectorEventId.EscapeAttempt, Kind = DirectorEventKind.Threat, MinDay = 2, Weight = 2f, Cooldown = 300f, WarningSeconds = 8f,
                WarningCue = "Scratching at a holding-room door.",
                Condition = c => c.HoldingCharacters > 0 },
            new DirectorEventDefinition { Id = DirectorEventId.ConveyorGrab, Kind = DirectorEventKind.Threat, MinDay = 3, Weight = 1.5f, Cooldown = 360f, WarningSeconds = 5f,
                WarningCue = "The conveyor shudders. Something on it is holding on.",
                Condition = c => c.ConveyorItems > 0 },
            new DirectorEventDefinition { Id = DirectorEventId.CabinetShift, Kind = DirectorEventKind.Atmospheric, MinDay = 6, Weight = 1.5f, Cooldown = 240f,
                Condition = c => c.HoldingCharacters > 0 && c.PlayerArea != PlayerArea.Basement },
        };

        public static DirectorEventDefinition Get(DirectorEventId id)
        {
            foreach (var d in All) if (d.Id == id) return d;
            return null;
        }
    }

    [Serializable]
    public sealed class EventDirectorState
    {
        public float Tension;
        public TensionPhase Phase = TensionPhase.Calm;
        public float PhaseTimer;
        public float AtmosphericCooldown = 45f;
        public List<float> Cooldowns = new List<float>();
        public DirectorEventId ActiveThreat = DirectorEventId.None;
    }

    /// <summary>
    /// Paces horror as: comfortable work -> growing unease (atmospherics) -> one manageable
    /// emergency -> relief. Never stacks a director threat on top of a natural crisis.
    /// </summary>
    public sealed class EventDirector
    {
        public const float UneaseThreshold = 0.35f;
        public const float BaseTensionPerSecond = 1f / 150f;
        public const float ReliefSeconds = 60f;

        readonly EventDirectorState _s;
        readonly DeterministicRandom _rng;
        readonly List<DirectorEventDefinition> _candidates = new List<DirectorEventDefinition>();

        public EventDirector(EventDirectorState state, DeterministicRandom rng)
        {
            _s = state;
            _rng = rng;
            while (_s.Cooldowns.Count < DirectorEventCatalog.All.Length) _s.Cooldowns.Add(0f);
        }

        public TensionPhase Phase { get { return _s.Phase; } }
        public float Tension { get { return _s.Tension; } }
        public DirectorEventId ActiveThreat { get { return _s.ActiveThreat; } }

        /// <summary>Returns an event to start this frame, or None.</summary>
        public DirectorEventId Tick(float dt, DirectorContext ctx)
        {
            for (int i = 0; i < _s.Cooldowns.Count; i++) if (_s.Cooldowns[i] > 0f) _s.Cooldowns[i] -= dt;
            if (_s.AtmosphericCooldown > 0f) _s.AtmosphericCooldown -= dt;

            if (ctx.ActiveCrises > 0 && _s.Phase != TensionPhase.Emergency)
            {
                _s.Phase = TensionPhase.Emergency;
            }

            switch (_s.Phase)
            {
                case TensionPhase.Calm:
                case TensionPhase.Unease:
                {
                    if (ctx.ScriptedThreat != DirectorEventId.None) return StartThreat(ctx.ScriptedThreat);

                    float rate = BaseTensionPerSecond * (ctx.StoreOpen ? 1.3f : 1f) * (ctx.Day <= 1 ? 0.5f : 1f);
                    _s.Tension = MathUtil.Clamp01(_s.Tension + rate * dt);
                    _s.Phase = _s.Tension >= UneaseThreshold ? TensionPhase.Unease : TensionPhase.Calm;

                    if (_s.Tension >= 1f)
                    {
                        var threat = Pick(DirectorEventKind.Threat, ctx);
                        if (threat != DirectorEventId.None) return StartThreat(threat);
                    }
                    if (_s.Phase == TensionPhase.Unease && _s.AtmosphericCooldown <= 0f)
                    {
                        var atmos = Pick(DirectorEventKind.Atmospheric, ctx);
                        if (atmos != DirectorEventId.None)
                        {
                            _s.AtmosphericCooldown = _rng.Range(40f, 80f);
                            _s.Cooldowns[(int)atmos] = DirectorEventCatalog.Get(atmos).Cooldown;
                            return atmos;
                        }
                    }
                    return DirectorEventId.None;
                }
                case TensionPhase.Emergency:
                    if (ctx.ActiveCrises == 0 && _s.ActiveThreat == DirectorEventId.None) EnterRelief();
                    return DirectorEventId.None;
                default: // Relief
                    _s.PhaseTimer -= dt;
                    if (_s.PhaseTimer <= 0f)
                    {
                        _s.Phase = TensionPhase.Calm;
                        _s.Tension = 0f;
                    }
                    return DirectorEventId.None;
            }
        }

        /// <summary>Call when the player has dealt with the active threat.</summary>
        public void ResolveThreat()
        {
            _s.ActiveThreat = DirectorEventId.None;
        }

        DirectorEventId StartThreat(DirectorEventId id)
        {
            var def = DirectorEventCatalog.Get(id);
            _s.ActiveThreat = id;
            _s.Phase = TensionPhase.Emergency;
            _s.Cooldowns[(int)id] = def.Cooldown;
            return id;
        }

        void EnterRelief()
        {
            _s.Phase = TensionPhase.Relief;
            _s.PhaseTimer = ReliefSeconds;
            _s.Tension = 0f;
        }

        DirectorEventId Pick(DirectorEventKind kind, DirectorContext ctx)
        {
            _candidates.Clear();
            float total = 0f;
            foreach (var d in DirectorEventCatalog.All)
            {
                if (d.Kind != kind || d.MinDay > ctx.Day || _s.Cooldowns[(int)d.Id] > 0f || !d.Condition(ctx)) continue;
                _candidates.Add(d);
                total += Weight(d, ctx);
            }
            if (_candidates.Count == 0) return DirectorEventId.None;
            float roll = _rng.Range(0f, total);
            foreach (var d in _candidates)
            {
                roll -= Weight(d, ctx);
                if (roll <= 0f) return d.Id;
            }
            return _candidates[_candidates.Count - 1].Id;
        }

        static float Weight(DirectorEventDefinition d, DirectorContext ctx)
        {
            if (d.Id == DirectorEventId.PowerFailure && ctx.OverPowered) return d.Weight + 2f;
            return d.Weight;
        }
    }
}
