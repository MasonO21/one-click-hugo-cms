using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Control box on each machine: E switches automatic/manual (the manual override),
    /// X repairs a breakdown or services a worn machine. Status is drawn above it by the HUD.
    /// </summary>
    public sealed class MachinePanel : MonoBehaviour, IInteractable, ISecondaryInteractable
    {
        public MachineId Machine;
        public Renderer Lamp;
        Material _mat;

        static GameSession S { get { return GameRoot.I.Session; } }

        void Start()
        {
            _mat = Shapes.NewMat(Palette.Idle, 1.5f);
            if (Lamp != null) Lamp.sharedMaterial = _mat;
        }

        public string Status()
        {
            var a = S.Automation;
            var m = a.Get(Machine);
            string name = AutomationService.NameOf(Machine);
            string state;
            if (m.Jammed) state = "JAMMED";
            else if (m.Broken) state = "BROKEN";
            else if (!m.Enabled) state = "manual";
            else if (!S.PowerAvailable) state = "no power";
            else if (m.BlockedReason.Length > 0) state = "waiting: " + m.BlockedReason;
            else state = "running";
            return name + " · " + state + "\ncondition " + Mathf.RoundToInt(m.Condition * 100f) + "% · " + m.ItemsProcessed + " done";
        }

        public string Prompt(PlayerInteractor player)
        {
            var m = S.Automation.Get(Machine);
            return "E: Switch " + AutomationService.NameOf(Machine) + " to " + (m.Enabled ? "MANUAL" : "AUTOMATIC");
        }

        public void Interact(PlayerInteractor player)
        {
            var m = S.Automation.Get(Machine);
            GameRoot.I.Toast(S.Automation.SetEnabled(Machine, !m.Enabled).Message);
            GameRoot.I.Audio.Play(Sfx.Tap, transform.position);
        }

        public string SecondaryPrompt(PlayerInteractor player)
        {
            var m = S.Automation.Get(Machine);
            if (m.Broken || m.Jammed) return "X: Repair ($" + AutomationService.RepairCost + ")";
            if (m.Condition <= 0.9f) return "X: Service ($" + AutomationService.ServiceCost + ", restores condition)";
            return null;
        }

        public void SecondaryInteract(PlayerInteractor player)
        {
            var r = S.Automation.Repair(Machine);
            GameRoot.I.Toast(r.Message, !r.Success);
            if (r.Success) GameRoot.I.Audio.Play(Sfx.Chime, transform.position);
        }

        void Update()
        {
            if (_mat == null || GameRoot.I == null || GameRoot.I.Session == null) return;
            var m = S.Automation.Get(Machine);
            Color c;
            if (m.Broken || m.Jammed) c = Mathf.Repeat(Time.time * 2f, 1f) > 0.5f ? Palette.Bad : Color.black;
            else if (!m.Enabled || !S.PowerAvailable) c = Palette.Idle;
            else if (m.BlockedReason.Length > 0) c = Palette.Busy;
            else c = Palette.Ok;
            Shapes.SetColor(_mat, c);
            Shapes.SetEmission(_mat, c * 1.5f);
        }
    }

    /// <summary>
    /// The short conveyor between the sealer and the packaging table. Products whose location is
    /// "on the conveyor" are drawn along the belt at their core-side progress; rollers turn while it runs.
    /// </summary>
    public sealed class ConveyorView : MonoBehaviour
    {
        public Vector3 StartLocal;
        public Vector3 EndLocal;
        public readonly List<Transform> Rollers = new List<Transform>();

        public Vector3 PointAt(float progress) { return transform.TransformPoint(Vector3.Lerp(StartLocal, EndLocal, progress)); }

        public void Attach(ProductView v)
        {
            v.AttachToBelt(transform);
            Follow(v);
        }

        void Follow(ProductView v)
        {
            v.transform.localPosition = Vector3.Lerp(StartLocal, EndLocal, Mathf.Clamp01(v.P.Location.X));
            v.transform.localRotation = Quaternion.identity;
        }

        void Update()
        {
            var root = GameRoot.I;
            if (root == null || root.Session == null) return;
            bool running = root.Session.Automation.IsRunning(MachineId.Conveyor, root.Session.PowerAvailable)
                           && root.Session.Automation.Get(MachineId.Conveyor).BlockedReason.Length == 0
                           && root.Session.Automation.OnConveyor().Count > 0;
            if (running) foreach (var r in Rollers) r.Rotate(0f, 360f * Time.deltaTime, 0f, Space.Self);
            foreach (var v in root.Views.Values)
            {
                if (v == null || v.P == null || v.P.Location.Kind != LocationKind.Conveyor) continue;
                if (v.transform.parent != transform) Attach(v);
                else Follow(v);
            }
        }
    }
}
