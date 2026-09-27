using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>First-person walker on a CharacterController. Precise and calm on purpose: the chaos lives in the minis.</summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        public const float WalkSpeed = 3.2f;
        public const float SprintSpeed = 5f;
        public const float EyeHeight = 1.6f;

        public Camera Camera;
        /// <summary>Locked to a station minigame: no movement or look.</summary>
        public bool Locked;
        /// <summary>A menu is open: free cursor, no movement or look.</summary>
        public bool CursorFree;
        /// <summary>Right mouse held while carrying: mouse rotates the held object instead of the view.</summary>
        public bool LookBlocked;
        public float SpeedMultiplier = 1f;

        CharacterController _cc;
        float _pitch;
        float _verticalVelocity;
        float _shake;

        public Vector3 Velocity { get { return _cc != null ? _cc.velocity : Vector3.zero; } }

        public void Init()
        {
            _cc = GetComponent<CharacterController>();
            _cc.height = 1.8f;
            _cc.radius = 0.3f;
            _cc.center = new Vector3(0f, 0.9f, 0f);
            _cc.stepOffset = 0.3f;
            _cc.slopeLimit = 50f;

            var camGo = new GameObject("PlayerCamera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(transform, false);
            camGo.transform.localPosition = new Vector3(0f, EyeHeight, 0f);
            Camera = camGo.AddComponent<Camera>();
            Camera.nearClipPlane = 0.03f;
            Camera.fieldOfView = 70f;
            Camera.backgroundColor = new Color(0.05f, 0.06f, 0.1f);
            Camera.clearFlags = CameraClearFlags.SolidColor;
            camGo.AddComponent<AudioListener>();
        }

        public void Teleport(Vector3 position, float yaw)
        {
            _cc.enabled = false;
            transform.position = position;
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            _pitch = 0f;
            _cc.enabled = true;
        }

        public void AddShake(float amount)
        {
            _shake = Mathf.Max(_shake, amount * Settings.CameraShake);
        }

        void Update()
        {
            bool free = CursorFree;
            Cursor.lockState = free ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = free;

            if (!free && !Locked && !LookBlocked)
            {
                var look = GameInput.Look * Settings.MouseSensitivity;
                transform.Rotate(0f, look.x, 0f);
                _pitch = Mathf.Clamp(_pitch - look.y, -85f, 85f);
            }

            Vector3 move = Vector3.zero;
            if (!free && !Locked)
            {
                var input = GameInput.Move;
                float speed = (GameInput.Sprint ? SprintSpeed : WalkSpeed) * SpeedMultiplier;
                move = (transform.right * input.x + transform.forward * input.y) * speed;
            }

            if (_cc.isGrounded && _verticalVelocity < 0f) _verticalVelocity = -2f;
            _verticalVelocity += Physics.gravity.y * Time.deltaTime;
            move.y = _verticalVelocity;
            _cc.Move(move * Time.deltaTime);

            // Camera shake decays quickly; scaled by the accessibility setting.
            _shake = Mathf.MoveTowards(_shake, 0f, Time.deltaTime * 2f);
            var jitter = _shake > 0f ? Random.insideUnitSphere * _shake * 0.05f : Vector3.zero;
            Camera.transform.localPosition = new Vector3(0f, EyeHeight, 0f) + jitter;
            Camera.transform.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
        }
    }
}
