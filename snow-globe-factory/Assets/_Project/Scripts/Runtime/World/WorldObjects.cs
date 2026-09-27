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
            if (GameRoot.I != null) GameRoot.I.Audio.Play(Sfx.Thump, transform.position, 0.3f, open ? 1.3f : 0.9f);
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

    /// <summary>Basement holding pen. Awake characters dropped over it are recaptured.</summary>
    public sealed class HoldingPen : MonoBehaviour
    {
        public int Room;
        public SnapSocket Socket;
        public Door Gate;
        public Transform ScratchPoint;

        public void Setup(int room, SnapSocket socket, Door gate)
        {
            Room = room;
            Socket = socket;
            Gate = gate;
            Socket.Label = "Holding pen " + (room == 0 ? "A" : "B");
            Socket.AllowMultiple = true;
            Socket.Accepts = v => v.P != null && v.P.Stage == ProductStage.Unprepared;
            Socket.RejectReason = v => "Only awake characters go back in the pens.";
            Socket.Placed = v =>
            {
                if (v.P.Location.Kind != LocationKind.Holding || v.P.Location.Index != Room) GameRoot.I.Session.Production.Recapture(v.P, Room);
                v.P.Location = ProductLocation.Holding(Room);
            };
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

    /// <summary>Checkout counter: ring up the waiting customer.</summary>
    public sealed class ServiceCounter : MonoBehaviour, IInteractable
    {
        public Transform BellPoint;

        public string Prompt(PlayerInteractor player)
        {
            var c = GameRoot.I.Customers.WaitingAtCounter;
            if (c == null) return "Checkout counter";
            var p = c.ChosenProduct;
            return p == null ? "Checkout counter" : "E: Ring up " + p.CharacterName + " globe — $" + QualityModel.EstimateValue(p);
        }

        public void Interact(PlayerInteractor player)
        {
            var c = GameRoot.I.Customers.WaitingAtCounter;
            if (c != null) c.CompletePurchase();
        }
    }

    /// <summary>The OPEN/CLOSED sign: the player decides when the day's trading starts and may close early.</summary>
    public sealed class OpenSign : MonoBehaviour, IInteractable
    {
        public Renderer Face;
        Material _mat;

        void Start()
        {
            _mat = Shapes.NewMat(Palette.Bad, 1.2f);
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
            Color c = GameRoot.I.Session.Days.IsOpen && !GameRoot.I.ClosingRequested ? Palette.Ok : Palette.Bad;
            Shapes.SetColor(_mat, c);
            Shapes.SetEmission(_mat, c * 1.2f);
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
