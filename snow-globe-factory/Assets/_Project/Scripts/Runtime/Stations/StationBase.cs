using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// A production station: one snap socket for the product, a status light, and a short
    /// interaction ("minigame") that produces a 0..1 score for the core ProductionService.
    /// While a minigame runs the player is locked to the station; Esc cancels safely.
    /// </summary>
    public abstract class StationBase : MonoBehaviour, IInteractable, ISecondaryInteractable
    {
        public StationId Id;
        public string Title;
        public SnapSocket Socket;
        public Renderer StatusLight;

        protected PlayerInteractor User;
        Material _statusMat;

        public bool Busy { get; private set; }
        public ProductView Occupant { get { return Socket != null ? Socket.Occupant : null; } }
        protected static GameRoot Root { get { return GameRoot.I; } }
        protected static GameSession S { get { return GameRoot.I.Session; } }

        public virtual void Setup(StationId id, string title, SnapSocket socket, Renderer statusLight)
        {
            Id = id;
            Title = title;
            Socket = socket;
            Socket.Label = title;
            Socket.Accepts = v => v.P != null && Accepts(v.P);
            Socket.RejectReason = v => v.P == null ? "?" : RejectReason(v.P);
            Socket.Placed = OnPlaced;
            Socket.Removed = OnRemoved;
            StatusLight = statusLight;
            if (StatusLight != null)
            {
                _statusMat = Shapes.NewMat(Palette.Idle, 1.5f);
                StatusLight.sharedMaterial = _statusMat;
            }
        }

        protected abstract bool Accepts(Product p);

        protected virtual string RejectReason(Product p)
        {
            return "The " + Title + " can't take a " + StageName(p.Stage) + ".";
        }

        protected virtual void OnPlaced(ProductView v)
        {
            v.P.Location = ProductLocation.At(Id);
            Root.Audio.Play(Sfx.Tap, transform.position, 0.6f);
        }

        protected virtual void OnRemoved(ProductView v)
        {
            if (Busy) CancelMinigame();
        }

        public abstract string Prompt(PlayerInteractor player);
        public abstract void Interact(PlayerInteractor player);
        public virtual string SecondaryPrompt(PlayerInteractor player) { return null; }
        public virtual void SecondaryInteract(PlayerInteractor player) { }

        /// <summary>Short world-space status shown above the station.</summary>
        public virtual string Status()
        {
            var o = Occupant;
            if (o == null) return Title + "\n<empty>";
            return Title + "\n" + o.P.CharacterName + " · " + StageName(o.P.Stage);
        }

        /// <summary>Minigame overlay, drawn by the HUD while Busy.</summary>
        public virtual void DrawGUI() { }

        protected void BeginMinigame(PlayerInteractor player)
        {
            Busy = true;
            User = player;
            player.LockTo(this);
        }

        protected void EndMinigame()
        {
            if (Occupant != null) Occupant.ClearFigureOverride();
            Busy = false;
            if (User != null) User.Unlock();
            User = null;
        }

        public virtual void CancelMinigame()
        {
            EndMinigame();
        }

        protected virtual void Update()
        {
            if (_statusMat == null) return;
            Color c = Busy ? Palette.Busy : Occupant != null ? Palette.Ok : Palette.Idle;
            if (Occupant != null && Occupant.P.IsSerumActive && Occupant.P.SerumRemaining < GameBalance.SerumWarningSeconds)
            {
                c = Mathf.Repeat(Time.time * 3f, 1f) > 0.5f ? Palette.Bad : Palette.Busy;
            }
            Shapes.SetColor(_statusMat, c);
            Shapes.SetEmission(_statusMat, c * 1.5f);
        }

        protected void Report(ActionResult r)
        {
            Root.Toast(r.Message, !r.Success);
        }

        public static string StageName(ProductStage s)
        {
            switch (s)
            {
                case ProductStage.Unprepared: return "awake character";
                case ProductStage.Prepared: return "prepared character";
                case ProductStage.Mounted: return "mounted figure";
                case ProductStage.Decorated: return "decorated base";
                case ProductStage.Domed: return "domed globe";
                case ProductStage.Sealed: return "sealed globe";
                case ProductStage.Inspected: return "inspected globe";
                case ProductStage.Packaged: return "packaged globe";
                case ProductStage.Displayed: return "displayed globe";
                default: return "sold globe";
            }
        }

        // --------- shared IMGUI helpers for minigames ---------

        protected static Rect PanelRect(float w, float h)
        {
            return new Rect((Screen.width - w) * 0.5f, Screen.height * 0.62f, w, h);
        }

        protected static void Bar(Rect r, float fill, Color color, float bandMin = -1f, float bandMax = -1f)
        {
            GUI.color = new Color(0f, 0f, 0f, 0.6f);
            GUI.DrawTexture(r, Texture2D.whiteTexture);
            if (bandMin >= 0f)
            {
                GUI.color = new Color(0.3f, 0.9f, 0.4f, 0.45f);
                GUI.DrawTexture(new Rect(r.x + r.width * bandMin, r.y, r.width * (bandMax - bandMin), r.height), Texture2D.whiteTexture);
            }
            GUI.color = color;
            GUI.DrawTexture(new Rect(r.x + 2f, r.y + 2f, (r.width - 4f) * Mathf.Clamp01(fill), r.height - 4f), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        protected static void Needle(Rect r, float pos, float zoneCenter, float zoneWidth)
        {
            GUI.color = new Color(0f, 0f, 0f, 0.6f);
            GUI.DrawTexture(r, Texture2D.whiteTexture);
            GUI.color = new Color(0.3f, 0.9f, 0.4f, 0.8f);
            GUI.DrawTexture(new Rect(r.x + r.width * (zoneCenter - zoneWidth * 0.5f), r.y, r.width * zoneWidth, r.height), Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.DrawTexture(new Rect(r.x + r.width * pos - 2f, r.y - 4f, 4f, r.height + 8f), Texture2D.whiteTexture);
        }
    }
}
