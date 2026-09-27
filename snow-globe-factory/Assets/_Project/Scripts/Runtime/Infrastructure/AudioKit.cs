using System.Collections.Generic;
using UnityEngine;

namespace SnowGlobe.Game
{
    public enum Sfx
    {
        Bell,
        Tap,
        Scratch,
        Mumble,
        Inject,
        Knock,
        Hum,
        PowerDown,
        Tick,
        Chime,
        Thump,
        Squeak,
    }

    /// <summary>
    /// Procedurally generated placeholder audio so the prototype needs zero imported assets:
    /// a music-box loop for the shop, and short synthesized effects.
    /// </summary>
    public sealed class AudioKit : MonoBehaviour
    {
        const int Rate = 44100;

        readonly Dictionary<Sfx, AudioClip> _clips = new Dictionary<Sfx, AudioClip>();
        AudioSource _music;
        AudioSource _ambience;
        float _musicDuck = 1f;
        float _musicDuckTarget = 1f;

        public AudioSource Music { get { return _music; } }
        public bool MusicDucked { get { return _musicDuckTarget < 0.5f; } }

        public void Init(Vector3 storeCenter, Vector3 basementCenter)
        {
            _clips[Sfx.Bell] = Tone("bell", 1.2f, t => Bells(t, 1318f));
            _clips[Sfx.Chime] = Tone("chime", 0.8f, t => Bells(t, 1760f) * 0.6f);
            _clips[Sfx.Tap] = Tone("tap", 0.08f, t => Noise() * Mathf.Exp(-t * 80f));
            _clips[Sfx.Scratch] = Tone("scratch", 1.2f, t => Noise() * (0.5f + 0.5f * Mathf.Sin(t * 60f)) * Mathf.Clamp01(Mathf.Sin(t * 2.6f)) * 0.5f);
            _clips[Sfx.Mumble] = Tone("mumble", 0.7f, t => Mathf.Sin(t * 2f * Mathf.PI * (180f + 40f * Mathf.Sin(t * 13f))) * Mathf.Clamp01(Mathf.Sin(t * 9f)) * 0.4f);
            _clips[Sfx.Squeak] = Tone("squeak", 0.25f, t => Mathf.Sin(t * 2f * Mathf.PI * (900f + 1200f * t)) * Mathf.Exp(-t * 10f) * 0.5f);
            _clips[Sfx.Inject] = Tone("inject", 0.4f, t => Noise() * Mathf.Exp(-t * 6f) * 0.4f + Mathf.Sin(t * 2f * Mathf.PI * 600f) * Mathf.Exp(-t * 20f) * 0.3f);
            _clips[Sfx.Knock] = Tone("knock", 0.9f, t => Knocks(t));
            _clips[Sfx.Hum] = Tone("hum", 2f, t => (Mathf.Sin(t * 2f * Mathf.PI * 60f) + 0.5f * Mathf.Sin(t * 2f * Mathf.PI * 120f)) * 0.25f);
            _clips[Sfx.PowerDown] = Tone("powerdown", 1.5f, t => Mathf.Sin(t * 2f * Mathf.PI * (220f - 120f * t)) * (1f - t / 1.5f) * 0.5f);
            _clips[Sfx.Tick] = Tone("tick", 0.05f, t => Mathf.Sin(t * 2f * Mathf.PI * 2000f) * Mathf.Exp(-t * 120f));
            _clips[Sfx.Thump] = Tone("thump", 0.3f, t => Mathf.Sin(t * 2f * Mathf.PI * (90f - 60f * t)) * Mathf.Exp(-t * 12f));

            _music = MakeLoop("MusicBox", storeCenter, MusicBox(), 18f, Settings.MusicVolume);
            _ambience = MakeLoop("BasementAmbience", basementCenter, Tone("drone", 4f, t => (Mathf.Sin(t * 2f * Mathf.PI * 43f) * 0.3f + Noise() * 0.05f) * (0.7f + 0.3f * Mathf.Sin(t * 1.5f))), 14f, 0.35f);
        }

        AudioSource MakeLoop(string name, Vector3 pos, AudioClip clip, float maxDistance, float volume)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.position = pos;
            var src = go.AddComponent<AudioSource>();
            src.clip = clip;
            src.loop = true;
            src.spatialBlend = 1f;
            src.rolloffMode = AudioRolloffMode.Linear;
            src.minDistance = maxDistance * 0.4f;
            src.maxDistance = maxDistance;
            src.volume = volume;
            src.Play();
            return src;
        }

