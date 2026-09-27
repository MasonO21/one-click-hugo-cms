using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Hinged door. The panel's collider blocks both movement and customer line of sight.</summary>
    public sealed class Door : MonoBehaviour, IInteractable
    {
        public string Label = "door";
        public bool IsOpen;
        public float OpenAngle = -95f;

        public void SetOpen(bool open)
        {
            if (IsOpen == open) return;
            IsOpen = open;
            if (GameRoot.I == null) return;
            if (Label.StartsWith("cabinet")) GameRoot.I.Audio.Play(Sfx.Latch, transform.position, 0.45f, open ? 1.1f : 0.9f);
            else GameRoot.I.Audio.Play(open ? Sfx.DoorOpen : Sfx.DoorClose, transform.position, 0.55f);
        }

        public string Prompt(PlayerInteractor player) { return (IsOpen ? "E: Close " : "E: Open ") + Label; }

        public void Interact(PlayerInteractor player) { SetOpen(!IsOpen); }

        void Update()
        {
            var target = Quaternion.Euler(0f, IsOpen ? OpenAngle : 0f, 0f);
            transform.localRotation = Quaternion.RotateTowards(transform.localRotation, target, 240f * Time.deltaTime);
        }
    }

    public enum LightArea
    {
        Store,
        Backroom,
        Basement,
    }

    /// <summary>Building light with power-failure and flicker behaviour; respects the reduced-flicker option.</summary>
    public sealed class FlickerLight : MonoBehaviour
    {
        public LightArea Area;
        public float FlickerAmount;
        public bool PowerOut;
        public bool Warning;

        Light _light;
        float _base;
        float _seed;

        void Awake()
        {
            _light = GetComponent<Light>();
            _base = _light.intensity;
            _seed = Random.value * 100f;
        }

        void Update()
        {
            float target = _base;
            float t = Time.time + _seed;
            float flicker = Warning ? 0.8f : FlickerAmount;
            if (PowerOut) target = Area == LightArea.Store ? _base * 0.35f : _base * 0.08f;
            if (flicker > 0f)
            {
                if (Settings.ReducedFlicker) target *= 1f - flicker * 0.4f;
                else if (Mathf.PerlinNoise(t * 9f, 0f) < flicker * 0.7f) target *= 0.15f;
            }
            _light.intensity = Mathf.Lerp(_light.intensity, target, Time.deltaTime * 20f);
        }
    }

    /// <summary>
    /// A glass-fronted holding cabinet in the basement wall (A1, B2, ...). One character each.
    /// Open the glass door to take a character out or put one back.
    /// </summary>
    public sealed class HoldingCell : MonoBehaviour
    {
        public int Index;
        public string Label;
        public SnapSocket Socket;
        public Door Door;
        public Transform ScratchPoint;

        public ProductView Occupant { get { return Socket.Occupant; } }

        public void Setup(int index, string label, SnapSocket socket, Door door)
        {
            Index = index;
            Label = label;
            Socket = socket;
            Door = door;
            ScratchPoint = door.transform;
            Socket.Label = "cabinet " + label;
            Socket.RoamInside = true;
            Socket.Radius = 0.6f;
            Socket.RoamHalfExtents = new Vector2(0.4f, 0.18f);
            Socket.Accepts = v => v.P != null && v.P.Stage == ProductStage.Unprepared && Door.IsOpen;
            Socket.RejectReason = v => !Door.IsOpen ? "Open cabinet " + Label + " first (E on the glass)." : "Only awake characters go back in the cabinets.";
            Socket.Placed = v =>
            {
                if (v.P.Location.Kind != LocationKind.Holding || v.P.Location.Index != Index) GameRoot.I.Session.Production.Recapture(v.P, Index);
                v.P.Location = ProductLocation.Holding(Index);
            };
        }
    }

    /// <summary>Small emissive indicator that can flash (freight lift arrival light).</summary>
    public sealed class BlinkLamp : MonoBehaviour
    {
        public Color On = Palette.Busy;
        public Color Off = new Color(0.25f, 0.1f, 0.05f);
        Material _mat;
        float _until;

        void Awake()
        {
            _mat = Shapes.NewMat(Off, 1f);
            GetComponent<Renderer>().sharedMaterial = _mat;
        }

        public void Blink(float seconds) { _until = Time.time + seconds; }

        void Update()
        {
            bool lit = Time.time < _until && Mathf.Repeat(Time.time * 3f, 1f) > 0.4f;
            Color c = lit ? On : Off;
            Shapes.SetColor(_mat, c);
            Shapes.SetEmission(_mat, c * (lit ? 2.5f : 0.5f));
        }
    }

    /// <summary>A display slot. Placing a packaged globe unboxes it onto the shelf; lifting it off re-boxes it.</summary>
    public sealed class ShelfSlot : MonoBehaviour
    {
        public int Index;
        public SnapSocket Socket;

        public void Setup(int index, SnapSocket socket)
        {
            Index = index;
            Socket = socket;
            Socket.Label = "Display slot " + (index + 1);
            Socket.Radius = 0.35f;
            Socket.Accepts = v =>
            {
                var s = GameRoot.I.Session.State;
                if (v.P == null || Index >= s.ShelfCapacity) return false;
                if (v.P.Stage != ProductStage.Packaged && v.P.Stage != ProductStage.Displayed) return false;
                int id = s.Store.Slots.Count > Index ? s.Store.Slots[Index] : 0;
                return id == 0 || id == v.P.Id;
            };
            Socket.RejectReason = v => "Only packaged globes can be unboxed onto the display.";
            Socket.Placed = v =>
            {
                var r = GameRoot.I.Session.Store.Display(v.P, Index);
                if (!r.Success) GameRoot.I.Toast(r.Message, true);
            };
            Socket.Removed = v =>
            {
                if (v.P.Stage != ProductStage.Displayed) return;
                GameRoot.I.Session.Store.PullFromDisplay(v.P);
                GameRoot.I.Session.Suspicion.NotifySourceRemoved(v.P.Id);
            };
        }

        void Update()
        {
            // Premium-case slots only exist once the upgrade is bought.
            if (GameRoot.I == null || GameRoot.I.Session == null) return;
            bool available = Index < GameRoot.I.Session.State.ShelfCapacity;
            if (Socket.enabled != available) Socket.enabled = available;
        }
    }

    /// <summary>
    /// Special orders board (day 4+). E pins the next open order, and the assembly station's
    /// card then follows it. Deliver the finished box to the counter's order pickup spot.
    /// </summary>
    public sealed class OrderBoard : MonoBehaviour, IInteractable, ISecondaryInteractable
    {
        int _cursor = -1;

        static GameSession S { get { return GameRoot.I.Session; } }

        List<SpecialOrder> OpenOrders()
        {
            var list = new List<SpecialOrder>();
            foreach (var o in S.Orders.Open) list.Add(o);
            return list;
        }

        public string Status()
        {
            if (!DayProgression.SpecialOrdersEnabled(S.State.Day.Day)) return "SPECIAL ORDERS\n(first orders arrive on day 4)";
            var open = OpenOrders();
            if (open.Count == 0) return "SPECIAL ORDERS\n(none right now — new ones each morning)";
            string text = "SPECIAL ORDERS";
            var pinned = S.Orders.PinnedOrder;
            foreach (var o in open)
            {
                var theme = ThemeCatalog.Get(o.Theme);
                text += "\n" + (pinned != null && pinned.Id == o.Id ? "> " : "  ") + "#" + o.Id + " " + theme.DisplayName + " · " + MiniCharacterBody.PoseNames[o.PoseIndex] +
                        " · " + o.MinTier + "+" + (o.RequireCertified ? " · inspected" : "") + " · +$" + o.Bonus + " · due day " + o.DueDay;
            }
            return text;
        }

        public string Prompt(PlayerInteractor player)
        {
            var open = OpenOrders();
            if (open.Count == 0) return "Special orders board";
            return "E: Pin the next order (" + open.Count + " open)";
        }

        public void Interact(PlayerInteractor player)
        {
            var open = OpenOrders();
            if (open.Count == 0) return;
            _cursor = (_cursor + 1) % open.Count;
            var r = S.Orders.Pin(open[_cursor].Id);
            GameRoot.I.Toast(r.Message, !r.Success);
            GameRoot.I.Hud.Subtitle("", OrderService.Describe(open[_cursor]));
            GameRoot.I.Audio.Play(Sfx.Tap, transform.position);
        }

        public string SecondaryPrompt(PlayerInteractor player)
        {
            return S.Orders.PinnedOrder != null ? "X: Unpin the order (back to house cards)" : null;
        }

        public void SecondaryInteract(PlayerInteractor player)
        {
            S.Orders.Unpin();
            GameRoot.I.Toast("Order unpinned.");
        }
    }

    /// <summary>Checkout counter: ring up the waiting customer.</summary>
    public sealed class ServiceCounter : MonoBehaviour, IInteractable
    {
        public Transform BellPoint;

        public string Prompt(PlayerInteractor player)
        {
            var c = GameRoot.I.Customers.WaitingAtCounter;
            if (c == null) return "Checkout counter";
            var p = c.ChosenProduct;
            if (p == null) return "Checkout counter";
            var assistant = GameRoot.I.Level.Assistant;
            string help = assistant != null && assistant.isActiveAndEnabled && assistant.IsServing ? "  (your assistant is on it)" : "";
            return "E: Ring up " + p.CharacterName + " globe — $" + ReputationService.RetailPrice(GameRoot.I.Session.State, p) + help;
        }

        public void Interact(PlayerInteractor player)
        {
            var c = GameRoot.I.Customers.WaitingAtCounter;
            if (c != null) c.CompletePurchase();
        }
    }

    /// <summary>The OPEN/CLOSED sign by the door: the player decides when trading starts and may close early.</summary>
    public sealed class OpenSign : MonoBehaviour, IInteractable
    {
        public Renderer Face;
        Material _mat;
        bool _shownOpen = true;

        void Start()
        {
            _mat = Shapes.NewTexMat(Shapes.Tex("sign_closed"));
            if (Face != null) Face.sharedMaterial = _mat;
        }

        public string Prompt(PlayerInteractor player)
        {
            switch (GameRoot.I.Session.State.Day.Phase)
            {
                case DayPhase.BeforeOpening: return "E: Flip sign to OPEN (day " + GameRoot.I.Session.State.Day.Day + ")";
                case DayPhase.Open: return "E: Close early (customers inside will finish up)";
                default: return "E: Review the day and start tomorrow";
            }
        }

        public void Interact(PlayerInteractor player)
        {
            var root = GameRoot.I;
            switch (root.Session.State.Day.Phase)
            {
                case DayPhase.BeforeOpening: root.OpenShop(); break;
                case DayPhase.Open: root.RequestClose(); break;
                default: root.Hud.ShowSummary(); break;
            }
        }

        void Update()
        {
            if (_mat == null || GameRoot.I == null || GameRoot.I.Session == null) return;
            bool open = GameRoot.I.Session.Days.IsOpen && !GameRoot.I.ClosingRequested;
            if (open == _shownOpen) return;
            _shownOpen = open;
            var tex = Shapes.Tex(open ? "sign_open" : "sign_closed");
            if (tex != null) _mat.mainTexture = tex;
        }
    }

    /// <summary>Basement breaker panel. Hold E to restore power after a failure.</summary>
    public sealed class Breaker : MonoBehaviour, IInteractable
    {
        public Renderer Lamp;
        Material _mat;
        float _hold;

        void Start()
        {
            _mat = Shapes.NewMat(Palette.Ok, 1.5f);
            if (Lamp != null) Lamp.sharedMaterial = _mat;
        }

        public string Prompt(PlayerInteractor player)
        {
            if (GameRoot.I.Session.PowerAvailable) return "Breaker panel — power OK";
            return "Hold E: Reset breaker  " + Mathf.RoundToInt(_hold / 1.5f * 100f) + "%";
        }

        public void Interact(PlayerInteractor player) { }

        void Update()
        {
            if (GameRoot.I == null || GameRoot.I.Session == null) return;
            bool powered = GameRoot.I.Session.PowerAvailable;
            Color c = powered ? Palette.Ok : (Mathf.Repeat(Time.time * 2f, 1f) > 0.5f ? Palette.Bad : Color.black);
            if (_mat != null)
            {
                Shapes.SetColor(_mat, c);
                Shapes.SetEmission(_mat, c * 1.5f);
            }
            if (powered) { _hold = 0f; return; }
            var interactor = GameRoot.I.Interactor;
            if (interactor != null && interactor.Focus == (IInteractable)this && GameInput.InteractHeld)
            {
                _hold += Time.deltaTime;
                if (_hold >= 1.5f)
                {
                    _hold = 0f;
                    GameRoot.I.Horror.RestorePower();
                }
            }
            else _hold = Mathf.Max(0f, _hold - Time.deltaTime);
        }
    }
}
