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
        public const float Height = 0.24f;
        public static readonly string[] PoseNames = { "Joyful Wave", "Little Skater", "Caroler", "Snow Angel" };

        public FigureMode Mode = FigureMode.Idle;
        public int PoseIndex;
        public float Tremble;
        public float Stiffness = 1f;
        public bool HasLookTarget;
        public Vector3 LookTarget;

        Transform _hips, _head, _armL, _armR, _legL, _legR, _pupilL, _pupilR;
        readonly Vector3[] _ang = new Vector3[6];
        readonly Vector3[] _vel = new Vector3[6];
        float _seed;
        float _nextGlance;
        Vector3 _glance;

        readonly Vector3[] _targets = new Vector3[6];

        const int Hips = 0, Head = 1, ArmL = 2, ArmR = 3, LegL = 4, LegR = 5;

        static readonly Color[] Skins = { new Color(0.98f, 0.83f, 0.7f), new Color(0.85f, 0.64f, 0.48f), new Color(0.6f, 0.42f, 0.3f), new Color(0.4f, 0.27f, 0.2f) };
        static readonly Color[] Shirts = { new Color(0.2f, 0.45f, 0.8f), new Color(0.85f, 0.3f, 0.3f), new Color(0.3f, 0.65f, 0.35f), new Color(0.9f, 0.7f, 0.2f), new Color(0.55f, 0.35f, 0.7f) };

        public void Build(int seed)
        {
            var rng = new System.Random(seed);
            _seed = seed * 0.37f;
            Color skin = Skins[rng.Next(Skins.Length)];
            Color shirt = Shirts[rng.Next(Shirts.Length)];
            Color pants = Color.Lerp(shirt, Color.black, 0.6f);

            _hips = Shapes.Empty("Hips", transform, new Vector3(0f, 0.085f, 0f)).transform;
            Shapes.Prim(PrimitiveType.Capsule, "Torso", _hips, new Vector3(0f, 0.045f, 0f), new Vector3(0.075f, 0.05f, 0.055f), shirt, false);
            _head = Shapes.Empty("Head", _hips, new Vector3(0f, 0.12f, 0f)).transform;
            Shapes.Prim(PrimitiveType.Sphere, "Skull", _head, new Vector3(0f, 0.03f, 0f), Vector3.one * 0.095f, skin, false);
            _pupilL = Eye(_head, -0.02f);
            _pupilR = Eye(_head, 0.02f);
            _armL = Limb("ArmL", _hips, new Vector3(-0.048f, 0.08f, 0f), 0.034f, 0.02f, shirt);
            _armR = Limb("ArmR", _hips, new Vector3(0.048f, 0.08f, 0f), 0.034f, 0.02f, shirt);
            _legL = Limb("LegL", transform, new Vector3(-0.02f, 0.085f, 0f), 0.042f, 0.024f, pants);
            _legR = Limb("LegR", transform, new Vector3(0.02f, 0.085f, 0f), 0.042f, 0.024f, pants);
        }

        Transform Eye(Transform head, float x)
        {
            var eye = Shapes.Prim(PrimitiveType.Sphere, "Eye", head, new Vector3(x, 0.04f, 0.038f), Vector3.one * 0.03f, Color.white, false).transform;
            var pupil = Shapes.Prim(PrimitiveType.Sphere, "Pupil", eye, new Vector3(0f, 0f, 0.38f), Vector3.one * 0.45f, new Color(0.05f, 0.05f, 0.08f), false).transform;
            return pupil;
        }

        static Transform Limb(string name, Transform parent, Vector3 pivot, float halfLen, float thick, Color c)
        {
            var p = Shapes.Empty(name, parent, pivot).transform;
            Shapes.Prim(PrimitiveType.Capsule, name + "Mesh", p, new Vector3(0f, -halfLen, 0f), new Vector3(thick, halfLen, thick), c, false);
            return p;
        }

        /// <summary>Sudden jolt: the "did that one just move?" moment.</summary>
        public void Twitch(float intensity)
        {
            for (int i = 0; i < 6; i++) _vel[i] += Random.insideUnitSphere * 900f * intensity;
        }

        void Update()
        {
            if (_hips == null) return;
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            float t = Time.time + _seed;
            var targets = _targets;
            System.Array.Clear(targets, 0, targets.Length);

            switch (Mode)
            {
                case FigureMode.Idle:
                    targets[Hips] = new Vector3(0f, 0f, Mathf.Sin(t * 1.3f) * 4f);
                    targets[ArmL] = new Vector3(Mathf.Sin(t * 1.7f) * 8f, 0f, -12f);
                    targets[ArmR] = new Vector3(Mathf.Sin(t * 1.5f + 1f) * 8f, 0f, 12f);
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

            // Pupils drift toward the look target — eyes that follow you.
            Vector3 pupilOffset = Vector3.zero;
            if (HasLookTarget)
            {
                var lp = _head.InverseTransformPoint(LookTarget).normalized;
                pupilOffset = new Vector3(Mathf.Clamp(lp.x, -0.25f, 0.25f), Mathf.Clamp(lp.y, -0.2f, 0.2f), 0f);
            }
            _pupilL.localPosition = new Vector3(pupilOffset.x, pupilOffset.y, 0.38f);
            _pupilR.localPosition = new Vector3(pupilOffset.x, pupilOffset.y, 0.38f);
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