        void Update()
        {
            _musicDuck = Mathf.MoveTowards(_musicDuck, _musicDuckTarget, Time.deltaTime * 0.5f);
            if (_music != null) _music.volume = Settings.MusicVolume * _musicDuck;
        }

        /// <summary>Music dropout horror beat: the shop goes quiet and other sounds become audible.</summary>
        public void SetMusicDucked(bool ducked) { _musicDuckTarget = ducked ? 0f : 1f; }

        public void Play(Sfx sfx, Vector3 position, float volume = 1f, float pitch = 1f)
        {
            AudioClip clip;
            if (!_clips.TryGetValue(sfx, out clip)) return;
            var go = new GameObject("sfx_" + sfx);
            go.transform.position = position;
            var src = go.AddComponent<AudioSource>();
            src.clip = clip;
            src.spatialBlend = 1f;
            src.minDistance = 1f;
            src.maxDistance = 20f;
            src.rolloffMode = AudioRolloffMode.Linear;
            src.volume = volume;
            src.pitch = pitch;
            src.Play();
            Destroy(go, clip.length / Mathf.Max(0.1f, pitch) + 0.1f);
        }

        public void Play2D(Sfx sfx, float volume = 1f)
        {
            AudioClip clip;
            if (!_clips.TryGetValue(sfx, out clip)) return;
            var go = new GameObject("sfx2d_" + sfx);
            var src = go.AddComponent<AudioSource>();
            src.clip = clip;
            src.spatialBlend = 0f;
            src.volume = volume;
            src.Play();
            Destroy(go, clip.length + 0.1f);
        }

        // ---- synthesis helpers ----

        static readonly System.Random NoiseRng = new System.Random(7);

        static float Noise() { return (float)(NoiseRng.NextDouble() * 2.0 - 1.0); }

        static float Bells(float t, float f)
        {
            float env = Mathf.Exp(-t * 3.5f);
            return (Mathf.Sin(t * 2f * Mathf.PI * f) + 0.5f * Mathf.Sin(t * 2f * Mathf.PI * f * 2.76f) + 0.25f * Mathf.Sin(t * 2f * Mathf.PI * f * 5.4f)) * env * 0.35f;
        }

        static float Knocks(float t)
        {
            float v = 0f;
            for (int i = 0; i < 3; i++)
            {
                float k = t - i * 0.25f;
                if (k > 0f) v += Mathf.Sin(k * 2f * Mathf.PI * 110f) * Mathf.Exp(-k * 30f);
            }
            return v * 0.8f;
        }

        delegate float Wave(float t);

        static AudioClip Tone(string name, float seconds, Wave wave)
        {
            int n = Mathf.CeilToInt(seconds * Rate);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(wave(i / (float)Rate), -1f, 1f);
            var clip = AudioClip.Create(name, n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        /// <summary>A little original music-box tune in C major, 16 plucked notes per loop.</summary>
        static AudioClip MusicBox()
        {
            int[] melody = { 12, 16, 19, 24, 23, 19, 16, 14, 12, 16, 19, 21, 19, 16, 14, 7 };
            const float noteLen = 0.42f;
            float seconds = melody.Length * noteLen;
            int n = Mathf.CeilToInt(seconds * Rate);
            var data = new float[n];
            for (int k = 0; k < melody.Length; k++)
            {
                float freq = 523.25f * Mathf.Pow(2f, (melody[k] - 12) / 12f);
                int start = Mathf.RoundToInt(k * noteLen * Rate);
                int len = Mathf.Min(n - start, Mathf.RoundToInt(noteLen * 2.2f * Rate));
                for (int i = 0; i < len; i++)
                {
                    float t = i / (float)Rate;
                    float s = (Mathf.Sin(t * 2f * Mathf.PI * freq) + 0.3f * Mathf.Sin(t * 2f * Mathf.PI * freq * 3f)) * Mathf.Exp(-t * 4f) * 0.25f;
                    int idx = (start + i) % n;
                    data[idx] = Mathf.Clamp(data[idx] + s, -1f, 1f);
                }
            }
            var clip = AudioClip.Create("musicbox", n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
