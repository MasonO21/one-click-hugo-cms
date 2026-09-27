using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Look-at interaction, grab/carry/place with snapping assistance, and routing of
    /// E / X / Q to whatever the player is looking at. Forgiving by design: releasing
    /// near a valid socket always snaps; precision is never required to progress.
    /// </summary>
    public sealed class PlayerInteractor : MonoBehaviour
    {
        public const float Reach = 2.6f;

        public PlayerController Controller;
        public ProductView Held { get; private set; }
        public IInteractable Focus { get; private set; }
        public ISecondaryInteractable SecondaryFocus { get; private set; }
        public ProductView FocusProduct { get; private set; }
        public IFocusMode LockedStation { get; private set; }
        public SnapSocket PlacementTarget { get; private set; }

        public string PrimaryPrompt = "";
        public string SecondaryPrompt = "";
        public string CarryPrompt = "";

        float _holdDistance = 0.75f;
        float _holdYaw;
        float _holdPitch;
        Vector3 _aimPoint;
        readonly RaycastHit[] _hits = new RaycastHit[16];

        Collider PlayerCollider { get { return Controller.GetComponent<CharacterController>(); } }

        public void LockTo(IFocusMode station)
        {
            LockedStation = station;
            Controller.Locked = true;
        }

        public void Unlock()
        {
            LockedStation = null;
            Controller.Locked = false;
        }

        void Update()
        {
            var root = GameRoot.I;
            if (root == null || root.Session == null) return;
            if (LockedStation != null)
            {
                PrimaryPrompt = "Esc: step away";
                SecondaryPrompt = CarryPrompt = "";
                if (GameInput.PauseDown) LockedStation.CancelMinigame();
                return;
            }
            if (Controller.CursorFree) return;

            Scan();
            UpdateHeld();
            BuildPrompts();

            if (GameInput.GrabDown)
            {
                if (Held != null) Release();
                else if (FocusProduct != null) Grab(FocusProduct);
            }
            if (GameInput.InteractDown && Focus != null) Focus.Interact(this);
            if (GameInput.SecondaryDown && SecondaryFocus != null) SecondaryFocus.SecondaryInteract(this);
            if (GameInput.BiteDown && Held != null && ProductionService.CanBite(Held.P))
            {
                root.BiteHead(Held);
                return;
            }
            if (GameInput.ShakeDown)
            {
                var target = Held != null ? Held : FocusProduct;
                if (target != null && Showcase.CanShake(target.P)) root.ShakeGlobe(target);
            }
            if (GameInput.RedoseDown)
            {
                var target = Held != null ? Held : FocusProduct;
                if (target != null && target.P.IsSerumActive) root.Toast(root.Session.Production.Redose(target.P).Message);
            }
        }

        void Scan()
        {
            Focus = null;
            SecondaryFocus = null;
            FocusProduct = null;
            var cam = Controller.Camera.transform;
            var ray = new Ray(cam.position, cam.forward);
            int n = Physics.RaycastNonAlloc(ray, _hits, Reach, ~0, QueryTriggerInteraction.Ignore);
            float best = float.MaxValue;
            RaycastHit? nearest = null;
            for (int i = 0; i < n; i++)
            {
                var h = _hits[i];
                if (Held != null && h.collider.attachedRigidbody == Held.Body) continue;
                if (h.collider.GetComponentInParent<PlayerController>() != null) continue;
                if (h.distance < best)
                {
                    best = h.distance;
                    nearest = h;
                }
            }
            _aimPoint = nearest.HasValue ? nearest.Value.point : cam.position + cam.forward * Reach;
            if (!nearest.HasValue) return;
            var col = nearest.Value.collider;
            var view = col.GetComponentInParent<ProductView>();
            if (view != null && view != Held) FocusProduct = view;
            Focus = col.GetComponentInParent<IInteractable>();
            SecondaryFocus = col.GetComponentInParent<ISecondaryInteractable>();
        }

        void UpdateHeld()
        {
            PlacementTarget = null;
            Controller.LookBlocked = false;
            if (Held == null) return;
            if (Held.P == null || Held.P.Stage == ProductStage.Sold) { Held = null; return; }
            var cam = Controller.Camera.transform;

            if (GameInput.RotateHeld)
            {
                Controller.LookBlocked = true;
                var look = GameInput.Look * Settings.MouseSensitivity;
                _holdYaw += look.x * 3f;
                _holdPitch = Mathf.Clamp(_holdPitch - look.y * 3f, -80f, 80f);
            }
            _holdYaw += GameInput.Scroll * 20f;
            float dist = GameInput.InspectHeld ? 0.38f : _holdDistance;
            Held.HoldTarget = cam.position + cam.forward * dist - Vector3.up * (GameInput.InspectHeld ? 0.08f : 0.15f);
            Held.HoldRotation = Quaternion.Euler(0f, cam.eulerAngles.y + 180f + _holdYaw, 0f) * Quaternion.Euler(_holdPitch, 0f, 0f);

            SnapSocket aimed = null;
            var cols = Physics.OverlapSphere(_aimPoint, 0.05f, ~0, QueryTriggerInteraction.Ignore);
            foreach (var c in cols)
            {
                aimed = c.GetComponentInParent<SnapSocket>();
                if (aimed == null)
                {
                    var st = c.GetComponentInParent<StationBase>();
                    if (st != null) aimed = st.Socket;
                    var slot = c.GetComponentInParent<ShelfSlot>();
                    if (slot != null) aimed = slot.Socket;
                }
                if (aimed != null) break;
            }
            PlacementTarget = SnapSocket.FindFor(Held, _aimPoint, aimed);
        }

        void BuildPrompts()
        {
            PrimaryPrompt = Focus != null ? Focus.Prompt(this) ?? "" : "";
            SecondaryPrompt = SecondaryFocus != null ? SecondaryFocus.SecondaryPrompt(this) ?? "" : "";
            if (Held != null)
            {
                CarryPrompt = PlacementTarget != null
                    ? "LMB: Place on " + PlacementTarget.Label
                    : "LMB: Drop" + (Held.P.Stage == ProductStage.Unprepared ? " (they WILL run)" : "");
                CarryPrompt += "   ·   RMB+mouse: rotate   ·   F: look closely";
                if (Showcase.CanShake(Held.P)) CarryPrompt += "   ·   G: shake";
                if (ProductionService.CanBite(Held.P)) CarryPrompt += "   ·   B: bite its head off";
                if (Held.P.IsSerumActive) CarryPrompt += "   ·   Q: re-dose serum";
            }
            else if (FocusProduct != null && FocusProduct.P != null)
            {
                CarryPrompt = "LMB: Pick up " + FocusProduct.P.CharacterName + " (" + StationBase.StageName(FocusProduct.P.Stage) + ")";
                if (Showcase.CanShake(FocusProduct.P)) CarryPrompt += "   ·   G: shake the snow";
                if (FocusProduct.P.IsSerumActive) CarryPrompt += "   ·   Q: re-dose serum";
            }
            else CarryPrompt = "";
        }

        public void Grab(ProductView v)
        {
            if (Held != null || v == null || v.P == null || v.P.Stage == ProductStage.Sold) return;
            var root = GameRoot.I;
            if (root.Customers.IsReservedByWaitingCustomer(v.P.Id))
            {
                root.Toast("A customer is buying that one.", true);
                return;
            }
            v.BeginCarry();
            v.SetIgnoreCollision(PlayerCollider, true);
            Held = v;
            _holdYaw = 0f;
            _holdPitch = 0f;
            Controller.SpeedMultiplier = v.P.Definition.Special == SpecialBehavior.HeavyLoad ? 0.7f : 1f;
            if (v.P.Stage == ProductStage.Unprepared)
            {
                root.Audio.Play(Sfx.Squeak, v.transform.position, 0.6f);
                root.Audio.Play(Sfx.Cloth, v.transform.position, 0.5f);
            }
            else root.Audio.Play(v.P.Stage == ProductStage.Packaged ? Sfx.BoxBump : Sfx.GlassClink, v.transform.position, 0.3f);
        }

        public void Release()
        {
            if (Held == null) return;
            var v = Held;
            Held = null;
            Controller.SpeedMultiplier = 1f;
            v.SetIgnoreCollision(PlayerCollider, false);
            var socket = PlacementTarget;
            PlacementTarget = null;
            if (socket != null && socket.CanAccept(v))
            {
                socket.Place(v);
                return;
            }
            v.DropFree(Controller.Velocity * 0.5f + Controller.Camera.transform.forward * 0.5f);
            if (v.P.Stage == ProductStage.Unprepared) GameRoot.I.Toast(v.P.CharacterName + " is loose!", true);
        }

        /// <summary>Something forced the item out of the player's hands (a Wiggler, a jump scare...).</summary>
        public void ForceRelease(string message)
        {
            if (Held == null) return;
            var v = Held;
            Held = null;
            Controller.SpeedMultiplier = 1f;
            v.SetIgnoreCollision(PlayerCollider, false);
            v.DropFree(new Vector3(Random.Range(-1.5f, 1.5f), 1.5f, Random.Range(-1.5f, 1.5f)));
            GameRoot.I.Toast(message, true);
            GameRoot.I.Audio.Play(Sfx.Squeak, v.transform.position);
            Controller.AddShake(0.5f);
        }

        /// <summary>Called before loading or rebuilding views.</summary>
        public void ClearHeld()
        {
            if (Held != null && Held.Body != null) Held.SetIgnoreCollision(PlayerCollider, false);
            Held = null;
            Controller.SpeedMultiplier = 1f;
            if (LockedStation != null) LockedStation.CancelMinigame();
        }
    }
}
