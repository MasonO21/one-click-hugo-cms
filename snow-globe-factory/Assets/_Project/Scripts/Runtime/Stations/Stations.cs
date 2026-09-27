using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Preparation cradle: a timing dial. Press E while the needle is in the green zone to
    /// administer the (fictional) Stillness Serum. Misses make the character squirm; without
    /// the Preparation Cradle upgrade, three misses and they slip out.
    /// </summary>
    public sealed class PrepStation : StationBase
    {
        float _needle, _zoneCenter, _zoneWidth, _speed;
        int _misses;

        protected override bool Accepts(Product p) { return p.Stage == ProductStage.Unprepared; }

        protected override string RejectReason(Product p) { return "Only awake characters go in the cradle."; }

        public override string Prompt(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null) return "Preparation cradle — place an awake character here";
            return "E: Inject Stillness Serum  (" + S.State.Inventory.SerumCharges + " charges left)";
        }

        public override void Interact(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || Busy) return;
            if (S.State.Inventory.SerumCharges <= 0) { Root.Toast("Out of serum charges. Buy more in the management menu (Tab).", true); return; }
            _needle = 0f;
            _misses = 0;
            _speed = 1.1f + o.P.Definition.HandlingDifficulty;
            NewZone(o.P);
            BeginMinigame(player);
        }

        void NewZone(Product p)
        {
            _zoneWidth = S.Production.TimingZoneWidth(p);
            _zoneCenter = Random.Range(0.2f, 0.8f);
        }

        protected override void Update()
        {
            base.Update();
            if (!Busy) return;
            var o = Occupant;
            if (o == null) { CancelMinigame(); return; }
            _needle = Mathf.PingPong(Time.time * _speed, 1f);
            o.SetFigureOverride(FigureMode.Struggle, 0);
            if (!GameInput.InteractDown) return;

            float dist = Mathf.Abs(_needle - _zoneCenter);
            float half = _zoneWidth * 0.5f;
            if (dist <= half)
            {
                float score = 1f - (dist / half) * 0.5f;
                var r = S.Production.Inject(o.P, score);
                Report(r);
                if (r.Success) Root.Audio.Play(Sfx.Inject, transform.position);
                EndMinigame();
                return;
            }

            _misses++;
            o.Figure.Twitch(0.8f);
            Root.Audio.Play(Sfx.Squeak, transform.position, 0.7f);
            if (_misses >= 3 && !S.State.Modifiers.CradlePreventsSlipping)
            {
                EndMinigame();
                Root.Toast(o.P.CharacterName + " slipped out of your hands!", true);
                o.DropFree(new Vector3(Random.Range(-1f, 1f), 1.5f, Random.Range(-1f, 1f)));
                return;
            }
            NewZone(o.P);
        }

        public override void DrawGUI()
        {
            var r = PanelRect(420f, 90f);
            GUI.Box(r, "Stillness Serum — press E in the green zone   (misses: " + _misses + (S.State.Modifiers.CradlePreventsSlipping ? ", cradle holds them" : "/3") + ")");
            Needle(new Rect(r.x + 20f, r.y + 40f, r.width - 40f, 24f), _needle, _zoneCenter, _zoneWidth);
        }
    }

    /// <summary>
    /// Assembly: (1) rotate the base and choose a pose to match the order card,
    /// (2) pick scenery for three spots with keys 1-3, (3) hold E to pour snow into the band.
    /// </summary>
    public sealed class AssemblyStation : StationBase
    {
        enum Step { Pose, Scenery, Snow }

        Step _step;
        int _pose;
        float _facing;
        float _settle;
        int _spot;
        int _code;
        int _matches;
        float _snow;
        bool _pouring;

        protected override bool Accepts(Product p) { return p.Stage == ProductStage.Prepared || p.Stage == ProductStage.Mounted; }

        protected override string RejectReason(Product p) { return "Assembly needs a prepared (still) character."; }

        /// <summary>Deterministic "order card" per product so the requested look survives reloads.</summary>
        public static int RequestedPose(Product p) { return (p.Id * 7 + 3) % MiniCharacterBody.PoseNames.Length; }

        public static int RequestedScenery(Product p, int spot) { return (p.Id * 5 + spot * 3 + 1) % 3; }

        public override string Prompt(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null) return "Assembly station — place a prepared character here";
            if (o.P.Stage == ProductStage.Prepared) return "E: Pose and mount on a base  (" + S.State.Inventory.GlobeKits + " kits)";
            return "E: Add scenery and snow";
        }

        public override string Status()
        {
            var o = Occupant;
            if (o == null) return base.Status();
            string order = "Order card: " + MiniCharacterBody.PoseNames[RequestedPose(o.P)] + " · ";
            for (int i = 0; i < 3; i++) order += ProductView.SceneryNames[RequestedScenery(o.P, i)] + (i < 2 ? ", " : "");
            return base.Status() + "\n" + order;
        }

        public override void Interact(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || Busy) return;
            if (o.P.Stage == ProductStage.Prepared)
            {
                if (S.State.Inventory.GlobeKits <= 0) { Root.Toast("No globe kits. Buy more in the management menu (Tab).", true); return; }
                _step = Step.Pose;
                _pose = 0;
                _facing = Random.Range(-120f, 120f);
                _settle = 0f;
            }
            else
            {
                _step = Step.Scenery;
                _spot = 0;
                _code = 0;
                _matches = 0;
                _snow = 0f;
                _pouring = false;
            }
            BeginMinigame(player);
        }

        float Speed { get { return 1f / S.State.Modifiers.AssemblyTimeMultiplier; } }

        protected override void Update()
        {
            base.Update();
            if (!Busy) return;
            var o = Occupant;
            if (o == null) { CancelMinigame(); return; }
            var p = o.P;

            switch (_step)
            {
                case Step.Pose:
                {
                    int dir = GameInput.DirectionDown;
                    if (dir == 0) _pose = (_pose + MiniCharacterBody.PoseNames.Length - 1) % MiniCharacterBody.PoseNames.Length;
                    if (dir == 2) _pose = (_pose + 1) % MiniCharacterBody.PoseNames.Length;
                    _facing = Mathf.Clamp(_facing + GameInput.Look.x * 6f + GameInput.Scroll * 15f, -180f, 180f);
                    o.transform.localRotation = Quaternion.Euler(0f, _facing, 0f);
                    o.SetFigureOverride(FigureMode.Posed, _pose);
                    if (GameInput.InteractHeld) _settle += Time.deltaTime * Speed;
                    else _settle = Mathf.Max(0f, _settle - Time.deltaTime);
                    if (_settle >= 1.2f)
                    {
                        float facingScore = 1f - Mathf.Clamp01(Mathf.Abs(_facing) / 90f);
                        float poseScore = _pose == RequestedPose(p) ? 1f : 0.4f;
                        var r = S.Production.Mount(p, _pose, 0.6f * poseScore + 0.4f * facingScore);
                        Report(r);
                        o.transform.localRotation = Quaternion.identity;
                        EndMinigame();
                    }
                    break;
                }
                case Step.Scenery:
                {
                    int n = GameInput.NumberDown;
                    if (n > 0)
                    {
                        int item = n - 1;
                        _code |= item << (_spot * 2);
                        if (item == RequestedScenery(p, _spot)) _matches++;
                        Root.Audio.Play(Sfx.Tap, transform.position);
                        _spot++;
                        if (_spot >= 3) _step = Step.Snow;
                    }
                    break;
                }
                case Step.Snow:
                {
                    if (GameInput.InteractHeld)
                    {
                        _pouring = true;
                        _snow = Mathf.Clamp01(_snow + Time.deltaTime * 0.35f * Speed);
                    }
                    else if (_pouring)
                    {
                        p.DecorationCode = _code;
                        var r = S.Production.Decorate(p, _matches / 3f, _snow);
                        Report(r);
                        EndMinigame();
                    }
                    break;
                }
            }
        }

        public override void DrawGUI()
        {
            var o = Occupant;
            if (o == null) return;
            var r = PanelRect(520f, 120f);
            switch (_step)
            {
                case Step.Pose:
                    GUI.Box(r, "Pose: " + MiniCharacterBody.PoseNames[_pose] + "   (card wants " + MiniCharacterBody.PoseNames[RequestedPose(o.P)] + ")");
                    GUI.Label(new Rect(r.x + 20f, r.y + 28f, r.width - 40f, 40f), "A/D change pose · mouse or scroll to turn the figure to face front · hold E to settle it on the base\nFacing: " + Mathf.RoundToInt(_facing) + "°");
                    Bar(new Rect(r.x + 20f, r.y + 80f, r.width - 40f, 20f), _settle / 1.2f, Palette.Busy);
                    break;
                case Step.Scenery:
                    GUI.Box(r, "Scenery spot " + (_spot + 1) + "/3 — card wants: " + ProductView.SceneryNames[RequestedScenery(o.P, _spot)]);
                    GUI.Label(new Rect(r.x + 20f, r.y + 40f, r.width - 40f, 40f), "1: Pine Tree    2: Cottage    3: Snowman        (matches so far: " + _matches + ")");
                    break;
                default:
                    float target = ThemeCatalog.Get(o.P.Theme).SnowTarget;
                    GUI.Box(r, "Hold E to pour snow, release inside the green band");
                    Bar(new Rect(r.x + 20f, r.y + 50f, r.width - 40f, 26f), _snow, Palette.Snow, target - GameBalance.SnowPerfectTolerance, target + GameBalance.SnowPerfectTolerance);
                    break;
            }
        }
    }

    /// <summary>Sealer: drop the swinging dome when it is centred, then run the stasis seal (needs power).</summary>
    public sealed class SealerStation : StationBase
    {
        public Transform DomeGhost;
        public Light Glow;

        enum Step { Dome, Seal }

        Step _step;
        float _offset, _progress;
        const float SwingRange = 0.12f;
        const float SealSeconds = 3f;

        protected override bool Accepts(Product p) { return p.Stage == ProductStage.Decorated || p.Stage == ProductStage.Domed; }

        protected override string RejectReason(Product p) { return "The sealer takes decorated bases."; }

        public override string Prompt(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null) return "Sealing machine — place a decorated base here";
            if (!S.PowerAvailable) return "The sealer is dead. Reset the breaker in the basement.";
            return o.P.Stage == ProductStage.Decorated ? "E: Fit the dome" : "E: Activate stasis seal";
        }

        public override void Interact(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || Busy) return;
            if (!S.PowerAvailable) { Root.Toast("No power.", true); return; }
            _step = o.P.Stage == ProductStage.Decorated ? Step.Dome : Step.Seal;
            _progress = 0f;
            BeginMinigame(player);
            if (_step == Step.Seal) Root.Audio.Play(Sfx.Hum, transform.position, 0.7f);
        }

        protected override void Update()
        {
            base.Update();
            if (DomeGhost != null) DomeGhost.gameObject.SetActive(Busy && _step == Step.Dome);
            if (Glow != null) Glow.intensity = Busy && _step == Step.Seal ? 2f + Mathf.Sin(Time.time * 20f) : 0f;
            if (!Busy) return;
            var o = Occupant;
            if (o == null) { CancelMinigame(); return; }

            if (_step == Step.Dome)
            {
                _offset = Mathf.Sin(Time.time * 2.4f) * SwingRange;
                if (DomeGhost != null) DomeGhost.localPosition = new Vector3(_offset, 0.45f, 0f);
                if (GameInput.InteractDown)
                {
                    float alignment = 1f - Mathf.Abs(_offset) / SwingRange;
                    Report(S.Production.FitDome(o.P, alignment));
                    EndMinigame();
                }
                return;
            }

            if (!S.PowerAvailable)
            {
                Root.Toast("Power cut mid-seal! The dome is still unsealed.", true);
                EndMinigame();
                return;
            }
            _progress += Time.deltaTime / SealSeconds;
            if (_progress >= 1f)
            {
                var r = S.Production.Seal(o.P, S.PowerAvailable);
                Report(r);
                Root.Audio.Play(Sfx.Chime, transform.position);
                EndMinigame();
            }
        }

        public override void DrawGUI()
        {
            var r = PanelRect(420f, 90f);
            if (_step == Step.Dome)
            {
                GUI.Box(r, "Press E when the dome is centred over the base");
                Needle(new Rect(r.x + 20f, r.y + 40f, r.width - 40f, 24f), 0.5f + _offset / SwingRange * 0.5f, 0.5f, 0.12f);
            }
            else
            {
                GUI.Box(r, "Sealing... (stasis field engaging)");
                Bar(new Rect(r.x + 20f, r.y + 40f, r.width - 40f, 24f), _progress, Palette.Serum);
            }
        }
    }

    /// <summary>Inspection lamp: turn the globe with the mouse to scan it. X rejects a bad globe (character returns to holding).</summary>
    public sealed class InspectionStation : StationBase
    {
        public Light Lamp;
        float _scan;
        float _yaw;
        InspectionReport _last;
        int _lastId = -1;
        bool _twitched;

        protected override bool Accepts(Product p) { return p.Stage == ProductStage.Sealed || p.Stage == ProductStage.Inspected; }

        protected override string RejectReason(Product p) { return "Only sealed globes can be inspected."; }

        public override string Prompt(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null) return "Inspection lamp — place a sealed globe here (optional step, +10% value)";
            if (o.P.Stage == ProductStage.Sealed) return "E: Inspect under the lamp";
            return "Inspected. Take it to packaging.";
        }

        public override string SecondaryPrompt(PlayerInteractor player)
        {
            var o = Occupant;
            return o != null && o.P.Stage == ProductStage.Inspected ? "X: Reject — break it open, character back to holding" : null;
        }

        public override string Status()
        {
            var o = Occupant;
            if (o == null || o.P.Stage != ProductStage.Inspected || _lastId != o.P.Id) return base.Status();
            string s = base.Status() + "\nQuality " + QualityModel.Tier(_last.Quality) + " · $" + _last.Value;
            if (_last.Clean) return s + "\nNo defects found.";
            if (_last.MovementRisk) s += "\n! Weak seal: may MOVE";
            if (_last.NoiseRisk) s += "\n! Weak seal: may make NOISE";
            if (_last.Cracked) s += "\n! Cracked";
            if (_last.AssemblyFault) s += "\n! Sloppy assembly";
            return s;
        }

        public override void Interact(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || Busy || o.P.Stage != ProductStage.Sealed) return;
            _scan = 0f;
            _yaw = 0f;
            _twitched = false;
            BeginMinigame(player);
        }

        public override void SecondaryInteract(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || o.P.Stage != ProductStage.Inspected) return;
            Root.RejectToHolding(o);
        }

        protected override void Update()
        {
            base.Update();
            if (Lamp != null) Lamp.intensity = Busy ? 3f : 0.6f;
            if (!Busy) return;
            var o = Occupant;
            if (o == null) { CancelMinigame(); return; }
            var look = GameInput.Look;
            float spin = Mathf.Abs(look.x) + Mathf.Abs(look.y) + Mathf.Abs(GameInput.Scroll);
            _yaw += look.x * 8f + GameInput.Scroll * 20f;
            o.transform.localRotation = Quaternion.Euler(Mathf.Clamp(look.y * 4f, -20f, 20f), _yaw, 0f);
            _scan = Mathf.Clamp01(_scan + spin * 0.02f + Time.deltaTime * 0.05f);

            // A defective seal gives itself away under the lamp.
            if (!_twitched && _scan > 0.5f && o.P.SealIntegrity < GameBalance.DefectRevealThreshold)
            {
                _twitched = true;
                o.PlayStasisTwitch(0.6f);
                o.LookAt(User != null ? User.transform.position + Vector3.up * 1.6f : transform.position, 3f);
                Root.Audio.Play(Sfx.Tap, o.transform.position, 0.8f);
            }
            if (_scan >= 1f)
            {
                _last = S.Production.Inspect(o.P);
                _lastId = o.P.Id;
                o.transform.localRotation = Quaternion.identity;
                Root.Toast(_last.Clean ? "Certified. Nothing unusual." : "Defects found — consider rejecting (X).", !_last.Clean);
                EndMinigame();
            }
        }

        public override void DrawGUI()
        {
            var r = PanelRect(420f, 90f);
            GUI.Box(r, "Move the mouse to turn the globe under the lamp");
            Bar(new Rect(r.x + 20f, r.y + 40f, r.width - 40f, 24f), _scan, Palette.WarmLight);
        }
    }

    /// <summary>Packaging table: a short fold-fold-fold-tape key sequence. Mistakes and slowness lower the packaging score.</summary>
    public sealed class PackagingStation : StationBase
    {
        readonly int[] _sequence = new int[4];
        int _index, _mistakes;
        float _time;
        static readonly string[] StepNames = { "Fold left flap", "Fold right flap", "Fold lid", "Tape" };

        protected override bool Accepts(Product p) { return p.Stage == ProductStage.Sealed || p.Stage == ProductStage.Inspected; }

        protected override string RejectReason(Product p) { return "Only sealed globes can be boxed."; }

        public override string Prompt(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null) return "Packaging table — place a sealed globe here";
            return "E: Box it  (" + S.State.Inventory.PackagingBoxes + " boxes)";
        }

        public override void Interact(PlayerInteractor player)
        {
            var o = Occupant;
            if (o == null || Busy) return;
            if (S.State.Inventory.PackagingBoxes <= 0) { Root.Toast("Out of boxes. Buy more in the management menu (Tab).", true); return; }
            for (int i = 0; i < _sequence.Length; i++) _sequence[i] = Random.Range(0, 4);
            _index = 0;
            _mistakes = 0;
            _time = 0f;
            BeginMinigame(player);
        }

        protected override void Update()
        {
            base.Update();
            if (!Busy) return;
            var o = Occupant;
            if (o == null) { CancelMinigame(); return; }
            _time += Time.deltaTime;
            int dir = GameInput.DirectionDown;
            if (dir < 0) return;
            if (dir == _sequence[_index])
            {
                _index++;
                Root.Audio.Play(Sfx.Tap, transform.position);
                if (_index >= _sequence.Length)
                {
                    float score = Mathf.Clamp01(1f - _mistakes * 0.2f - Mathf.Max(0f, _time - 4f) * 0.05f);
                    Report(S.Production.Package(o.P, score));
                    EndMinigame();
                }
            }
            else
            {
                _mistakes++;
                Root.Audio.Play(Sfx.Thump, transform.position, 0.4f);
            }
        }

        public override void DrawGUI()
        {
            var r = PanelRect(420f, 100f);
            GUI.Box(r, StepNames[Mathf.Min(_index, 3)] + "   (mistakes: " + _mistakes + ")");
            string seq = "";
            for (int i = 0; i < _sequence.Length; i++) seq += (i == _index ? "[" + GameInput.DirectionGlyph(_sequence[i]) + "]" : i < _index ? " done " : "  ·  ") + "   ";
            GUI.Label(new Rect(r.x + 20f, r.y + 45f, r.width - 40f, 30f), seq);
        }
    }
}
