using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Placeholder-art factory: coloured primitives with cached materials. Picks the URP Lit
    /// shader when a render pipeline asset is active, otherwise the built-in Standard shader.
    /// </summary>
    public static class Shapes
    {
        static readonly Dictionary<int, Material> Cache = new Dictionary<int, Material>();
        static Shader _lit;

        public static bool UsingUrp { get { return GraphicsSettings.currentRenderPipeline != null; } }

        static Shader Lit
        {
            get
            {
                if (_lit != null) return _lit;
                _lit = UsingUrp ? Shader.Find("Universal Render Pipeline/Lit") : null;
                if (_lit == null) _lit = Shader.Find("Standard");
                return _lit;
            }
        }

        public static Material Mat(Color color, float emission = 0f, bool transparent = false, float smoothness = 0.2f)
        {
            int key = color.GetHashCode() ^ (emission.GetHashCode() * 31) ^ (transparent ? 7919 : 0) ^ (smoothness.GetHashCode() * 17);
            Material m;
            if (Cache.TryGetValue(key, out m) && m != null) return m;
            m = NewMat(color, emission, transparent, smoothness);
            Cache[key] = m;
            return m;
        }

        /// <summary>Unshared material for objects whose colour animates (status lights, flicker).</summary>
        public static Material NewMat(Color color, float emission = 0f, bool transparent = false, float smoothness = 0.2f)
        {
            var m = new Material(Lit);
            SetColor(m, color);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            if (emission > 0f) SetEmission(m, color * emission);
            if (transparent) MakeTransparent(m);
            return m;
        }

        public static void SetColor(Material m, Color c)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        }

        public static void SetEmission(Material m, Color c)
        {
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", c);
        }

        static void MakeTransparent(Material m)
        {
            if (m.HasProperty("_Surface"))
            {
                // URP Lit
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", 0f);
                m.SetOverrideTag("RenderType", "Transparent");
                m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                m.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                m.SetInt("_ZWrite", 0);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            }
            else
            {
                // Built-in Standard, "Fade" mode
                m.SetFloat("_Mode", 2f);
                m.SetOverrideTag("RenderType", "Transparent");
                m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                m.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                m.SetInt("_ZWrite", 0);
                m.DisableKeyword("_ALPHATEST_ON");
                m.EnableKeyword("_ALPHABLEND_ON");
                m.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            }
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        // ---------------- textures and signage ----------------

        static readonly Dictionary<string, Texture2D> TexCache = new Dictionary<string, Texture2D>();
        static readonly Dictionary<string, Material> TexMatCache = new Dictionary<string, Material>();
        static Shader _unlit;

        static Shader Unlit
        {
            get
            {
                if (_unlit != null) return _unlit;
                _unlit = UsingUrp ? Shader.Find("Universal Render Pipeline/Unlit") : null;
                if (_unlit == null) _unlit = Shader.Find("Unlit/Texture");
                if (_unlit == null) _unlit = Lit;
                return _unlit;
            }
        }

        /// <summary>Loads a generated texture from Resources/SnowGlobeArt (see tools/art/generate_art.py). Null if missing.</summary>
        public static Texture2D Tex(string name)
        {
            Texture2D t;
            if (TexCache.TryGetValue(name, out t)) return t;
            t = Resources.Load<Texture2D>("SnowGlobeArt/" + name);
            if (t == null) Debug.LogWarning("[SnowGlobe] Missing texture SnowGlobeArt/" + name);
            TexCache[name] = t;
            return t;
        }

        /// <summary>Shared textured material. Unlit is used for "views" (windows) that should glow regardless of room light.</summary>
        public static Material TexMat(string texName, bool unlit = false)
        {
            string key = texName + (unlit ? "|u" : "|l");
            Material m;
            if (TexMatCache.TryGetValue(key, out m) && m != null) return m;
            m = NewTexMat(Tex(texName), unlit);
            TexMatCache[key] = m;
            return m;
        }

        public static Material NewTexMat(Texture2D tex, bool unlit = false)
        {
            var m = new Material(unlit ? Unlit : Lit);
            SetColor(m, Color.white);
            if (tex != null)
            {
                m.mainTexture = tex;
                if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
                if (m.HasProperty("_MainTex")) m.SetTexture("_MainTex", tex);
            }
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.15f);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.15f);
            return m;
        }

        /// <summary>
        /// A flat textured panel (sign, label, window view) whose readable face points along <paramref name="facing"/>.
        /// </summary>
        public static GameObject Sign(string name, Transform parent, Vector3 center, Vector3 facing, float width, float height, string texName, bool unlit = false)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = name;
            RemoveCollider(go);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            // The built-in quad is visible from its -Z side, so point -Z along "facing".
            go.transform.localRotation = Quaternion.LookRotation(-facing.normalized, Vector3.up);
            go.transform.localScale = new Vector3(width, height, 1f);
            go.GetComponent<Renderer>().sharedMaterial = TexMat(texName, unlit);
            return go;
        }

        /// <summary>A sign lying flat on a surface (paper on a desk), readable from <paramref name="readFrom"/>.</summary>
        public static GameObject FlatSign(string name, Transform parent, Vector3 center, Vector3 readFrom, float width, float height, string texName)
        {
            var go = Sign(name, parent, center, Vector3.up, width, height, texName);
            var fwd = new Vector3(-readFrom.x, 0f, -readFrom.z).normalized;
            go.transform.localRotation = Quaternion.LookRotation(Vector3.down, fwd);
            return go;
        }

        /// <summary>Cylinder spanning two local points (pipes, rails, ladder sides).</summary>
        public static GameObject Rod(string name, Transform parent, Vector3 from, Vector3 to, float radius, Color color, bool collider = false)
        {
            var dir = to - from;
            var go = Prim(PrimitiveType.Cylinder, name, parent, (from + to) * 0.5f, new Vector3(radius * 2f, dir.magnitude * 0.5f, radius * 2f), color, collider);
            go.transform.localRotation = Quaternion.FromToRotation(Vector3.up, dir.normalized);
            return go;
        }

        public static GameObject Prim(PrimitiveType type, string name, Transform parent, Vector3 localPos, Vector3 scale, Color color, bool keepCollider = true)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = Mat(color);
            if (!keepCollider) RemoveCollider(go);
            return go;
        }

        /// <summary>Strips a primitive's built-in collider, in Play mode or while building in the editor.</summary>
        static void RemoveCollider(GameObject go)
        {
            var col = go.GetComponent<Collider>();
            // Disable now: Destroy is deferred, and a live child collider would join a parent rigidbody for a frame.
            col.enabled = false;
            // Destroy isn't allowed outside Play mode (edit-mode tests, editor scene building).
            if (Application.isPlaying) Object.Destroy(col);
            else Object.DestroyImmediate(col);
        }

        public static GameObject Box(string name, Transform parent, Vector3 center, Vector3 size, Color color, bool collider = true)
        {
            return Prim(PrimitiveType.Cube, name, parent, center, size, color, collider);
        }

        public static GameObject Empty(string name, Transform parent, Vector3 localPos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            return go;
        }

        public static Light PointLight(string name, Transform parent, Vector3 pos, Color color, float intensity, float range)
        {
            var go = Empty(name, parent, pos);
            var l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.color = color;
            l.intensity = intensity;
            l.range = range;
            l.shadows = LightShadows.None;
            return l;
        }
    }

    public static class Palette
    {
        // Storefront: warm, cosy gift shop.
        public static readonly Color StoreWall = new Color(0.93f, 0.82f, 0.68f);
        public static readonly Color StoreFloor = new Color(0.55f, 0.33f, 0.2f);
        public static readonly Color StoreTrim = new Color(0.7f, 0.15f, 0.15f);
        public static readonly Color Wood = new Color(0.45f, 0.28f, 0.16f);
        public static readonly Color WarmLight = new Color(1f, 0.82f, 0.6f);
        // Backroom: practical, fluorescent.
        public static readonly Color BackWall = new Color(0.72f, 0.74f, 0.7f);
        public static readonly Color BackFloor = new Color(0.4f, 0.42f, 0.42f);
        public static readonly Color Steel = new Color(0.55f, 0.58f, 0.62f);
        public static readonly Color ColdLight = new Color(0.85f, 0.95f, 1f);
        // Basement: cold, dirty.
        public static readonly Color BasementWall = new Color(0.28f, 0.3f, 0.29f);
        public static readonly Color BasementFloor = new Color(0.2f, 0.2f, 0.19f);
        public static readonly Color Grime = new Color(0.25f, 0.22f, 0.16f);
        public static readonly Color SickLight = new Color(0.65f, 0.85f, 0.7f);
        // Product.
        public static readonly Color Snow = new Color(0.97f, 0.98f, 1f);
        public static readonly Color Glass = new Color(0.8f, 0.92f, 1f, 0.28f);
        public static readonly Color GlobeBase = new Color(0.35f, 0.18f, 0.1f);
        public static readonly Color BoxColor = new Color(0.78f, 0.2f, 0.22f);
        public static readonly Color Serum = new Color(0.4f, 1f, 0.8f);
        // Concept-art palette: teal/navy woodwork, brass, cream plaster, warm pools of light.
        public static readonly Color Teal = new Color(0.2f, 0.33f, 0.36f);
        public static readonly Color TealDark = new Color(0.12f, 0.2f, 0.23f);
        public static readonly Color Navy = new Color(0.1f, 0.15f, 0.23f);
        public static readonly Color Brass = new Color(0.78f, 0.6f, 0.32f);
        public static readonly Color Cream = new Color(0.9f, 0.84f, 0.72f);
        public static readonly Color WoodWarm = new Color(0.42f, 0.27f, 0.16f);
        public static readonly Color RugBlue = new Color(0.24f, 0.33f, 0.44f);
        public static readonly Color Slate = new Color(0.2f, 0.22f, 0.24f);
        public static readonly Color Cardboard = new Color(0.72f, 0.6f, 0.44f);
        public static readonly Color Foliage = new Color(0.22f, 0.36f, 0.22f);
        // UI status.
        public static readonly Color Ok = new Color(0.3f, 0.9f, 0.4f);
        public static readonly Color Busy = new Color(1f, 0.8f, 0.2f);
        public static readonly Color Bad = new Color(1f, 0.25f, 0.2f);
        public static readonly Color Idle = new Color(0.4f, 0.45f, 0.5f);
    }
}
