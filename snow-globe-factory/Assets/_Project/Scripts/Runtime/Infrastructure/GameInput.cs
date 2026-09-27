using UnityEngine;
#if ENABLE_INPUT_SYSTEM && SGF_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace SnowGlobe.Game
{
    /// <summary>
    /// Keyboard + mouse bindings in one place. Works with the legacy Input Manager
    /// (default for this project) and with the Input System package if a project
    /// has it set as the only active input backend.
    /// </summary>
    public static class GameInput
    {
        public const string MoveHint = "WASD";

#if ENABLE_INPUT_SYSTEM && SGF_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
        static Keyboard K { get { return Keyboard.current; } }
        static Mouse M { get { return Mouse.current; } }

        public static Vector2 Move
        {
            get
            {
                if (K == null) return Vector2.zero;
                float x = (K.dKey.isPressed ? 1f : 0f) - (K.aKey.isPressed ? 1f : 0f);
                float y = (K.wKey.isPressed ? 1f : 0f) - (K.sKey.isPressed ? 1f : 0f);
                return Vector2.ClampMagnitude(new Vector2(x, y), 1f);
            }
        }
        public static Vector2 Look { get { return M == null ? Vector2.zero : M.delta.ReadValue() * 0.05f; } }
        public static float Scroll { get { return M == null ? 0f : Mathf.Sign(M.scroll.ReadValue().y) * (Mathf.Abs(M.scroll.ReadValue().y) > 0.01f ? 1f : 0f); } }
        public static bool Sprint { get { return K != null && K.leftShiftKey.isPressed; } }
        public static bool InteractDown { get { return K != null && K.eKey.wasPressedThisFrame; } }
        public static bool InteractHeld { get { return K != null && K.eKey.isPressed; } }
        public static bool InteractUp { get { return K != null && K.eKey.wasReleasedThisFrame; } }
        public static bool SecondaryDown { get { return K != null && K.xKey.wasPressedThisFrame; } }
        public static bool RedoseDown { get { return K != null && K.qKey.wasPressedThisFrame; } }
        public static bool GrabDown { get { return M != null && M.leftButton.wasPressedThisFrame; } }
        public static bool RotateHeld { get { return M != null && M.rightButton.isPressed; } }
        public static bool InspectHeld { get { return K != null && K.fKey.isPressed; } }
        public static bool ShakeDown { get { return K != null && K.gKey.wasPressedThisFrame; } }
        public static bool MenuDown { get { return K != null && K.tabKey.wasPressedThisFrame; } }
        public static bool PauseDown { get { return K != null && K.escapeKey.wasPressedThisFrame; } }
        public static bool QuickSaveDown { get { return K != null && K.f5Key.wasPressedThisFrame; } }
        public static bool QuickLoadDown { get { return K != null && K.f9Key.wasPressedThisFrame; } }

        public static int NumberDown
        {
            get
            {
                if (K == null) return 0;
                if (K.digit1Key.wasPressedThisFrame) return 1;
                if (K.digit2Key.wasPressedThisFrame) return 2;
                if (K.digit3Key.wasPressedThisFrame) return 3;
                return 0;
            }
        }

        /// <summary>0=left 1=up 2=right 3=down, -1 = none (arrows or WASD).</summary>
        public static int DirectionDown
        {
            get
            {
                if (K == null) return -1;
                if (K.leftArrowKey.wasPressedThisFrame || K.aKey.wasPressedThisFrame) return 0;
                if (K.upArrowKey.wasPressedThisFrame || K.wKey.wasPressedThisFrame) return 1;
                if (K.rightArrowKey.wasPressedThisFrame || K.dKey.wasPressedThisFrame) return 2;
                if (K.downArrowKey.wasPressedThisFrame || K.sKey.wasPressedThisFrame) return 3;
                return -1;
            }
        }
#else
        public static Vector2 Move
        {
            get
            {
                float x = (Input.GetKey(KeyCode.D) ? 1f : 0f) - (Input.GetKey(KeyCode.A) ? 1f : 0f);
                float y = (Input.GetKey(KeyCode.W) ? 1f : 0f) - (Input.GetKey(KeyCode.S) ? 1f : 0f);
                return Vector2.ClampMagnitude(new Vector2(x, y), 1f);
            }
        }
        public static Vector2 Look { get { return new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")); } }
        public static float Scroll
        {
            get
            {
                float s = Input.mouseScrollDelta.y;
                return Mathf.Abs(s) > 0.01f ? Mathf.Sign(s) : 0f;
            }
        }
        public static bool Sprint { get { return Input.GetKey(KeyCode.LeftShift); } }
        public static bool InteractDown { get { return Input.GetKeyDown(KeyCode.E); } }
        public static bool InteractHeld { get { return Input.GetKey(KeyCode.E); } }
        public static bool InteractUp { get { return Input.GetKeyUp(KeyCode.E); } }
        public static bool SecondaryDown { get { return Input.GetKeyDown(KeyCode.X); } }
        public static bool RedoseDown { get { return Input.GetKeyDown(KeyCode.Q); } }
        public static bool GrabDown { get { return Input.GetMouseButtonDown(0); } }
        public static bool RotateHeld { get { return Input.GetMouseButton(1); } }
        public static bool InspectHeld { get { return Input.GetKey(KeyCode.F); } }
        public static bool ShakeDown { get { return Input.GetKeyDown(KeyCode.G); } }
        public static bool MenuDown { get { return Input.GetKeyDown(KeyCode.Tab); } }
        public static bool PauseDown { get { return Input.GetKeyDown(KeyCode.Escape); } }
        public static bool QuickSaveDown { get { return Input.GetKeyDown(KeyCode.F5); } }
        public static bool QuickLoadDown { get { return Input.GetKeyDown(KeyCode.F9); } }

        public static int NumberDown
        {
            get
            {
                if (Input.GetKeyDown(KeyCode.Alpha1)) return 1;
                if (Input.GetKeyDown(KeyCode.Alpha2)) return 2;
                if (Input.GetKeyDown(KeyCode.Alpha3)) return 3;
                return 0;
            }
        }

        /// <summary>0=left 1=up 2=right 3=down, -1 = none (arrows or WASD).</summary>
        public static int DirectionDown
        {
            get
            {
                if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A)) return 0;
                if (Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W)) return 1;
                if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D)) return 2;
                if (Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S)) return 3;
                return -1;
            }
        }
#endif

        public static string DirectionGlyph(int dir)
        {
            switch (dir)
            {
                case 0: return "← / A";
                case 1: return "↑ / W";
                case 2: return "→ / D";
                default: return "↓ / S";
            }
        }
    }
}
