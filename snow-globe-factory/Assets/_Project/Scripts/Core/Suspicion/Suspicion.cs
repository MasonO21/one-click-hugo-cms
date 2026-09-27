using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum EvidenceType
    {
        GlobeMovement = 0,
        EyesFollowing = 1,
        MuffledVoice = 2,
        EscapedCharacter = 3,
        StaffDoorNoise = 4,
        UnpreparedCarriedInPublic = 5,
    }

    public sealed class EvidenceDefinition
    {
        public EvidenceType Type;
        public float BaseAmount;
        /// <summary>Always undeniable regardless of intensity (e.g. a tiny person running past).</summary>
        public bool AlwaysUndeniable;
        /// <summary>Intensity at which a repeat sighting becomes undeniable.</summary>
        public float UndeniableIntensity;
        public string FirstReaction;
        public string RepeatReaction;
    }

    public static class EvidenceCatalog
    {
        public const int TypeCount = 6;
        static readonly EvidenceDefinition[] Definitions =
        {
            new EvidenceDefinition { Type = EvidenceType.GlobeMovement, BaseAmount = 14f, UndeniableIntensity = 0.7f, FirstReaction = "Ooh, is that one mechanical?", RepeatReaction = "That one moved. Again." },
            new EvidenceDefinition { Type = EvidenceType.EyesFollowing, BaseAmount = 9f, UndeniableIntensity = 0.9f, FirstReaction = "Cute eyes. Kind of intense.", RepeatReaction = "Its eyes are following me." },
            new EvidenceDefinition { Type = EvidenceType.MuffledVoice, BaseAmount = 12f, UndeniableIntensity = 0.8f, FirstReaction = "Is there music in that one?", RepeatReaction = "Someone is talking inside that globe." },
            new EvidenceDefinition { Type = EvidenceType.EscapedCharacter, BaseAmount = 50f, AlwaysUndeniable = true, FirstReaction = "WHAT was that?!", RepeatReaction = "THERE'S ANOTHER ONE!" },
            new EvidenceDefinition { Type = EvidenceType.StaffDoorNoise, BaseAmount = 6f, UndeniableIntensity = 2f, FirstReaction = "Busy back there, huh?", RepeatReaction = "Is someone crying back there?" },
            new EvidenceDefinition { Type = EvidenceType.UnpreparedCarriedInPublic, BaseAmount = 45f, AlwaysUndeniable = true, FirstReaction = "Is that... squirming?", RepeatReaction = "It's ALIVE. You're carrying it!" },
        };

        public static EvidenceDefinition Get(EvidenceType t) { return Definitions[(int)t]; }
    }

    public enum SuspicionStage
    {
        Comfortable,
        Curious,
        Investigating,
        Alarmed,
    }

    /// <summary>
    /// Per-customer suspicion. Only fed by evidence the view layer confirmed the customer
    /// could perceive (line of sight / hearing range) — there are no random increases.
    /// First sightings read as "a mechanical feature"; repeats escalate. Undeniable evidence
    /// raises a floor that distractions cannot talk the customer below.
    /// </summary>
    public sealed class CustomerSuspicion
    {
        public const float CuriousThreshold = 25f;
        public const float InvestigatingThreshold = 50f;
        public const float AlarmedThreshold = 80f;
        public const float DecayPerSecond = 0.6f;
        public const float DistractionAmount = 20f;
        public const float DistractionCooldown = 20f;
        public const float SourceRemovedAmount = 15f;
        public const float ExchangeAmount = 25f;

        public float Value;
        public float Floor;
        public float Attentiveness = 1f;
        public int FocusSourceId = -1;
        public bool SawUndeniable;
        public bool ExchangeOffered;
        public string LastReaction = "";

        readonly int[] _sightings = new int[EvidenceCatalog.TypeCount];
        float _distractionCooldown;

        public SuspicionStage Stage { get { return StageFor(Value); } }

        public static SuspicionStage StageFor(float value)
        {
            if (value >= AlarmedThreshold) return SuspicionStage.Alarmed;
            if (value >= InvestigatingThreshold) return SuspicionStage.Investigating;
            if (value >= CuriousThreshold) return SuspicionStage.Curious;
            return SuspicionStage.Comfortable;
        }

        public int Sightings(EvidenceType t) { return _sightings[(int)t]; }

        /// <summary>
        /// Registers perceived evidence. intensity 0..1 = how blatant; perception 0..1 = how well
        /// the customer perceived it (distance, angle, muffling). Returns true if it became undeniable.
        /// </summary>
        public bool Witness(EvidenceType type, float intensity, float perception, int sourceId)
        {
            if (perception <= 0f || intensity <= 0f) return false;
            var def = EvidenceCatalog.Get(type);
            int n = ++_sightings[(int)type];
            float novelty = n == 1 ? 0.5f : MathUtil.Clamp(1f + 0.5f * (n - 2), 1f, 2.5f);
            float amount = def.BaseAmount * MathUtil.Clamp01(intensity) * MathUtil.Clamp01(perception) * novelty * Attentiveness;
            if (def.AlwaysUndeniable) amount = Math.Max(amount, def.BaseAmount);
            Value = MathUtil.Clamp(Value + amount, 0f, 100f);
            LastReaction = n == 1 ? def.FirstReaction : def.RepeatReaction;

            bool undeniable = def.AlwaysUndeniable || (n >= 2 && intensity >= def.UndeniableIntensity);
            if (undeniable)
            {
                SawUndeniable = true;
                Floor = Math.Max(Floor, Value * 0.9f);
            }
            if (Stage >= SuspicionStage.Curious && sourceId >= 0) FocusSourceId = sourceId;
            if (Stage == SuspicionStage.Alarmed) Floor = Math.Max(Floor, Value);
            return undeniable;
        }

        public bool CanBeDistracted { get { return _distractionCooldown <= 0f && Stage != SuspicionStage.Alarmed; } }

        /// <summary>Player draws attention to another product / chats. Cannot erase undeniable evidence.</summary>
        public bool TryDistract()
        {
            if (!CanBeDistracted) return false;
            Value = Math.Max(Floor, Value - DistractionAmount);
            _distractionCooldown = DistractionCooldown;
            FocusSourceId = -1;
            return true;
        }

        /// <summary>The globe (or noise source) the customer was focused on was removed or fixed.</summary>
        public void SourceRemoved(int sourceId)
        {
            if (sourceId < 0 || FocusSourceId != sourceId || Stage == SuspicionStage.Alarmed) return;
            Value = Math.Max(Floor, Value - SourceRemovedAmount);
            FocusSourceId = -1;
        }

        /// <summary>Offer to swap the globe they're investigating. Once per customer.</summary>
        public bool TryOfferExchange()
        {
            if (ExchangeOffered || Stage == SuspicionStage.Alarmed) return false;
            ExchangeOffered = true;
            Value = Math.Max(Floor, Value - ExchangeAmount);
            FocusSourceId = -1;
            return true;
        }

        public void Tick(float dt)
        {
            if (_distractionCooldown > 0f) _distractionCooldown -= dt;
            if (Stage <= SuspicionStage.Curious) Value = Math.Max(Floor, Value - DecayPerSecond * dt);
        }
    }

    public enum ExposureLevel
    {
        Quiet,
        Rumors,
        Scrutiny,
        Investigation,
    }

    public enum ClosureVerdict
    {
        None,
        Warning,
        Closure,
    }

    /// <summary>Slow, persistent business-wide exposure fed by customers who leave unsettled.</summary>
    [Serializable]
    public sealed class BusinessExposure
    {
        public float Value;
        public int SeriousIncidents;
        public bool WarningIssued;
        public int IncidentsToday;

        public ExposureLevel Level
        {
            get
            {
                if (Value >= 75f) return ExposureLevel.Investigation;
                if (Value >= 50f) return ExposureLevel.Scrutiny;
                if (Value >= 25f) return ExposureLevel.Rumors;
                return ExposureLevel.Quiet;
            }
        }

        /// <summary>Customers notice more as rumours spread.</summary>
        public float CustomerAttentiveness { get { return 1f + Value / 100f; } }

        /// <summary>Fewer walk-ins at high exposure (lost sales).</summary>
        public float ArrivalRateMultiplier { get { return 1f - 0.4f * MathUtil.Clamp01(Value / 100f); } }

        /// <summary>Chance per sold defective globe that it is brought back at the end of the day.</summary>
        public float RefundChance { get { return Value >= 50f ? 0.25f + (Value - 50f) / 200f : 0f; } }

        public void OnCustomerLeft(SuspicionStage stage, bool sawUndeniable)
        {
            switch (stage)
            {
                case SuspicionStage.Curious: Add(1f); break;
                case SuspicionStage.Investigating: Add(4f); break;
                case SuspicionStage.Alarmed: Add(12f); SeriousIncidents++; IncidentsToday++; break;
            }
            if (sawUndeniable) Add(3f);
        }

        public void Add(float amount)
        {
            Value = MathUtil.Clamp(Value + amount, 0f, 100f);
        }

        /// <summary>
        /// End-of-day review. Closure needs very high exposure, repeated serious incidents AND
        /// a warning issued on an earlier day, so it never comes out of nowhere.
        /// </summary>
        public ClosureVerdict EndOfDay()
        {
            ClosureVerdict verdict = ClosureVerdict.None;
            if (Value >= 90f && SeriousIncidents >= 3)
            {
                verdict = WarningIssued ? ClosureVerdict.Closure : ClosureVerdict.Warning;
                WarningIssued = true;
            }
            if (IncidentsToday == 0) Add(-8f);
            if (Value < 60f) WarningIssued = false;
            IncidentsToday = 0;
            return verdict;
        }
    }

    /// <summary>Tracks live customers' suspicion by customer id (transient, not saved).</summary>
    public sealed class SuspicionRegistry
    {
        readonly Dictionary<int, CustomerSuspicion> _customers = new Dictionary<int, CustomerSuspicion>();

        public CustomerSuspicion Register(int customerId, float attentiveness)
        {
            var s = new CustomerSuspicion { Attentiveness = attentiveness };
            _customers[customerId] = s;
            return s;
        }

        public CustomerSuspicion Get(int customerId)
        {
            CustomerSuspicion s;
            return _customers.TryGetValue(customerId, out s) ? s : null;
        }

        public void Remove(int customerId) { _customers.Remove(customerId); }

        public void NotifySourceRemoved(int sourceId)
        {
            foreach (var s in _customers.Values) s.SourceRemoved(sourceId);
        }

        public void Tick(float dt)
        {
            foreach (var s in _customers.Values) s.Tick(dt);
        }

        public int Count { get { return _customers.Count; } }
    }
}
