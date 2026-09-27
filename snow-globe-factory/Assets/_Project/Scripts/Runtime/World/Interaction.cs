using System;
using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Anything that reacts to E. Return null from Prompt when there is nothing to do right now.</summary>
    public interface IInteractable
    {
        string Prompt(PlayerInteractor player);
        void Interact(PlayerInteractor player);
    }

    /// <summary>
    /// Something that takes over the player's controls for a while (a station minigame, the camera
    /// monitor). Esc calls CancelMinigame; the HUD calls DrawGUI every frame while it's active.
    /// </summary>
    public interface IFocusMode
    {
        void CancelMinigame();
        void DrawGUI();
    }

    /// <summary>Optional X action (reject, offer exchange, ...).</summary>
    public interface ISecondaryInteractable
    {
        string SecondaryPrompt(PlayerInteractor player);
        void SecondaryInteract(PlayerInteractor player);
    }

    /// <summary>
    /// Placement assistance: a held product released near a socket that accepts it snaps
    /// into place instead of relying on precise physics.
    /// </summary>
    public sealed class SnapSocket : MonoBehaviour
    {
        public static readonly List<SnapSocket> All = new List<SnapSocket>();

        public string Label = "Socket";
        public float Radius = 0.45f;
        /// <summary>Holding pens take many characters; stations and shelf slots take one.</summary>
        public bool AllowMultiple;
        /// <summary>Single-occupant socket whose occupant wanders inside it (holding cabinets).</summary>
        public bool RoamInside;
        /// <summary>For multi sockets: the area occupants roam in (local XZ half-extents).</summary>
        public Vector2 RoamHalfExtents = new Vector2(0.5f, 0.5f);
        public Func<ProductView, bool> Accepts;
        public Func<ProductView, string> RejectReason;
        public Action<ProductView> Placed;
        public Action<ProductView> Removed;

        public ProductView Occupant { get; private set; }
        public readonly List<ProductView> Occupants = new List<ProductView>();

        void OnEnable() { All.Add(this); }
        void OnDisable() { All.Remove(this); }

        public bool CanAccept(ProductView v)
        {
            if (!isActiveAndEnabled || v == null) return false;
            if (!AllowMultiple && Occupant != null && Occupant != v) return false;
            return Accepts == null || Accepts(v);
        }

        public string WhyNot(ProductView v)
        {
            if (!AllowMultiple && Occupant != null && Occupant != v) return Label + " is occupied.";
            return RejectReason != null ? RejectReason(v) : "That doesn't go here.";
        }

        public void Place(ProductView v)
        {
            if (AllowMultiple) { if (!Occupants.Contains(v)) Occupants.Add(v); }
            else Occupant = v;
            v.AttachTo(this);
            if (GameRoot.I != null && v.P != null)
            {
                var st = v.P.Stage;
                var sfx = st == ProductStage.Packaged ? Sfx.BoxBump : st >= ProductStage.Domed ? Sfx.GlassClink : Sfx.SoftThud;
                GameRoot.I.Audio.Play(sfx, v.transform.position, sfx == Sfx.GlassClink ? 0.35f : 0.45f);
            }
            if (Placed != null) Placed(v);
        }

        public void Release(ProductView v)
        {
            bool had = AllowMultiple ? Occupants.Remove(v) : Occupant == v;
            if (!AllowMultiple && Occupant == v) Occupant = null;
            if (had && Removed != null) Removed(v);
        }

        public Vector3 RandomRoamPoint()
        {
            var local = new Vector3(UnityEngine.Random.Range(-RoamHalfExtents.x, RoamHalfExtents.x), 0f, UnityEngine.Random.Range(-RoamHalfExtents.y, RoamHalfExtents.y));
            return transform.TransformPoint(local);
        }

        public bool ContainsXZ(Vector3 worldPos)
        {
            var local = transform.InverseTransformPoint(worldPos);
            return Mathf.Abs(local.x) <= RoamHalfExtents.x + 0.05f && Mathf.Abs(local.z) <= RoamHalfExtents.y + 0.05f;
        }

        /// <summary>Best socket for a release at worldPoint, preferring the one directly aimed at.</summary>
        public static SnapSocket FindFor(ProductView v, Vector3 worldPoint, SnapSocket aimed)
        {
            if (aimed != null && aimed.CanAccept(v)) return aimed;
            SnapSocket best = null;
            float bestD = float.MaxValue;
            foreach (var s in All)
            {
                if (!s.CanAccept(v)) continue;
                float d = s.AllowMultiple && s.ContainsXZ(worldPoint) ? 0f : Vector3.Distance(s.transform.position, worldPoint);
                if (d > s.Radius || d >= bestD) continue;
                best = s;
                bestD = d;
            }
            return best;
        }
    }
}
