using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// The basement security desk (Security Cameras upgrade, day 6+). Its monitor shows a live feed
    /// when you're nearby; E sits you down to watch full-screen and flick between the storefront,
    /// backroom and basement cameras. Only the feed being shown renders, so idle cameras cost nothing.
    /// </summary>
    public sealed class SecurityDesk : MonoBehaviour, IInteractable, IFocusMode
    {
        public Renderer Screen;
        public GameObject CameraProps;

        Camera[] _feeds;
        string[] _names;
        RenderTexture _rt;
        Material _live, _off;
        int _feed;
        bool _viewing;
        PlayerInteractor _viewer;
        float _creepTimer = 6f;

        static GameRoot Root { get { return GameRoot.I; } }
        bool Owned { get { return Root.Session.State.Modifiers.HasCameras; } }

        public void Setup(Renderer screen, GameObject props, Camera[] feeds, string[] names)
        {
            Screen = screen;
            CameraProps = props;
            _feeds = feeds;
            _names = names;
            _rt = new RenderTexture(640, 360, 16) { name = "SecurityFeed" };
            foreach (var c in _feeds)
            {
                c.targetTexture = _rt;
                c.enabled = false;
            }
            _live = Shapes.NewTexMat(null, true);
            _live.mainTexture = _rt;
            if (_live.HasProperty("_BaseMap")) _live.SetTexture("_BaseMap", _rt);
            _off = Shapes.NewMat(Color.black);
            Screen.sharedMaterial = _off;
        }

        public string Prompt(PlayerInteractor player)
        {
            if (!Owned) return "Security desk — install Security Cameras (Tab → Upgrades, day 6+)";
            return "E: Watch the cameras";
        }

        public void Interact(PlayerInteractor player)
        {
            if (!Owned || _viewing) return;
            _viewing = true;
            _viewer = player;
            player.LockTo(this);
            Root.Audio.Play(Sfx.Tick, transform.position);
        }

        public void CancelMinigame()
        {
            _viewing = false;
            if (_viewer != null) _viewer.Unlock();
            _viewer = null;
        }

        void Update()
        {
            if (Root == null || Root.Session == null || _feeds == null) return;
            bool owned = Owned;
            if (CameraProps != null && CameraProps.activeSelf != owned) CameraProps.SetActive(owned);
            bool powered = Root.Session.PowerAvailable;
            bool near = Vector3.Distance(Root.Player.transform.position, transform.position) < 6f;
            bool live = owned && powered && (_viewing || near);
            for (int i = 0; i < _feeds.Length; i++) _feeds[i].enabled = live && i == _feed;
            var mat = live ? _live : _off;
            if (Screen.sharedMaterial != mat) Screen.sharedMaterial = mat;

            if (!_viewing) return;
            int dir = GameInput.DirectionDown;
            if (GameInput.InteractDown || dir == 2) _feed = (_feed + 1) % _feeds.Length;
            else if (dir == 0) _feed = (_feed + _feeds.Length - 1) % _feeds.Length;

            // The basement feed: every so often, every figure in the cabinets turns to look into the lens.
            if (_feed == _feeds.Length - 1)
            {
                _creepTimer -= Time.deltaTime;
                if (_creepTimer <= 0f)
                {
                    _creepTimer = Random.Range(6f, 11f);
                    foreach (var cell in Root.Level.Cells) if (cell.Occupant != null) cell.Occupant.LookAt(_feeds[_feed].transform.position, 3f);
                }
            }
        }

        public void DrawGUI()
        {
            var full = new Rect(0f, 0f, UnityEngine.Screen.width, UnityEngine.Screen.height);
            GUI.color = Color.black;
            GUI.DrawTexture(full, Texture2D.whiteTexture);
            GUI.color = Color.white;
            if (Root.Session.PowerAvailable) GUI.DrawTexture(full, _rt, ScaleMode.ScaleToFit);
            else GUI.Label(new Rect(full.width * 0.5f - 80f, full.height * 0.5f - 12f, 160f, 24f), "NO SIGNAL");
            bool blink = Mathf.Repeat(Time.time, 1f) > 0.5f;
            GUI.Label(new Rect(20f, 16f, 600f, 24f), "CAM " + (_feed + 1) + " — " + _names[_feed].ToUpperInvariant() + (blink ? "   ● REC" : "") + "   " + Root.Session.Days.ClockText);
            GUI.Label(new Rect(20f, UnityEngine.Screen.height - 36f, 600f, 24f), "E / D: next camera   ·   A: previous   ·   Esc: stand up");
        }
    }

    /// <summary>With cameras installed, loose characters are reported with their location.</summary>
    public sealed class CameraWatch
    {
        readonly HashSet<int> _reported = new HashSet<int>();
        float _timer;

        public void Tick(float dt)
        {
            var root = GameRoot.I;
            _timer -= dt;
            if (_timer > 0f) return;
            _timer = 1f;
            if (!root.Session.State.Modifiers.HasCameras) return;
            foreach (var v in root.Views.Values)
            {
                if (v == null || v.P == null) continue;
                if (!v.IsEscaped) { _reported.Remove(v.P.Id); continue; }
                if (!_reported.Add(v.P.Id)) continue;
                string area = root.Level.AreaOf(v.transform.position) == PlayerArea.Storefront ? "STOREFRONT" : root.Level.AreaOf(v.transform.position) == PlayerArea.Backroom ? "BACKROOM" : "BASEMENT";
                root.Hud.Alert("CAMERA: something small is loose in the " + area + ".");
            }
        }
    }
}
