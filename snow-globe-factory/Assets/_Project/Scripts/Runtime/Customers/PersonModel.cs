using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// A full-size person (customer, shop assistant) drawn with one of Kenney's Mini Characters and animated from how
    /// fast its root moves: idle, walk or run, plus one-off gestures. The clips are imported as legacy animation
    /// (see ModelImportSettings) and played with a plain Animation component.
    /// </summary>
    public sealed class PersonModel : MonoBehaviour
    {
        static readonly string[] Characters =
        {
            "character-female-a", "character-male-a", "character-female-b", "character-male-b", "character-female-c", "character-male-c",
            "character-female-d", "character-male-d", "character-female-e", "character-male-e", "character-female-f", "character-male-f",
        };

        const float Fade = 0.2f;

        Animation _anim;
        string _current;
        string _gesture;
        float _gestureUntil;
        Vector3 _lastPos;
        float _speed;

        /// <summary>Forced pose instead of movement-driven (e.g. "idle" for someone standing at a till).</summary>
        public string Hold;
        /// <summary>Speed (m/s) above which the person runs instead of walks.</summary>
        public float RunSpeed = 2.2f;

        /// <summary>
        /// Adds a character model under <paramref name="root"/> (feet on the root, facing +Z) and returns the driver, or null
        /// if the model or its animations aren't available (callers then keep their primitive body).
        /// </summary>
        public static PersonModel Attach(Transform root, int variant, float height)
        {
            string name = Characters[Mathf.Abs(variant) % Characters.Length];
            var model = Models.Place("Characters/" + name, root, Vector3.zero, height);
            if (model == null) return null;
            var anim = model.GetComponent<Animation>();
            if (anim == null || anim.GetClip("idle") == null)
            {
                // Clips imported for the Animator instead of as legacy: show the model posed rather than risk a broken rig.
                if (anim != null) Object.Destroy(anim);
                return model.AddComponent<PersonModel>();
            }
            anim.playAutomatically = false;
            anim.cullingType = AnimationCullingType.BasedOnRenderers;
            foreach (var loop in new[] { "idle", "walk", "sprint" })
                if (anim[loop] != null) anim[loop].wrapMode = WrapMode.Loop;
            var p = model.AddComponent<PersonModel>();
            p._anim = anim;
            p._lastPos = model.transform.position;
            p.Play("idle");
            return p;
        }

        void Play(string clip)
        {
            if (_anim == null || clip == _current || _anim[clip] == null) return;
            _current = clip;
            _anim.CrossFade(clip, Fade);
        }

        /// <summary>Plays a one-off gesture ("pick-up", "interact-right", "emote-no", "emote-yes") over the current motion.</summary>
        public void Gesture(string clip)
        {
            if (_anim == null || _anim[clip] == null) return;
            _gesture = clip;
            _gestureUntil = Time.time + _anim[clip].length;
            _anim[clip].wrapMode = WrapMode.Once;
            _current = null; // let the motion clip fade back in afterwards
            _anim.CrossFade(clip, Fade * 0.5f);
        }

        void Update()
        {
            if (_anim == null) return;
            float dt = Time.deltaTime;
            if (dt > 0f)
            {
                var d = transform.position - _lastPos;
                d.y = 0f;
                _speed = Mathf.Lerp(_speed, d.magnitude / dt, 1f - Mathf.Exp(-dt * 10f));
                _lastPos = transform.position;
            }
            if (Time.time < _gestureUntil) return;
            string want = !string.IsNullOrEmpty(Hold) ? Hold : _speed > RunSpeed ? "sprint" : _speed > 0.15f ? "walk" : "idle";
            Play(want);
            if (want == "walk" && _anim["walk"] != null) _anim["walk"].speed = Mathf.Clamp(_speed / 1.3f, 0.6f, 1.6f);
        }
    }
}
