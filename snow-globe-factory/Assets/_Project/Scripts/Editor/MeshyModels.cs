using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace SnowGlobe.EditorTools
{
    /// <summary>
    /// Slims the models tools/meshy/meshy_generate.py downloads. Meshy's FBX files embed a 2K texture and weigh ~8 MB,
    /// plus a separate ~7 MB base-colour PNG; this rewrites each as a plain OBJ mesh and a 1024px JPG (together well under
    /// 1 MB) and deletes the originals. The game pairs them up at runtime (Models.Place applies the texture).
    /// </summary>
    public static class MeshyModels
    {
        const string Folder = "Assets/_Project/Resources/Models/Meshy/";
        const int TextureSize = 1024;

        [MenuItem("Snow Globe/Slim Meshy Models")]
        public static string Slim()
        {
            var log = new StringBuilder();
            foreach (var fbx in Directory.GetFiles(Folder, "*.fbx"))
            {
                string name = Path.GetFileNameWithoutExtension(fbx);
                string asset = Folder + name + ".fbx";
                AssetDatabase.ImportAsset(asset);
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(asset);
                if (go == null) { log.AppendLine(name + ": not imported"); continue; }
                File.WriteAllText(Folder + name + ".obj", ToObj(go), Encoding.ASCII);

                string png = Folder + name + "_basecolor.png";
                if (File.Exists(png))
                {
                    var src = new Texture2D(2, 2);
                    src.LoadImage(File.ReadAllBytes(png));
                    File.WriteAllBytes(Folder + name + ".jpg", Resize(src, TextureSize).EncodeToJPG(88));
                    Object.DestroyImmediate(src);
                    AssetDatabase.DeleteAsset(png);
                }
                AssetDatabase.DeleteAsset(asset);
                log.AppendLine(name + ": slimmed");
            }
            AssetDatabase.Refresh();
            return log.ToString();
        }

        /// <summary>All meshes under the model, baked into its root space, as one OBJ (Unity's importer mirrors x back).</summary>
        static string ToObj(GameObject root)
        {
            var sb = new StringBuilder("# Converted from a Meshy text-to-3D model by MeshyModels.cs\n");
            int offset = 1;
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>())
            {
                var mesh = mf.sharedMesh;
                if (mesh == null) continue;
                // Keep the root's rotation and scale (the FBX axis and unit fixes), just not its position.
                var m = Matrix4x4.Translate(-root.transform.position) * mf.transform.localToWorldMatrix;
                var v = mesh.vertices; var n = mesh.normals; var uv = mesh.uv;
                sb.Append("o ").Append(mf.name).Append('\n');
                foreach (var p in v) { var w = m.MultiplyPoint3x4(p); Line(sb, "v", -w.x, w.y, w.z); }
                foreach (var q in n) { var w = m.MultiplyVector(q).normalized; Line(sb, "vn", -w.x, w.y, w.z); }
                foreach (var t in uv) Line(sb, "vt", t.x, t.y);
                var tris = mesh.triangles;
                for (int i = 0; i < tris.Length; i += 3)
                {
                    // Mirroring x flips the winding, so write each triangle reversed.
                    int a = tris[i] + offset, b = tris[i + 2] + offset, c = tris[i + 1] + offset;
                    sb.AppendFormat(CultureInfo.InvariantCulture, "f {0}/{0}/{0} {1}/{1}/{1} {2}/{2}/{2}\n", a, b, c);
                }
                offset += v.Length;
            }
            return sb.ToString();
        }

        static void Line(StringBuilder sb, string tag, params float[] xs)
        {
            sb.Append(tag);
            foreach (var x in xs) sb.Append(' ').Append(x.ToString("0.#####", CultureInfo.InvariantCulture));
            sb.Append('\n');
        }

        static Texture2D Resize(Texture2D src, int size)
        {
            var rt = RenderTexture.GetTemporary(size, size, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            Graphics.Blit(src, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var dst = new Texture2D(size, size, TextureFormat.RGB24, false);
            dst.ReadPixels(new Rect(0, 0, size, size), 0, 0);
            dst.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            return dst;
        }
    }
}
