using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Colours and small proportion tweaks for one miniature.</summary>
    public struct FigureStyle
    {
        public Color Coat, Hat, Scarf, Hair, Skin, Knit, Boots, Bloomers;
        public bool SleepyLids;
        public float HatDroop;

        static readonly Color[] Coats = { new Color(0.15f, 0.2f, 0.32f), new Color(0.16f, 0.29f, 0.24f), new Color(0.32f, 0.19f, 0.28f), new Color(0.23f, 0.23f, 0.26f), new Color(0.5f, 0.38f, 0.17f) };
        static readonly Color[] Scarves = { new Color(0.52f, 0.12f, 0.13f), new Color(0.72f, 0.55f, 0.2f), new Color(0.86f, 0.8f, 0.68f), new Color(0.16f, 0.4f, 0.42f) };
        static readonly Color[] Hairs = { new Color(0.9f, 0.85f, 0.7f), new Color(0.88f, 0.88f, 0.86f), new Color(0.55f, 0.3f, 0.17f), new Color(0.26f, 0.17f, 0.11f), new Color(0.1f, 0.08f, 0.08f) };
        static readonly Color[] Skins = { new Color(0.97f, 0.86f, 0.78f), new Color(0.88f, 0.7f, 0.56f), new Color(0.7f, 0.5f, 0.36f), new Color(0.45f, 0.3f, 0.22f) };

        /// <summary>
        /// Style from the character reference: navy felt hat with a brass star, chunky red scarf,
        /// flared navy coat with brass buttons, knit mittens, pale hair, pointed ears, big dark eyes.
        /// About 40% of minis wear exactly that; the rest vary the palette.
        /// </summary>
        public static FigureStyle ForSeed(int seed, ArchetypeId archetype)
        {
            var rng = new System.Random(seed);
            bool classic = rng.NextDouble() < 0.4;
            var s = new FigureStyle
            {
                Coat = classic ? Coats[0] : Coats[rng.Next(Coats.Length)],
                Scarf = classic ? Scarves[0] : Scarves[rng.Next(Scarves.Length)],
                Hair = classic ? Hairs[0] : Hairs[rng.Next(Hairs.Length)],
                Skin = Skins[rng.Next(Skins.Length)],
                Knit = new Color(0.72f, 0.66f, 0.56f),
                Boots = new Color(0.22f, 0.15f, 0.1f),
                Bloomers = new Color(0.2f, 0.15f, 0.12f),
                SleepyLids = archetype == ArchetypeId.SleepyOne,
                HatDroop = 14f + (float)rng.NextDouble() * 10f,
            };
            s.Hat = classic ? Coats[0] * 1.05f : Color.Lerp(s.Coat, Coats[rng.Next(Coats.Length)], 0.5f);
            return s;
        }
    }

    /// <summary>The transforms of a built figure that animation drives.</summary>
    public sealed class FigureRig
    {
        public Transform Hips, Head, ArmL, ArmR, LegL, LegR, ScarfTail, Star;
        public Transform[] Hat;
        public Transform IrisL, IrisR;
        public Vector3 IrisLBase, IrisRBase;
    }

    /// <summary>
    /// Builds the miniature from primitives (~30 cm including the floppy hat). Pivot at the feet,
    /// facing +Z. Shared by living minis (MiniCharacterBody) and static decor figurines.
    /// </summary>
    public static class FigureBuilder
    {
        public const float HipHeight = 0.065f;

        public static FigureRig Build(Transform root, FigureStyle st, bool fullDetail)
        {
            var r = new FigureRig();
            Color brass = Palette.Brass;
            Color bootsCol = st.Boots;

            // Legs: knit socks and chunky boots.
            r.LegL = Leg(root, -0.017f, st, bootsCol);
            r.LegR = Leg(root, 0.017f, st, bootsCol);

            r.Hips = Shapes.Empty("Hips", root, new Vector3(0f, HipHeight, 0f)).transform;
            var h = r.Hips;
            Shapes.Prim(PrimitiveType.Sphere, "Bloomers", h, new Vector3(0f, 0.002f, 0f), new Vector3(0.068f, 0.034f, 0.055f), st.Bloomers, false);
            // Flared A-line coat skirt, stacked like the reference's felt coat.
            Shapes.Prim(PrimitiveType.Cylinder, "CoatHem", h, new Vector3(0f, 0.008f, 0f), new Vector3(0.112f, 0.012f, 0.098f), st.Coat, false);
            Shapes.Prim(PrimitiveType.Cylinder, "CoatSkirt", h, new Vector3(0f, 0.028f, 0f), new Vector3(0.098f, 0.012f, 0.086f), st.Coat, false);
            Shapes.Prim(PrimitiveType.Cylinder, "CoatBody", h, new Vector3(0f, 0.062f, 0f), new Vector3(0.08f, 0.025f, 0.068f), st.Coat, false);
            Shapes.Box("Sweater", h, new Vector3(0f, 0.05f, 0.033f), new Vector3(0.022f, 0.055f, 0.006f), st.Knit, false);
            if (fullDetail)
            {
                for (int i = 0; i < 2; i++)
                {
                    float y = 0.035f + i * 0.035f;
                    Shapes.Prim(PrimitiveType.Sphere, "Button", h, new Vector3(-0.017f, y, 0.036f), Vector3.one * 0.008f, brass, false);
                    Shapes.Prim(PrimitiveType.Sphere, "Button", h, new Vector3(0.017f, y, 0.036f), Vector3.one * 0.008f, brass, false);
                }
            }

            // Chunky scarf wrapped high, with a fringed tail that swings.
            Shapes.Prim(PrimitiveType.Cylinder, "ScarfWrap", h, new Vector3(0f, 0.094f, 0.002f), new Vector3(0.086f, 0.012f, 0.078f), st.Scarf, false);
            Shapes.Prim(PrimitiveType.Sphere, "ScarfKnot", h, new Vector3(0.014f, 0.086f, 0.03f), new Vector3(0.034f, 0.03f, 0.024f), st.Scarf, false);
            r.ScarfTail = Shapes.Empty("ScarfTail", h, new Vector3(0.02f, 0.084f, 0.038f)).transform;
            Shapes.Box("Tail", r.ScarfTail, new Vector3(0.004f, -0.036f, 0f), new Vector3(0.022f, 0.072f, 0.008f), st.Scarf, false);
            if (fullDetail)
            {
                for (int i = 0; i < 4; i++)
                    Shapes.Box("Fringe", r.ScarfTail, new Vector3(-0.004f + i * 0.0055f, -0.078f, 0f), new Vector3(0.0025f, 0.012f, 0.0025f), st.Scarf * 0.85f, false);
            }

            // Arms: coat sleeves, knit cuffs, mittens held together in front (reference pose).
            r.ArmL = Arm(h, -0.038f, st);
            r.ArmR = Arm(h, 0.038f, st);

            // Head: oversized, pale messy hair, pointed ears, big dark eyes, rosy cheeks.
            r.Head = Shapes.Empty("Head", h, new Vector3(0f, 0.102f, 0f)).transform;
            var hd = r.Head;
            Shapes.Prim(PrimitiveType.Sphere, "Skull", hd, new Vector3(0f, 0.045f, 0f), new Vector3(0.098f, 0.094f, 0.092f), st.Skin, false);
            Shapes.Prim(PrimitiveType.Sphere, "HairBack", hd, new Vector3(0f, 0.052f, -0.012f), new Vector3(0.104f, 0.096f, 0.09f), st.Hair, false);
            Shapes.Prim(PrimitiveType.Sphere, "HairSideL", hd, new Vector3(-0.043f, 0.03f, 0.005f), new Vector3(0.026f, 0.05f, 0.036f), st.Hair, false);
            Shapes.Prim(PrimitiveType.Sphere, "HairSideR", hd, new Vector3(0.043f, 0.03f, 0.005f), new Vector3(0.026f, 0.05f, 0.036f), st.Hair, false);
            for (int i = 0; i < 3; i++)
            {
                var tuft = Shapes.Prim(PrimitiveType.Sphere, "Fringe", hd, new Vector3(-0.022f + i * 0.022f, 0.074f, 0.036f), new Vector3(0.03f, 0.016f, 0.02f), st.Hair, false);
                tuft.transform.localRotation = Quaternion.Euler(20f, 0f, (i - 1) * 25f);
            }
            Ear(hd, -1f, st.Skin);
            Ear(hd, 1f, st.Skin);

            r.IrisL = Eye(hd, -0.02f, st, fullDetail);
            r.IrisR = Eye(hd, 0.02f, st, fullDetail);
            r.IrisLBase = r.IrisL.localPosition;
            r.IrisRBase = r.IrisR.localPosition;
            if (fullDetail)
            {
                var blush = new Color(0.95f, 0.6f, 0.58f);
                Shapes.Prim(PrimitiveType.Sphere, "BlushL", hd, new Vector3(-0.03f, 0.027f, 0.04f), new Vector3(0.016f, 0.008f, 0.006f), Color.Lerp(st.Skin, blush, 0.6f), false);
                Shapes.Prim(PrimitiveType.Sphere, "BlushR", hd, new Vector3(0.03f, 0.027f, 0.04f), new Vector3(0.016f, 0.008f, 0.006f), Color.Lerp(st.Skin, blush, 0.6f), false);
                Shapes.Prim(PrimitiveType.Sphere, "Nose", hd, new Vector3(0f, 0.033f, 0.046f), Vector3.one * 0.008f, Color.Lerp(st.Skin, blush, 0.35f), false);
                Shapes.Box("Mouth", hd, new Vector3(0f, 0.02f, 0.044f), new Vector3(0.008f, 0.0022f, 0.002f), new Color(0.45f, 0.25f, 0.22f), false);
            }

            // Tall floppy felt hat: a chain of shrinking segments that droops to one side, star on the tip.
            Shapes.Prim(PrimitiveType.Cylinder, "HatBand", hd, new Vector3(0f, 0.078f, -0.004f), new Vector3(0.106f, 0.013f, 0.1f), st.Hat * 0.85f, false);
            int segs = fullDetail ? 5 : 3;
            r.Hat = new Transform[segs];
            var parent = hd;
            var pos = new Vector3(0f, 0.088f, -0.004f);
            float radius = 0.095f;
            float segH = fullDetail ? 0.03f : 0.05f;
            for (int i = 0; i < segs; i++)
            {
                var seg = Shapes.Empty("HatSeg" + i, parent, pos).transform;
                seg.localRotation = Quaternion.Euler(-4f, 0f, st.HatDroop * (i == 0 ? 0.4f : 1f));
                Shapes.Prim(PrimitiveType.Cylinder, "Felt", seg, new Vector3(0f, segH * 0.5f, 0f), new Vector3(radius, segH * 0.5f, radius), st.Hat, false);
                r.Hat[i] = seg;
                parent = seg;
                pos = new Vector3(0f, segH, 0f);
                radius *= fullDetail ? 0.74f : 0.6f;
            }
            r.Star = Shapes.Empty("StarPivot", parent, pos).transform;
            Shapes.Rod("StarCord", r.Star, Vector3.zero, new Vector3(0f, -0.014f, 0f), 0.0012f, brass);
            var starGo = Shapes.Empty("Star", r.Star, new Vector3(0f, -0.024f, 0f));
            var starMat = Shapes.Mat(brass, 0.6f, false, 0.7f);
            for (int k = 0; k < (fullDetail ? 4 : 2); k++)
            {
                var ray = Shapes.Box("Ray", starGo.transform, Vector3.zero, new Vector3(0.0035f, 0.024f, 0.0035f), brass, false);
                ray.transform.localRotation = Quaternion.Euler(0f, 0f, k * (fullDetail ? 45f : 90f));
                ray.GetComponent<Renderer>().sharedMaterial = starMat;
            }
            return r;
        }

        static Transform Leg(Transform root, float x, FigureStyle st, Color boots)
        {
            var p = Shapes.Empty(x < 0 ? "LegL" : "LegR", root, new Vector3(x, HipHeight, 0f)).transform;
            Shapes.Prim(PrimitiveType.Capsule, "Sock", p, new Vector3(0f, -0.03f, 0f), new Vector3(0.019f, 0.022f, 0.019f), st.Knit, false);
            Shapes.Prim(PrimitiveType.Sphere, "Boot", p, new Vector3(0f, -0.054f, 0.006f), new Vector3(0.028f, 0.024f, 0.04f), boots, false);
            return p;
        }

        static Transform Arm(Transform hips, float x, FigureStyle st)
        {
            var p = Shapes.Empty(x < 0 ? "ArmL" : "ArmR", hips, new Vector3(x, 0.082f, 0f)).transform;
            Shapes.Prim(PrimitiveType.Capsule, "Sleeve", p, new Vector3(0f, -0.026f, 0f), new Vector3(0.024f, 0.026f, 0.024f), st.Coat, false);
            Shapes.Prim(PrimitiveType.Sphere, "Cuff", p, new Vector3(0f, -0.05f, 0f), new Vector3(0.028f, 0.016f, 0.028f), st.Knit, false);
            Shapes.Prim(PrimitiveType.Sphere, "Mitten", p, new Vector3(0f, -0.064f, 0.003f), new Vector3(0.024f, 0.026f, 0.022f), st.Knit * 1.05f, false);
            return p;
        }

        static void Ear(Transform head, float side, Color skin)
        {
            var ear = Shapes.Prim(PrimitiveType.Sphere, "Ear", head, new Vector3(0.049f * side, 0.042f, -0.004f), new Vector3(0.012f, 0.014f, 0.042f), skin, false);
            // Point outward, up and slightly back — elfin.
            ear.transform.localRotation = Quaternion.Euler(-28f, 72f * side, 0f);
        }

        static Transform Eye(Transform head, float x, FigureStyle st, bool fullDetail)
        {
            var iris = Shapes.Prim(PrimitiveType.Sphere, "Iris", head, new Vector3(x, 0.042f, 0.039f), new Vector3(0.022f, 0.024f, 0.012f), new Color(0.13f, 0.09f, 0.07f), false).transform;
            var glint = Shapes.Prim(PrimitiveType.Sphere, "Glint", iris, new Vector3(0.22f, 0.25f, 0.42f), Vector3.one * 0.28f, Color.white, false);
            glint.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Color.white, 0.6f);
            if (st.SleepyLids)
            {
                // Heavy half-closed lids: the Sleepy One reads at a glance.
                Shapes.Prim(PrimitiveType.Sphere, "Lid", head, new Vector3(x, 0.049f, 0.041f), new Vector3(0.025f, 0.013f, 0.012f), st.Skin * 0.97f, false);
            }
            return iris;
        }

        /// <summary>A static, lower-detail figurine for shelves and cabinets (no component, no animation).</summary>
        public static Transform Figurine(Transform parent, Vector3 localPos, float yaw, float scale, int seed, bool fullDetail = false)
        {
            var root = Shapes.Empty("Figurine", parent, localPos).transform;
            root.localRotation = Quaternion.Euler(0f, yaw, 0f);
            root.localScale = Vector3.one * scale;
            var rig = Build(root, FigureStyle.ForSeed(seed, (ArchetypeId)(seed % 7)), fullDetail);
            // Reference pose: mittens together in front.
            rig.ArmL.localRotation = Quaternion.Euler(-35f, 0f, 18f);
            rig.ArmR.localRotation = Quaternion.Euler(-35f, 0f, -18f);
            rig.Head.localRotation = Quaternion.Euler(-4f, (seed % 5 - 2) * 12f, (seed % 3 - 1) * 6f);
            return root;
        }
    }
}
