using System.Collections;
using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Stages what the core EventDirector decides. Atmospherics are harmless and never feed
    /// customer suspicion; threats always get a warning window the player can act on.
    /// </summary>
    public sealed class HorrorDirectorRunner : MonoBehaviour
    {
        const float TickInterval = 0.5f;

        float _tick;
        DirectorEventId _pending = DirectorEventId.None;
        float _warning;
        HoldingPen _scratchPen;
        ProductView _escapee;
        float _nextScratch;

        public bool PowerOut { get; private set; }
        public DirectorEventId Pending { get { return _pending; } }

        static GameRoot Root { get { return GameRoot.I; } }

        public int LooseCount()
        {
            int n = 0;
            foreach (var v in Root.Views.Values) if (v != null && v.IsEscaped) n++;
            return n;
        }

        void Update()
        {
            if (Root == null || Root.Session == null || Time.deltaTime <= 0f) return;
            UpdatePending(Time.deltaTime);
            UpdateActiveThreat();

            _tick -= Time.deltaTime;
            if (_tick > 0f) return;
            _tick = TickInterval;

            var ctx = new DirectorContext
            {
                DisplayedGlobes = Root.Session.Store.DisplayedCount(),
                HoldingCharacters = Root.Session.HoldingCount(),
                CustomersInStore = Root.Customers.Count,
                CustomerWatchingShelves = Root.Customers.AnyoneWatchingShelves,
                ActiveCrises = LooseCount(),
                PlayerArea = Root.Level.AreaOf(Root.Player.transform.position),
            };
            var ev = Root.Session.TickDirector(TickInterval, ctx);
            if (ev != DirectorEventId.None) Begin(ev);
        }

        void Begin(DirectorEventId ev)
        {
            var def = DirectorEventCatalog.Get(ev);
            if (def.Kind == DirectorEventKind.Threat)
            {
                _pending = ev;
                _warning = def.WarningSeconds;
                BeginWarning(ev, def);
                return;
            }
            switch (ev)
            {
                case DirectorEventId.GlobeTurnsToPlayer: GlobeTurns(); break;
                case DirectorEventId.BasementLookToCorner: LookToCorner(); break;
                case DirectorEventId.ShelfTapping: StartCoroutine(Tapping()); break;
                case DirectorEventId.MusicDropout: StartCoroutine(MusicDropout()); break;
                case DirectorEventId.WatcherRelocates: Relocate(); break;
            }
        }

        // ---------------- atmospherics (harmless) ----------------

        void GlobeTurns()
        {
            var cam = Root.Player.Camera.transform;
            foreach (var v in Root.Views.Values)
            {
                if (v == null || v.P.Stage != ProductStage.Displayed) continue;
                var to = v.transform.position - cam.position;
                if (Vector3.Dot(cam.forward, to.normalized) > 0.5f) continue; // only while you're not looking
                var flat = cam.position - v.transform.position;
                flat.y = 0f;
                v.transform.rotation = Quaternion.LookRotation(flat);
                v.LookAt(cam.position, 12f);
                return;
            }
        }

        void LookToCorner()
        {
            Root.SilentUntil = Time.time + 8f;
            foreach (var pen in Root.Level.Pens)
            {
                foreach (var v in pen.Socket.Occupants) if (v != null) v.LookAt(Root.Level.DarkCorner.position, 8f);
            }
            Root.Audio.Play(Sfx.Scratch, Root.Level.DarkCorner.position, 0.25f, 0.7f);
        }

        IEnumerator Tapping()
        {
            ProductView target = null;
            foreach (var v in Root.Views.Values) if (v != null && v.P.Stage == ProductStage.Displayed) { target = v; break; }
            if (target == null) yield break;
            for (int i = 0; i < 4; i++)
            {
                if (target == null) yield break;
                Root.Audio.Play(Sfx.Tap, target.transform.position, 0.5f);
                yield return new WaitForSeconds(0.45f);
            }
        }

        IEnumerator MusicDropout()
        {
            Root.Audio.SetMusicDucked(true);
            yield return new WaitForSeconds(3f);
            Root.Audio.Play(Sfx.Mumble, Root.Level.StaffDoor.transform.position, 0.35f, 0.8f);
            yield return new WaitForSeconds(14f);
            if (!PowerOut) Root.Audio.SetMusicDucked(false);
        }

        void Relocate()
        {
            var from = Root.Level.Pens[0].Socket.Occupants.Count >= Root.Level.Pens[1].Socket.Occupants.Count ? Root.Level.Pens[0] : Root.Level.Pens[1];
            var to = from == Root.Level.Pens[0] ? Root.Level.Pens[1] : Root.Level.Pens[0];
            if (from.Socket.Occupants.Count == 0) return;
            var v = from.Socket.Occupants[0];
            v.Detach();
            to.Socket.Place(v);
        }

        // ---------------- threats (telegraphed) ----------------

        void BeginWarning(DirectorEventId ev, DirectorEventDefinition def)
        {
            Root.Hud.Subtitle("", def.WarningCue);
            if (ev == DirectorEventId.PowerFailure)
            {
                foreach (var l in Root.Level.Lights) l.Warning = true;
                Root.Audio.Play(Sfx.Hum, Root.Level.Sealer.transform.position, 0.8f, 0.6f);
            }
            else if (ev == DirectorEventId.EscapeAttempt)
            {
                _scratchPen = Root.Level.Pens[0].Socket.Occupants.Count > 0 ? Root.Level.Pens[0] : Root.Level.Pens[1];
                if (_scratchPen.Socket.Occupants.Count == 0) { Cancel(); return; }
                Root.Hud.Alert("Scratching in " + _scratchPen.Socket.Label + "...");
                _nextScratch = 0f;
            }
        }

        void UpdatePending(float dt)
        {
            if (_pending == DirectorEventId.None) return;
            _warning -= dt;
            if (_pending == DirectorEventId.EscapeAttempt && _scratchPen != null)
            {
                _nextScratch -= dt;
                if (_nextScratch <= 0f)
                {
                    _nextScratch = 1.4f;
                    Root.Audio.Play(Sfx.Scratch, _scratchPen.ScratchPoint.position, 0.9f);
                }
                // Getting there in time and checking the latch prevents the escape.
                if (Vector3.Distance(Root.Player.transform.position, _scratchPen.ScratchPoint.position) < 2.2f)
                {
                    Root.Toast("You jiggle the latch. It holds. Something inside goes very quiet.");
                    Cancel();
                    return;
                }
            }
            if (_warning > 0f) return;
            var ev = _pending;
            _pending = DirectorEventId.None;
            if (ev == DirectorEventId.PowerFailure) CutPower();
            else if (ev == DirectorEventId.EscapeAttempt) Escape();
        }

        void Cancel()
        {
            _pending = DirectorEventId.None;
            _scratchPen = null;
            foreach (var l in Root.Level.Lights) l.Warning = false;
            Root.Session.Director.ResolveThreat();
        }

        void CutPower()
        {
            PowerOut = true;
            Root.Session.PowerFactor = 0.2f;
            foreach (var l in Root.Level.Lights)
            {
                l.Warning = false;
                l.PowerOut = true;
            }
            Root.Audio.SetMusicDucked(true);
            Root.Audio.Play2D(Sfx.PowerDown, 0.8f);
            Root.Player.AddShake(0.6f);
            Root.Hud.Alert("POWER FAILURE — stasis seals are weakening. Reset the breaker in the basement.");
            Root.Hud.Subtitle("", "The music box winds down. In the quiet, you can hear tapping. Lots of tapping.");
        }

        public void RestorePower()
        {
            PowerOut = false;
            Root.Session.PowerFactor = 1f;
            foreach (var l in Root.Level.Lights)
            {
                l.PowerOut = false;
                l.Warning = false;
            }
            Root.Audio.SetMusicDucked(false);
            Root.Audio.Play2D(Sfx.Chime, 0.6f);
            Root.Toast("Power restored.");
            if (Root.Session.Director.ActiveThreat == DirectorEventId.PowerFailure) Root.Session.Director.ResolveThreat();
        }

        void Escape()
        {
            var pen = _scratchPen;
            _scratchPen = null;
            if (pen == null || pen.Socket.Occupants.Count == 0) { Root.Session.Director.ResolveThreat(); return; }
            pen.Gate.SetOpen(true);
            var v = pen.Socket.Occupants[Random.Range(0, pen.Socket.Occupants.Count)];
            var outside = pen.Gate.transform.position + new Vector3(0.4f, 0.1f, -0.4f);
            v.PlaceFree(outside);
            var pos = v.transform.position;
            v.P.Location = ProductLocation.Loose(pos.x, pos.y, pos.z);
            _escapee = v;
            Root.Audio.Play(Sfx.Squeak, outside);
            Root.Hud.Alert(v.P.CharacterName + " got out of " + pen.Socket.Label + "! Catch them before a customer sees.");
        }

        void UpdateActiveThreat()
        {
            if (Root.Session.Director.ActiveThreat != DirectorEventId.EscapeAttempt || _pending != DirectorEventId.None) return;
            if (_escapee == null || !_escapee.IsEscaped)
            {
                _escapee = null;
                Root.Session.Director.ResolveThreat();
                Root.Toast("Contained.");
            }
        }

        /// <summary>Clears staged effects (used when loading).</summary>
        public void ResetState()
        {
            StopAllCoroutines();
            _pending = DirectorEventId.None;
            _scratchPen = null;
            _escapee = null;
            PowerOut = false;
            if (Root.Session != null) Root.Session.PowerFactor = 1f;
            foreach (var l in Root.Level.Lights)
            {
                l.PowerOut = false;
                l.Warning = false;
            }
            Root.Audio.SetMusicDucked(false);
        }
    }
}
