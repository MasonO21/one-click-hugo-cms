using System.Collections.Generic;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Low-poly models from Resources/Models (Kenney's CC0 kits; see docs/ASSET_CREDITS.md). Every call degrades
    /// gracefully: if a model is missing, callers get null and keep their primitive placeholder.
    /// Models never bring colliders; gameplay collision stays on the primitives they replace.
    /// </summary>
    public static class Models
    {
        static readonly Dictionary<string, GameObject> Cache = new Dictionary<string, GameObject>();
        static readonly Dictionary<string, Bounds> BoundsCache = new Dictionary<string, Bounds>();

        /// <summary>The model asset at Resources/Models/<paramref name="path"/> (e.g. "Holiday/tree"), or null.</summary>
        public static GameObject Prefab(string path)
        {
            GameObject go;
            if (!Cache.TryGetValue(path, out go))
            {
                go = Resources.Load<GameObject>("Models/" + path);
                if (go == null) Debug.LogWarning("[SnowGlobe] Missing model Models/" + path);
                Cache[path] = go;
            }
            return go;
        }

        /// <summary>
        /// Places a model so its footprint is centred on <paramref name="localBottom"/> (in parent space) and its height is
        /// <paramref name="height"/> (uniform scale), turned <paramref name="yaw"/> degrees.
        /// </summary>
        public static GameObject Place(string path, Transform parent, Vector3 localBottom, float height, float yaw = 0f)
        {
            var b = NativeBounds(path);
            if (b.size.y <= 0f) return null;
            return Instantiate(path, parent, localBottom, height / b.size.y, yaw);
        }

        /// <summary>Places a model scaled uniformly to fit inside <paramref name="size"/>, bottom-centred on <paramref name="localBottom"/>.</summary>
        public static GameObject Fit(string path, Transform parent, Vector3 localBottom, Vector3 size, float yaw = 0f)
        {
            var b = NativeBounds(path);
            if (b.size.y <= 0f) return null;
            // Fit in the rotated footprint: at 90° the model's x and z swap.
            bool swap = Mathf.Abs(Mathf.DeltaAngle(yaw, 90f)) < 45f || Mathf.Abs(Mathf.DeltaAngle(yaw, -90f)) < 45f;
            float bx = swap ? b.size.z : b.size.x, bz = swap ? b.size.x : b.size.z;
            float s = size.y / b.size.y;
            if (bx > 0.0001f) s = Mathf.Min(s, size.x / bx);
            if (bz > 0.0001f) s = Mathf.Min(s, size.z / bz);
            return Instantiate(path, parent, localBottom, s, yaw);
        }

        /// <summary>
        /// Swaps a primitive's look for a model: the primitive keeps its collider (so gameplay is unchanged) but stops
        /// rendering, and the model is fitted to its box. Returns false (and leaves the primitive visible) if the model is missing.
        /// </summary>
        public static bool Dress(GameObject primitive, string path, float yaw = 0f)
        {
            if (primitive == null || Prefab(path) == null) return false;
            var t = primitive.transform;
            var size = t.lossyScale;
            var bottom = t.position - t.up * size.y * 0.5f;
            var parent = t.parent;
            var local = parent != null ? parent.InverseTransformPoint(bottom) : bottom;
            float parentYaw = parent != null ? parent.eulerAngles.y : 0f;
            var model = Fit(path, parent, local, size, t.eulerAngles.y - parentYaw + yaw);
            if (model == null) return false;
            var r = primitive.GetComponent<Renderer>();
            if (r != null) r.enabled = false;
            return true;
        }

        static GameObject Instantiate(string path, Transform parent, Vector3 localBottom, float scale, float yaw)
        {
            var prefab = Prefab(path);
            if (prefab == null) return null;
            var b = NativeBounds(path);
            var go = Object.Instantiate(prefab, parent, false);
            go.name = path.Substring(path.LastIndexOf('/') + 1);
            var rot = Quaternion.Euler(0f, yaw, 0f);
            // Keep the model's own root rotation (FBX exports often carry an axis fix) and turn it about the vertical.
            go.transform.localRotation = rot * prefab.transform.localRotation;
            go.transform.localScale = prefab.transform.localScale * scale;
            // Put the bounds' bottom-centre on the requested point.
            var pivotOffset = new Vector3(b.center.x, b.min.y, b.center.z) * scale;
            go.transform.localPosition = localBottom - rot * pivotOffset;
            return go;
        }

        /// <summary>Renderer bounds of the model as imported (its own root rotation and scale), relative to its root position.</summary>
        public static Bounds NativeBounds(string path)
        {
            Bounds b;
            if (BoundsCache.TryGetValue(path, out b)) return b;
            var prefab = Prefab(path);
            b = new Bounds();
            if (prefab != null)
            {
                var probe = Object.Instantiate(prefab);
                probe.transform.position = Vector3.zero;
                probe.transform.rotation = prefab.transform.localRotation;
                probe.transform.localScale = prefab.transform.localScale;
                bool first = true;
                foreach (var r in probe.GetComponentsInChildren<Renderer>())
                {
                    var rb = r is SkinnedMeshRenderer smr ? SkinnedBounds(smr) : r.bounds;
                    if (first) { b = rb; first = false; } else b.Encapsulate(rb);
                }
                probe.SetActive(false);
                if (Application.isPlaying) Object.Destroy(probe); else Object.DestroyImmediate(probe);
            }
            BoundsCache[path] = b;
            return b;
        }

        static Bounds SkinnedBounds(SkinnedMeshRenderer smr)
        {
            var mesh = new Mesh();
            smr.BakeMesh(mesh, true);
            var local = mesh.bounds;
            var world = new Bounds(smr.transform.TransformPoint(local.center), Vector3.zero);
            var e = local.extents;
            for (int i = 0; i < 8; i++)
                world.Encapsulate(smr.transform.TransformPoint(local.center + new Vector3((i & 1) == 0 ? -e.x : e.x, (i & 2) == 0 ? -e.y : e.y, (i & 4) == 0 ? -e.z : e.z)));
            if (Application.isPlaying) Object.Destroy(mesh); else Object.DestroyImmediate(mesh);
            return world;
        }
    }
}
