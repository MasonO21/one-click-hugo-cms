using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// The hired shop assistant (Shop Assistant upgrade). Stands behind the counter while hired and rings up
    /// whoever is waiting, a little slower than the player does it. They only work the till: they never go
    /// past the staff door and never talk a suspicious customer round.
    /// </summary>
    public sealed class ShopAssistant : MonoBehaviour
    {
        Transform _head;
        PersonModel _look;
        int _servingId = -1;
        float _serving;

        /// <summary>0..1 progress on the current sale (for the counter prompt).</summary>
        public float ServeProgress { get { return _servingId < 0 ? 0f : Mathf.Clamp01(_serving / GameBalance.AssistantServeSeconds); } }
        public bool IsServing { get { return _servingId >= 0; } }

        public static ShopAssistant Build(Transform parent, Vector3 localPos, float yaw)
        {
            var go = Shapes.Empty("ShopAssistant", parent, localPos);
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            var t = go.transform;
            var col = go.AddComponent<CapsuleCollider>();
            col.height = 1.8f;
            col.radius = 0.28f;
            col.center = new Vector3(0f, 0.9f, 0f);
            var a = go.AddComponent<ShopAssistant>();
            a._look = PersonModel.Attach(t, 7, 1.5f);
            if (a._look != null)
            {
                a._look.Hold = "idle";
                go.SetActive(false);
                return a;
            }
            // Placeholder body if the character models are missing.
            Shapes.Prim(PrimitiveType.Capsule, "Body", t, new Vector3(0f, 0.8f, 0f), new Vector3(0.5f, 0.8f, 0.42f), Palette.Cream, false);
            Shapes.Box("Apron", t, new Vector3(0f, 0.75f, 0.2f), new Vector3(0.42f, 0.7f, 0.04f), Palette.StoreTrim, false);
            Shapes.Box("NameTag", t, new Vector3(0.1f, 1.18f, 0.23f), new Vector3(0.1f, 0.05f, 0.01f), Palette.Brass, false);
            var head = Shapes.Empty("Head", t, new Vector3(0f, 1.6f, 0f)).transform;
            Shapes.Prim(PrimitiveType.Sphere, "Skull", head, Vector3.zero, Vector3.one * 0.31f, new Color(0.93f, 0.78f, 0.64f), false);
            Shapes.Prim(PrimitiveType.Sphere, "EyeL", head, new Vector3(-0.06f, 0.03f, 0.14f), Vector3.one * 0.05f, Color.black, false);
            Shapes.Prim(PrimitiveType.Sphere, "EyeR", head, new Vector3(0.06f, 0.03f, 0.14f), Vector3.one * 0.05f, Color.black, false);
            Shapes.Box("Hair", head, new Vector3(0f, 0.12f, -0.02f), new Vector3(0.3f, 0.1f, 0.3f), Palette.WoodWarm, false);
            a._head = head;
            go.SetActive(false);
            return a;
        }

        void OnDisable()
        {
            _servingId = -1;
            _serving = 0f;
        }

        void Update()
        {
            var root = GameRoot.I;
            if (root == null || root.Session == null || Time.deltaTime <= 0f) return;
            var c = root.Customers.WaitingAtCounter;
            if (c == null || !root.Session.Days.IsOpen)
            {
                _servingId = -1;
                _serving = 0f;
                Idle();
                return;
            }
            if (c.Id != _servingId)
            {
                _servingId = c.Id;
                _serving = 0f;
            }
            if (_head != null) _head.rotation = Quaternion.Slerp(_head.rotation, Quaternion.LookRotation(c.Head.position - _head.position), Time.deltaTime * 6f);
            if (_look != null)
            {
                // Turn to face whoever they're serving.
                var to = c.transform.position - transform.position;
                to.y = 0f;
                if (to.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), Time.deltaTime * 5f);
            }
            _serving += Time.deltaTime;
            if (_serving < GameBalance.AssistantServeSeconds) return;
            _servingId = -1;
            _serving = 0f;
            if (_look != null) _look.Gesture("interact-right");
            c.CompletePurchase(byAssistant: true);
        }

        void Idle()
        {
            if (_head == null) return;
            // Glances slowly around the shop floor between customers.
            float yaw = Mathf.Sin(Time.time * 0.3f) * 35f;
            _head.localRotation = Quaternion.Slerp(_head.localRotation, Quaternion.Euler(0f, yaw, 0f), Time.deltaTime * 2f);
        }
    }
}
