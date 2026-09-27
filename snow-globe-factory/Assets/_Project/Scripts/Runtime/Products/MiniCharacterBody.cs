using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    public enum FigureMode
    {
        Idle,
        Walk,
        Struggle,
        Frozen,
        Posed,
        Cower,
    }

    /// <summary>
    /// Procedural placeholder humanoid (~22cm): big head, big eyes, floppy limbs.
    /// Limbs are driven by damped springs toward per-mode targets, which gives the
    /// wobbly "active ragdoll" read without joint physics.
    /// </summary>
    public sealed class MiniCharacterBody : MonoBehaviour
    {
        public const float Height = 0.3f;
        public static readonly string[] PoseNames = { "Joyful Wave", "Little Skater", "Caroler", "Snow Angel" };

        public FigureMode Mode = FigureMode.Idle;
        public int PoseIndex;
        public float Tremble;
        public float Stiffness = 1f;
        public bool HasLookTarget;
        public Vector3 LookTarget;

        FigureRig _rig;
        Transform _hips, _head, _armL, _armR, _legL, _legR;
        public Transform HeadBone { get { return _head; } }
        readonly Vector3[] _ang = new Vector3[6];
        readonly Vector3[] _vel = new Vector3[6];
        float _seed;
        float _nextGlance;
        Vector3 _glance;

        readonly Vector3[] _targets = new Vector3[6];

        // Secondary motion: floppy hat segments + scarf tail, driven by how the body moves.
        Quaternion[] _hatRest;
        Vector3[] _hatAng, _hatVel;
        Quaternion _tailRest;
        Vector3 _tailAng, _tailVel;
        Vector3 _lastPos;
        Quaternion _lastRot;

        const int Hips = 0, Head = 1, ArmL = 2, ArmR = 3, LegL = 4, LegR = 5;

        /// <summary>Builds the felt-hat / red-scarf miniature from the character reference.</summary>
        public void Build(int seed, ArchetypeId archetype)
        {
            _seed = seed * 0.37f;
            _rig = FigureBuilder.Build(transform, FigureStyle.ForSeed(seed, archetype), true);
            _hips = _rig.Hips;
            _head = _rig.Head;
            _armL = _rig.ArmL;
            _armR = _rig.ArmR;
            _legL = _rig.LegL;
            _legR = _rig.LegR;
            int n = _rig.Hat.Length;
            _hatRest = new Quaternion[n];
            _hatAng = new Vector3[n];
            _hatVel = new Vector3[n];
            for (int i = 0; i < n; i++) _hatRest[i] = _rig.Hat[i].localRotation;
            _tailRest = _rig.ScarfTail.localRotation;
            _lastPos = transform.position;
            _lastRot = transform.rotation;
        }

        /// <summary>Sudden jolt: the "did that one just move?" moment.</summary>
        public void Twitch(float intensity)
        {
            for (int i = 0; i < 6; i++) _vel[i] += Random.insideUnitSphere * 900f * intensity;
            if (_hatVel != null) for (int i = 0; i < _hatVel.Length; i++) _hatVel[i] += Random.insideUnitSphere * 600f * intensity;
        }

        int _skipPhase;
        float _skipped;

        void Update()
        {
            if (_hips == null) return;
            // Animation LOD: distant minis update their springs less often (they still move, just cheaper).
            _skipped += Time.deltaTime;
            var cam = Camera.main;
            if (cam != null)
            {
                float dist = (cam.transform.position - transform.position).sqrMagnitude;
                int interval = dist > 14f * 14f ? 6 : dist > 7f * 7f ? 2 : 1;
                if (_skipPhase == 0) _skipPhase = 1 + (int)(Mathf.Abs(_seed) * 100f) % 6;
                if (interval > 1 && (Time.frameCount + _skipPhase) % interval != 0) return;
            }
            float dt = Mathf.Min(_skipped, 0.05f);
            _skipped = 0f;
            float t = Time.time + _seed;
            var targets = _targets;
            System.Array.Clear(targets, 0, targets.Length);

            switch (Mode)
            {
                case FigureMode.Idle:
                    targets[Hips] = new Vector3(0f, 0f, Mathf.Sin(t * 1.3f) * 4f);
                    // Reference pose: mittens held together in front, a little shy sway.
                    targets[ArmL] = new Vector3(-38f + Mathf.Sin(t * 1.7f) * 5f, 0f, 18f);
                    targets[ArmR] = new Vector3(-38f + Mathf.Sin(t * 1.5f + 1f) * 5f, 0f, -18f);
                    break;
                case FigureMode.Walk:
                    float s = Mathf.Sin(t * 14f);
                    targets[Hips] = new Vector3(6f, 0f, s * 8f);
                    targets[ArmL] = new Vector3(s * 50f, 0f, -35f);
                    targets[ArmR] = new Vector3(-s * 50f, 0f, 35f);
                    targets[LegL] = new Vector3(-s * 40f, 0f, 0f);
                    targets[LegR] = new Vector3(s * 40f, 0f, 0f);
                    break;
                case FigureMode.Struggle:
                    targets[Hips] = new Vector3(Mathf.Sin(t * 9f) * 20f, Mathf.Sin(t * 7f) * 25f, Mathf.Sin(t * 11f) * 20f);
                    targets[ArmL] = new Vector3(Mathf.Sin(t * 17f) * 90f, 0f, -80f + Mathf.Sin(t * 13f) * 40f);
                    targets[ArmR] = new Vector3(Mathf.Sin(t * 15f + 2f) * 90f, 0f, 80f + Mathf.Sin(t * 12f) * 40f);
                    targets[LegL] = new Vector3(Mathf.Sin(t * 19f) * 60f, 0f, -10f);
                    targets[LegR] = new Vector3(Mathf.Sin(t * 18f + 1f) * 60f, 0f, 10f);
                    break;
                case FigureMode.Cower:
                    targets[Hips] = new Vector3(25f, 0f, 0f);
                    targets[ArmL] = new Vector3(-140f, 0f, -20f);
                    targets[ArmR] = new Vector3(-140f, 0f, 20f);
                    targets[LegL] = new Vector3(-30f, 0f, 0f);
                    targets[LegR] = new Vector3(-30f, 0f, 0f);
                    break;
                case FigureMode.Frozen:
                    break; // stiff and straight: arms at sides
                default: // Posed
                    PoseTargets(PoseIndex, targets);
                    break;
            }

            // Head: look at target, else glance around.
            if (HasLookTarget)
            {
                var local = _hips.InverseTransformPoint(LookTarget);
                float yaw = Mathf.Clamp(Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg, -80f, 80f);
                float pitch = Mathf.Clamp(-Mathf.Atan2(local.y - 0.12f, new Vector2(local.x, local.z).magnitude) * Mathf.Rad2Deg, -40f, 40f);
                targets[Head] = new Vector3(pitch, yaw, 0f);
            }
            else if (Mode != FigureMode.Frozen && Mode != FigureMode.Posed)
            {
                if (Time.time > _nextGlance)
                {
                    _nextGlance = Time.time + Random.Range(0.8f, 2.5f);
                    _glance = new Vector3(Random.Range(-20f, 20f), Random.Range(-60f, 60f), 0f);
                }
                targets[Head] = _glance;
            }

            bool stiff = Mode == FigureMode.Frozen || Mode == FigureMode.Posed;
            float k = (stiff ? 600f : 220f) * Stiffness;
            float d = stiff ? 40f : 11f;
            for (int i = 0; i < 6; i++)
            {
                Vector3 target = targets[i];
                if (Tremble > 0f) target += new Vector3(Mathf.Sin(t * 47f + i), Mathf.Sin(t * 53f + i * 2f), Mathf.Sin(t * 41f + i * 3f)) * 6f * Tremble;
                _vel[i] += ((target - _ang[i]) * k - _vel[i] * d) * dt;
                _ang[i] += _vel[i] * dt;
            }

            _hips.localRotation = Quaternion.Euler(_ang[Hips]);
            _head.localRotation = Quaternion.Euler(_ang[Head]);
            _armL.localRotation = Quaternion.Euler(_ang[ArmL]);
            _armR.localRotation = Quaternion.Euler(_ang[ArmR]);
            _legL.localRotation = Quaternion.Euler(_ang[LegL]);
            _legR.localRotation = Quaternion.Euler(_ang[LegR]);

            // Irises drift toward the look target — eyes that follow you.
            Vector3 irisOffset = Vector3.zero;
            if (HasLookTarget)
            {
                var lp = _head.InverseTransformPoint(LookTarget).normalized;
                irisOffset = new Vector3(Mathf.Clamp(lp.x, -1f, 1f) * 0.004f, Mathf.Clamp(lp.y, -1f, 1f) * 0.003f, 0f);
            }
            _rig.IrisL.localPosition = _rig.IrisLBase + irisOffset;
            _rig.IrisR.localPosition = _rig.IrisRBase + irisOffset;

            UpdateSecondaryMotion(dt, t);
        }

        void UpdateSecondaryMotion(float dt, float t)
        {
            // Body velocity and turn rate in local space; the hat and scarf lag behind them.
            var vel = transform.InverseTransformDirection((transform.position - _lastPos) / Mathf.Max(dt, 0.0001f));
            float turn = Mathf.DeltaAngle(_lastRot.eulerAngles.y, transform.rotation.eulerAngles.y) / Mathf.Max(dt, 0.0001f);
            _lastPos = transform.position;
            _lastRot = transform.rotation;
            var hipsAng = _ang[Hips];
            bool stiff = Mode == FigureMode.Frozen || Mode == FigureMode.Posed;
            var drive = new Vector3(Mathf.Clamp(vel.z * 25f, -40f, 40f) - hipsAng.x * 0.6f, 0f, Mathf.Clamp(-vel.x * 25f - turn * 0.05f, -40f, 40f) - hipsAng.z * 0.6f);
            float idle = stiff ? 0f : Mathf.Sin(t * 1.1f) * 3f;
            float k = stiff ? 300f : 90f, d = stiff ? 25f : 5f;
            for (int i = 0; i < _hatAng.Length; i++)
            {
                var target = drive * (0.5f + i * 0.25f) + new Vector3(0f, 0f, idle);
                _hatVel[i] += ((target - _hatAng[i]) * k - _hatVel[i] * d) * dt;
                _hatAng[i] += _hatVel[i] * dt;
                _rig.Hat[i].localRotation = _hatRest[i] * Quaternion.Euler(_hatAng[i]);
            }
            var tailTarget = new Vector3(drive.x * 1.2f + (Mode == FigureMode.Struggle ? Mathf.Sin(t * 13f) * 30f : 0f), 0f, drive.z);
            _tailVel += ((tailTarget - _tailAng) * k - _tailVel * d) * dt;
            _tailAng += _tailVel * dt;
            _rig.ScarfTail.localRotation = _tailRest * Quaternion.Euler(_tailAng);
            // The brass star always hangs toward the ground.
            _rig.Star.rotation = Quaternion.Slerp(_rig.Star.rotation, Quaternion.Euler(0f, transform.eulerAngles.y, 0f), dt * 8f);
        }

        static void PoseTargets(int pose, Vector3[] t)
        {
            switch (pose % PoseNames.Length)
            {
                case 0: // wave
                    t[ArmR] = new Vector3(0f, 0f, 150f);
                    t[ArmL] = new Vector3(0f, 0f, -15f);
                    break;
                case 1: // skater
                    t[Hips] = new Vector3(15f, 0f, 0f);
                    t[ArmL] = new Vector3(0f, 0f, -85f);
                    t[ArmR] = new Vector3(0f, 0f, 85f);
                    t[LegL] = new Vector3(-10f, 0f, 0f);
                    t[LegR] = new Vector3(45f, 0f, 0f);
                    break;
                case 2: // caroler
                    t[Head] = new Vector3(-20f, 0f, 0f);
                    t[ArmL] = new Vector3(-70f, 20f, -10f);
                    t[ArmR] = new Vector3(-70f, -20f, 10f);
                    break;
                default: // snow angel
                    t[ArmL] = new Vector3(0f, 0f, -120f);
                    t[ArmR] = new Vector3(0f, 0f, 120f);
                    t[LegL] = new Vector3(0f, 0f, -20f);
                    t[LegR] = new Vector3(0f, 0f, 20f);
                    break;
            }
        }
    }
}
