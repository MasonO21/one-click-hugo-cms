using SnowGlobe.Core;
using UnityEngine;
#if SGF_URP
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
#endif

namespace SnowGlobe.Game
{
    /// <summary>
    /// The look of each area, blended as the player walks between them: ambient light, fog and (with URP) a
    /// post-processing grade. The shop is warm and cosy, the backroom neutral, the basement cold, foggy and grainy.
    /// A power failure drags everything darker. A few key lamps cast soft shadows.
    /// </summary>
    public sealed class Atmosphere : MonoBehaviour
    {
        struct Mood
        {
            public Color Ambient;
            public Color Fog;
            public float FogDensity;
            public float Exposure, Contrast, Saturation, Vignette, Grain;
            public Color Filter;
        }

        static readonly Mood Store = new Mood
        {
            Ambient = new Color(0.27f, 0.23f, 0.21f), Fog = new Color(0.32f, 0.26f, 0.22f), FogDensity = 0.004f,
            Exposure = 0.15f, Contrast = 8f, Saturation = 8f, Vignette = 0.2f, Grain = 0f, Filter = new Color(1f, 0.95f, 0.88f),
        };
        static readonly Mood Backroom = new Mood
        {
            Ambient = new Color(0.2f, 0.2f, 0.22f), Fog = new Color(0.18f, 0.18f, 0.2f), FogDensity = 0.008f,
            Exposure = 0.05f, Contrast = 10f, Saturation = -5f, Vignette = 0.25f, Grain = 0.05f, Filter = new Color(0.97f, 0.97f, 1f),
        };
        static readonly Mood Basement = new Mood
        {
            Ambient = new Color(0.17f, 0.2f, 0.21f), Fog = new Color(0.06f, 0.08f, 0.085f), FogDensity = 0.028f,
            Exposure = 0.3f, Contrast = 18f, Saturation = -35f, Vignette = 0.4f, Grain = 0.3f, Filter = new Color(0.85f, 0.95f, 1f),
        };

        Mood _current = Store;
        bool _started;
        Vector3 _lastPlayerPos;

#if SGF_URP
        Volume _volume;
        ColorAdjustments _color;
        Vignette _vignette;
        FilmGrain _grain;
#endif

        public void Init(Level level, Camera camera)
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            EnableShadows(level);
#if SGF_URP
            var data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.Neutral);
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(0.95f);
            bloom.intensity.Override(0.7f);
            bloom.scatter.Override(0.65f);
            bloom.tint.Override(new Color(1f, 0.9f, 0.75f));
            _color = profile.Add<ColorAdjustments>(true);
            _vignette = profile.Add<Vignette>(true);
            _vignette.smoothness.Override(0.45f);
            _grain = profile.Add<FilmGrain>(true);
            _grain.type.Override(FilmGrainLookup.Medium3);
            _volume = gameObject.AddComponent<Volume>();
            _volume.isGlobal = true;
            _volume.priority = 10f;
            _volume.sharedProfile = profile;
#endif
            Apply(Store);
        }

        /// <summary>Soft shadows on one or two key lamps per room; the rest stay shadowless to keep the frame cheap.</summary>
        static void EnableShadows(Level level)
        {
            var keyLamps = new[] { new Vector3(-4f, 2.8f, 8.2f), new Vector3(-1f, 3.5f, 18.3f), new Vector3(-2.6f, 0.8f, 28f), new Vector3(0f, 0.9f, 31.5f) };
            foreach (var target in keyLamps)
            {
                FlickerLight best = null;
                float bestD = 1.5f;
                foreach (var l in level.Lights)
                {
                    if (l == null) continue;
                    float d = Vector3.Distance(l.transform.position, target);
                    if (d < bestD) { bestD = d; best = l; }
                }
                if (best == null) continue;
                var light = best.GetComponent<Light>();
                light.shadows = LightShadows.Soft;
                light.shadowStrength = 0.75f;
                light.shadowBias = 0.05f;
                light.shadowNormalBias = 0.4f;
            }
        }

        void Update()
        {
            var root = GameRoot.I;
            if (root == null || root.Player == null) return;
            var area = root.Level.AreaOf(root.Player.transform.position);
            var target = area == PlayerArea.Basement ? Basement : area == PlayerArea.Storefront ? Store : Backroom;
            if (root.Horror != null && root.Horror.PowerOut)
            {
                // Blackout: everything drops toward the basement's cold, dark look.
                target = Lerp(target, Basement, 0.7f);
                target.Exposure -= 0.4f;
            }
            // Walking between rooms fades the mood; a teleport (loading, respawning) snaps it.
            var pos = root.Player.transform.position;
            bool jumped = (pos - _lastPlayerPos).sqrMagnitude > 25f;
            _lastPlayerPos = pos;
            float k = _started && !jumped ? 1f - Mathf.Exp(-Time.deltaTime * 2.5f) : 1f;
            _started = true;
            _current = Lerp(_current, target, k);
            Apply(_current);
        }

        void Apply(Mood m)
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = m.Ambient;
            RenderSettings.fogColor = m.Fog;
            RenderSettings.fogDensity = m.FogDensity;
#if SGF_URP
            if (_color == null) return;
            _color.postExposure.Override(m.Exposure);
            _color.contrast.Override(m.Contrast);
            _color.saturation.Override(m.Saturation);
            _color.colorFilter.Override(m.Filter);
            _vignette.intensity.Override(m.Vignette);
            _grain.intensity.Override(Settings.ReducedFlicker ? 0f : m.Grain);
#endif
        }

        static Mood Lerp(Mood a, Mood b, float t)
        {
            return new Mood
            {
                Ambient = Color.Lerp(a.Ambient, b.Ambient, t),
                Fog = Color.Lerp(a.Fog, b.Fog, t),
                FogDensity = Mathf.Lerp(a.FogDensity, b.FogDensity, t),
                Exposure = Mathf.Lerp(a.Exposure, b.Exposure, t),
                Contrast = Mathf.Lerp(a.Contrast, b.Contrast, t),
                Saturation = Mathf.Lerp(a.Saturation, b.Saturation, t),
                Vignette = Mathf.Lerp(a.Vignette, b.Vignette, t),
                Grain = Mathf.Lerp(a.Grain, b.Grain, t),
                Filter = Color.Lerp(a.Filter, b.Filter, t),
            };
        }
    }
}
