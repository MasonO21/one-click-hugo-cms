using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum ProductionEventType
    {
        SerumWarning,   // prep window almost over
        SerumExpired,   // character woke up; assembly lost
        StasisMovement, // sealed figure moved (weak/defective seal)
        StasisNoise,    // sealed figure made a sound
        HoldingNoise,   // basement character made a sound
    }

    public struct ProductionEvent
    {
        public ProductionEventType Type;
        public int ProductId;
        public float Intensity;
    }

    public struct InspectionReport
    {
        public bool MovementRisk;
        public bool NoiseRisk;
        public bool Cracked;
        public bool AssemblyFault;
        public float Quality;
        public int Value;

        public bool Clean { get { return !MovementRisk && !NoiseRisk && !Cracked && !AssemblyFault; } }
    }

    /// <summary>
    /// Every production step, as a validated stage transition. The Unity layer runs the
    /// minigames and passes their 0..1 scores in; this class owns the rules.
    /// The "Stillness Serum" and stasis seal are fictional devices: a charge count,
    /// a countdown and an integrity value — nothing more.
    /// </summary>
    public sealed class ProductionService
    {
        readonly GameState _state;
        readonly List<ProductionEvent> _events = new List<ProductionEvent>();

        public ProductionService(GameState state) { _state = state; }

        UpgradeModifiers Mods { get { return _state.Modifiers; } }

        public float SerumWindowFor(Product p)
        {
            float w = GameBalance.BaseSerumWindowSeconds * p.Definition.SerumWindowMultiplier * Mods.SerumWindowMultiplier;
            return MathUtil.Clamp(w, 10f, GameBalance.MaxSerumWindowSeconds);
        }

        /// <summary>Width (0..1 of the dial) of the injection timing sweet spot.</summary>
        public float TimingZoneWidth(Product p)
        {
            float w = 0.25f * (1f - 0.5f * p.Definition.HandlingDifficulty) * Mods.PrepZoneWidthMultiplier;
            return MathUtil.Clamp(w, 0.08f, 0.6f);
        }

        public ActionResult Inject(Product p, float timingScore)
        {
            if (p == null) return ActionResult.Fail("Nobody in the cradle.");
            if (p.Stage != ProductStage.Unprepared) return ActionResult.Fail("Already prepared.");
            if (!p.Location.IsStation(StationId.PrepCradle)) return ActionResult.Fail("Put them in the preparation cradle first.");
            if (_state.Inventory.SerumCharges <= 0) return ActionResult.Fail("Out of Stillness Serum charges.");

            _state.Inventory.SerumCharges--;
            timingScore = MathUtil.Clamp01(timingScore);
            p.Stage = ProductStage.Prepared;
            p.SerumRemaining = SerumWindowFor(p) * MathUtil.Lerp(0.75f, 1f, timingScore);
            p.SerumWarningSent = false;
            p.Stress = MathUtil.Clamp01(p.Stress + (1f - timingScore) * 0.3f);
            return ActionResult.Ok(p.CharacterName + " goes still. " + (int)p.SerumRemaining + "s window.");
        }

        public ActionResult Redose(Product p)
        {
            if (p == null || !p.IsSerumActive) return ActionResult.Fail("Only prepared, unsealed characters can be re-dosed.");
            if (_state.Inventory.SerumCharges <= 0) return ActionResult.Fail("Out of Stillness Serum charges.");
            _state.Inventory.SerumCharges--;
            p.SerumRemaining = MathUtil.Clamp(p.SerumRemaining + SerumWindowFor(p) * GameBalance.RedoseWindowFraction, 0f, GameBalance.MaxSerumWindowSeconds);
            if (p.SerumRemaining > GameBalance.SerumWarningSeconds) p.SerumWarningSent = false;
            return ActionResult.Ok("Window extended to " + (int)p.SerumRemaining + "s.");
        }

        public ActionResult Mount(Product p, int poseIndex, float poseScore)
        {
            if (p == null || p.Stage != ProductStage.Prepared) return ActionResult.Fail("Needs a prepared character.");
            if (!p.Location.IsStation(StationId.Assembly)) return ActionResult.Fail("Mount at the assembly station.");
            if (_state.Inventory.GlobeKits <= 0) return ActionResult.Fail("No globe kits left.");
            var card = AssemblyCard.For(_state, p);
            var theme = ThemeCatalog.Get(card.Theme);
            if (theme.ExtraKitCost > 0)
            {
                if (!_state.Wallet.TrySpend(theme.ExtraKitCost)) return ActionResult.Fail(theme.DisplayName + " extras cost $" + theme.ExtraKitCost + ".");
                _state.Day.Stats.Expenses += theme.ExtraKitCost;
            }
            p.Theme = card.Theme;
            _state.Inventory.GlobeKits--;
            p.Stage = ProductStage.Mounted;
            p.PoseIndex = poseIndex;
            p.PoseScore = MathUtil.Clamp01(poseScore);
            return ActionResult.Ok("Posed on a base.");
        }

        public ActionResult Decorate(Product p, float decorationScore, float snowAmount)
        {
            if (p == null || p.Stage != ProductStage.Mounted) return ActionResult.Fail("Mount the character first.");
            if (!p.Location.IsStation(StationId.Assembly)) return ActionResult.Fail("Decorate at the assembly station.");
            p.DecorationScore = MathUtil.Clamp01(decorationScore);
            p.SnowAmount = MathUtil.Clamp01(snowAmount);
            p.SnowScore = SnowScoring.Score(p.SnowAmount, ThemeCatalog.Get(p.Theme).SnowTarget);
            p.Stage = ProductStage.Decorated;
            return ActionResult.Ok("Scenery and snow added.");
        }

        public ActionResult FitDome(Product p, float alignment)
        {
            if (p == null || p.Stage != ProductStage.Decorated) return ActionResult.Fail("Decorate before fitting the dome.");
            if (!p.Location.IsStation(StationId.Sealer)) return ActionResult.Fail("Fit the dome at the sealing machine.");
            p.DomeScore = MathUtil.Clamp01(alignment + Mods.DomeAlignAssist);
            p.Stage = ProductStage.Domed;
            return ActionResult.Ok(p.DomeScore > 0.8f ? "Dome seated perfectly." : "Dome seated. A little crooked.");
        }

        public float SealDefectChance(Product p)
        {
            if (!DayProgression.SealDefectsEnabled(_state.Day.Day)) return 0f;
            float misalignment = 1f - p.DomeScore;
            return MathUtil.Clamp01(GameBalance.BaseSealDefectChance * Mods.SealDefectMultiplier * (1f + misalignment));
        }

        public ActionResult Seal(Product p, bool powerAvailable)
        {
            if (p == null || p.Stage != ProductStage.Domed) return ActionResult.Fail("Fit the dome first.");
            if (!p.Location.IsStation(StationId.Sealer)) return ActionResult.Fail("Seal at the sealing machine.");
            if (!powerAvailable) return ActionResult.Fail("The sealer has no power.");

            bool defect = _state.Rng.Chance(SealDefectChance(p));
            p.SealIntegrity = defect
                ? _state.Rng.Range(GameBalance.DefectSealMin, GameBalance.DefectSealMax)
                : _state.Rng.Range(GameBalance.GoodSealMin, GameBalance.GoodSealMax);
            p.SealStrain = 0f;
            p.SerumRemaining = 0f;
            p.Stage = ProductStage.Sealed;
            _state.Day.Stats.GlobesProduced++;
            return ActionResult.Ok("Sealed. The snow settles. So do they.");
        }

        public InspectionReport Inspect(Product p)
        {
            var report = new InspectionReport();
            if (p == null || (p.Stage != ProductStage.Sealed && p.Stage != ProductStage.Inspected)) return report;
            if (!p.Location.IsStation(StationId.Inspection)) return report;

            p.Certified = true;
            p.DefectRevealed = p.SealIntegrity < GameBalance.DefectRevealThreshold;
            p.Stage = ProductStage.Inspected;

            report.MovementRisk = p.DefectRevealed && p.Definition.MovementTendency > 0.05f;
            report.NoiseRisk = p.DefectRevealed && p.Definition.NoiseTendency > 0.3f;
            report.Cracked = p.Damage > 0.3f;
            report.AssemblyFault = p.DomeScore < 0.4f || p.PoseScore < 0.2f;
            report.Quality = QualityModel.Compute(p);
            report.Value = QualityModel.EstimateValue(p);
            return report;
        }

        public ActionResult Package(Product p, float foldScore)
        {
            if (p == null || (p.Stage != ProductStage.Sealed && p.Stage != ProductStage.Inspected)) return ActionResult.Fail("Only sealed globes can be boxed.");
            if (!p.Location.IsStation(StationId.Packaging)) return ActionResult.Fail("Box it at the packaging table.");
            if (_state.Inventory.PackagingBoxes <= 0) return ActionResult.Fail("Out of packaging.");
            _state.Inventory.PackagingBoxes--;
            p.PackagingScore = MathUtil.Clamp01(foldScore);
            p.Stage = ProductStage.Packaged;
            return ActionResult.Ok("Boxed. Estimated value $" + QualityModel.EstimateValue(p) + ".");
        }

        /// <summary>Breaks a rejected globe open and returns the (unharmed) character to holding. Materials are lost.</summary>
        public ActionResult RejectToHolding(Product p, int room)
        {
            if (p == null || p.Stage < ProductStage.Sealed || p.Stage > ProductStage.Packaged) return ActionResult.Fail("Only sealed, unsold globes can be rejected.");
            p.ResetAssembly();
            p.Stage = ProductStage.Unprepared;
            p.Location = ProductLocation.Holding(room);
            return ActionResult.Ok(p.CharacterName + " goes back downstairs.");
        }

        public ActionResult Recapture(Product p, int room)
        {
            if (p == null || p.Stage != ProductStage.Unprepared) return ActionResult.Fail("Only loose characters can be returned to holding.");
            p.Location = ProductLocation.Holding(room);
            p.Stress = MathUtil.Clamp01(p.Stress + 0.1f);
            return ActionResult.Ok(p.CharacterName + " is back in holding.");
        }

        public void ApplyDamage(Product p, float amount)
        {
            if (p == null || amount <= 0f || !p.IsSealedGlobe) return;
            if (p.Stage == ProductStage.Packaged) amount *= 0.3f;
            p.Damage = MathUtil.Clamp01(p.Damage + amount);
        }

        /// <summary>
        /// Advances serum timers and stasis behaviour. powerFactor is 1 normally and drops
        /// during power failures, straining every seal. Returned list is reused each call.
        /// </summary>
        public List<ProductionEvent> Tick(float dt, float powerFactor)
        {
            _events.Clear();
            var rng = _state.Rng;
            foreach (var p in _state.Products)
            {
                if (p.IsSerumActive)
                {
                    p.SerumRemaining -= dt;
                    if (!p.SerumWarningSent && p.SerumRemaining <= GameBalance.SerumWarningSeconds)
                    {
                        p.SerumWarningSent = true;
                        _events.Add(new ProductionEvent { Type = ProductionEventType.SerumWarning, ProductId = p.Id, Intensity = 0.5f });
                    }
                    if (p.SerumRemaining <= 0f)
                    {
                        WakeUp(p);
                        _events.Add(new ProductionEvent { Type = ProductionEventType.SerumExpired, ProductId = p.Id, Intensity = 1f });
                    }
                    continue;
                }

                if (p.IsSealedGlobe)
                {
                    if (powerFactor < 1f) p.SealStrain = MathUtil.Clamp(p.SealStrain + (1f - powerFactor) * dt * 0.05f, 0f, 0.5f);
                    else if (p.SealStrain > 0f) p.SealStrain = MathUtil.Clamp(p.SealStrain - dt * 0.02f, 0f, 0.5f);

                    float weakness = 1f - p.EffectiveIntegrity;
                    float perMinute = weakness * weakness * GameBalance.StasisMovementRatePerMinute;
                    var def = p.Definition;
                    if (p.Stage != ProductStage.Packaged && rng.Chance(perMinute * def.MovementTendency * dt / 60f))
                    {
                        _events.Add(new ProductionEvent { Type = ProductionEventType.StasisMovement, ProductId = p.Id, Intensity = MathUtil.Clamp(weakness, 0.2f, 1f) });
                    }
                    if (rng.Chance(perMinute * def.NoiseTendency * dt / 60f))
                    {
                        _events.Add(new ProductionEvent { Type = ProductionEventType.StasisNoise, ProductId = p.Id, Intensity = MathUtil.Clamp(weakness * def.NoiseTendency * 2f, 0.1f, 1f) });
                    }
                    continue;
                }

                if (p.Stage == ProductStage.Unprepared && p.Location.Kind == LocationKind.Holding)
                {
                    float noisePerMinute = p.Definition.NoiseTendency * (0.3f + p.Stress);
                    if (rng.Chance(noisePerMinute * dt / 60f))
                    {
                        _events.Add(new ProductionEvent { Type = ProductionEventType.HoldingNoise, ProductId = p.Id, Intensity = p.Definition.NoiseTendency });
                    }
                    p.Stress = MathUtil.Clamp01(p.Stress - dt * 0.002f);
                }
            }
            return _events;
        }

        void WakeUp(Product p)
        {
            if (p.Stage >= ProductStage.Mounted) _state.Day.Stats.KitsRuined++;
            _state.Day.Stats.Incidents++;
            p.ResetAssembly();
            p.Stage = ProductStage.Unprepared;
            p.Stress = MathUtil.Clamp01(p.Stress + 0.4f);
            // Keep the last world position if we have one; the view layer decides where they run.
            var loc = p.Location;
            p.Location = ProductLocation.Loose(loc.X, loc.Y, loc.Z);
        }
    }
}
