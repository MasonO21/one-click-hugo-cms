using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    public enum ViewMode
    {
        Socketed, // sitting in a station / shelf slot (kinematic)
        Roaming,  // wandering inside a holding pen (kinematic, cheap)
        Carried,  // in the player's hands (physics, follows the hold point)
        Physics,  // dropped / loose in the world
    }

    /// <summary>
    /// World representation of one Product (one living character and, later, its globe).
    /// The Product record in GameState stays the source of truth; this view mirrors it
    /// and reports world positions back for saving.
    /// </summary>
    public sealed class ProductView : MonoBehaviour
    {
        public const float LooseSpeed = 1.1f;
        public const float SimplifyDistance = 15f;

        public int ProductId;
        public Product P;
        public MiniCharacterBody Figure;
        public Rigidbody Body;
        public ViewMode Mode;
        public SnapSocket Socket { get; private set; }

        public Vector3 HoldTarget;
        public Quaternion HoldRotation = Quaternion.identity;

        public float LastMovementTime = -999f;
        public float LastMovementIntensity;

        CapsuleCollider _charCol;
        SphereCollider _globeCol;
        Transform _globe, _scenery;
        GameObject _base, _snow, _dome, _box;
        ProductStage _shown = (ProductStage)(-1);
        int _shownDecoration = -1;
        Vector3 _roamTarget;
        float _roamTimer, _hopTimer, _stumbleTimer, _syncTimer, _slipTimer, _stareTimer;
        bool _staring;

        public bool IsLooseCharacter
        {
            get { return P != null && P.Stage == ProductStage.Unprepared && (Mode == ViewMode.Physics || Mode == ViewMode.Carried); }
        }

        public bool IsEscaped { get { return P != null && P.Stage == ProductStage.Unprepared && Mode == ViewMode.Physics; } }

        public bool RecentlyMoved(float window) { return Time.time - LastMovementTime < window; }

        public void Init(Product p)
        {
            ProductId = p.Id;
            P = p;
            name = "Product_" + p.Id + "_" + p.CharacterName;

            Body = gameObject.AddComponent<Rigidbody>();
            Body.mass = 0.4f;
            Body.interpolation = RigidbodyInterpolation.Interpolate;
            Body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            Body.linearDamping = 0.4f;
            Body.angularDamping = 2f;

            _charCol = gameObject.AddComponent<CapsuleCollider>();
            _charCol.radius = 0.06f;
            _charCol.height = MiniCharacterBody.Height;
            _charCol.center = new Vector3(0f, MiniCharacterBody.Height * 0.5f, 0f);
            _globeCol = gameObject.AddComponent<SphereCollider>();
            _globeCol.radius = 0.15f;
            _globeCol.center = new Vector3(0f, 0.15f, 0f);

            _globe = Shapes.Empty("Globe", transform, Vector3.zero).transform;
            _base = Shapes.Prim(PrimitiveType.Cylinder, "Base", _globe, new Vector3(0f, 0.025f, 0f), new Vector3(0.26f, 0.025f, 0.26f), Palette.GlobeBase, false);
            _scenery = Shapes.Empty("Scenery", _globe, new Vector3(0f, 0.05f, 0f)).transform;
            _snow = Shapes.Prim(PrimitiveType.Cylinder, "Snow", _globe, new Vector3(0f, 0.055f, 0f), new Vector3(0.24f, 0.006f, 0.24f), Palette.Snow, false);
            _dome = Shapes.Prim(PrimitiveType.Sphere, "Dome", _globe, new Vector3(0f, 0.16f, 0f), new Vector3(0.27f, 0.25f, 0.27f), Palette.Glass, false);
            _dome.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
            _box = Shapes.Prim(PrimitiveType.Cube, "Box", transform, new Vector3(0f, 0.15f, 0f), new Vector3(0.3f, 0.3f, 0.3f), Palette.BoxColor, false);
            Shapes.Prim(PrimitiveType.Cube, "Ribbon", _box.transform, Vector3.zero, new Vector3(1.02f, 1.02f, 0.15f), new Color(0.95f, 0.85f, 0.3f), false);

            Figure = Shapes.Empty("Figure", transform, Vector3.zero).AddComponent<MiniCharacterBody>();
            Figure.Build(p.Id * 7919 + (int)p.Archetype);
            Refresh();
        }

        void Refresh()
        {
            var stage = P.Stage;
            _shown = stage;
            bool mounted = stage >= ProductStage.Mounted;
            bool boxed = stage == ProductStage.Packaged;
            _globe.gameObject.SetActive(mounted && !boxed);
            _base.SetActive(mounted);
            bool decorated = stage >= ProductStage.Decorated;
            _scenery.gameObject.SetActive(decorated);
            _snow.SetActive(decorated);
            if (decorated)
            {
                float fill = Mathf.Lerp(0.004f, 0.03f, P.SnowAmount);
                _snow.transform.localScale = new Vector3(0.24f, fill, 0.24f);
                _snow.transform.localPosition = new Vector3(0f, 0.05f + fill, 0f);
                if (_shownDecoration != P.DecorationCode) BuildScenery(P.DecorationCode);
            }
            _dome.SetActive(stage >= ProductStage.Domed && !boxed);
            _box.SetActive(boxed);
            Figure.gameObject.SetActive(!boxed);
            Figure.transform.localPosition = mounted ? new Vector3(0f, 0.05f, -0.02f) : Vector3.zero;

            _charCol.enabled = !mounted;
            _globeCol.enabled = mounted;
            UpdateFigureMode();
        }

        public static readonly string[] SceneryNames = { "Pine Tree", "Cottage", "Snowman", "Lamp Post" };

        void BuildScenery(int code)
        {
            _shownDecoration = code;
            for (int i = _scenery.childCount - 1; i >= 0; i--) Destroy(_scenery.GetChild(i).gameObject);
            for (int spot = 0; spot < 3; spot++)
            {
                int item = (code >> (spot * 2)) & 3;
                float angle = (spot * 120f + 150f) * Mathf.Deg2Rad;
                var root = Shapes.Empty("Spot" + spot, _scenery, new Vector3(Mathf.Sin(angle) * 0.085f, 0f, Mathf.Cos(angle) * 0.085f)).transform;
                switch (item)
                {
                    case 0:
                        Shapes.Prim(PrimitiveType.Cylinder, "Trunk", root, new Vector3(0f, 0.01f, 0f), new Vector3(0.012f, 0.01f, 0.012f), Palette.Wood, false);
                        Shapes.Prim(PrimitiveType.Sphere, "Needles", root, new Vector3(0f, 0.05f, 0f), new Vector3(0.045f, 0.08f, 0.045f), new Color(0.12f, 0.4f, 0.2f), false);
                        break;
                    case 1:
                        Shapes.Prim(PrimitiveType.Cube, "House", root, new Vector3(0f, 0.018f, 0f), new Vector3(0.04f, 0.036f, 0.035f), new Color(0.85f, 0.75f, 0.55f), false);
                        var roof = Shapes.Prim(PrimitiveType.Cube, "Roof", root, new Vector3(0f, 0.042f, 0f), new Vector3(0.032f, 0.032f, 0.04f), Palette.StoreTrim, false);
                        roof.transform.localRotation = Quaternion.Euler(0f, 0f, 45f);
                        break;
                    case 2:
                        Shapes.Prim(PrimitiveType.Sphere, "Bottom", root, new Vector3(0f, 0.015f, 0f), Vector3.one * 0.03f, Palette.Snow, false);
                        Shapes.Prim(PrimitiveType.Sphere, "Top", root, new Vector3(0f, 0.04f, 0f), Vector3.one * 0.02f, Palette.Snow, false);
                        break;
                    default:
                        Shapes.Prim(PrimitiveType.Cylinder, "Post", root, new Vector3(0f, 0.03f, 0f), new Vector3(0.006f, 0.03f, 0.006f), new Color(0.15f, 0.15f, 0.15f), false);
                        var bulb = Shapes.Prim(PrimitiveType.Sphere, "Bulb", root, new Vector3(0f, 0.062f, 0f), Vector3.one * 0.012f, Palette.WarmLight, false);
                        bulb.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.WarmLight, 2f);
                        break;
                }
            }
        }

        bool _override;
        FigureMode _overrideMode;
        int _overridePose;

        /// <summary>Stations take over the figure's animation during their interaction.</summary>
        public void SetFigureOverride(FigureMode mode, int pose)
        {
            _override = true;
            _overrideMode = mode;
            _overridePose = pose;
        }

        public void ClearFigureOverride() { _override = false; }

        void UpdateFigureMode()
        {
            var stage = P.Stage;
            if (_override)
            {
                Figure.Mode = _overrideMode;
                Figure.PoseIndex = _overridePose;
                return;
            }
            Figure.PoseIndex = P.PoseIndex;
            if (stage >= ProductStage.Mounted) Figure.Mode = FigureMode.Posed;
            else if (stage == ProductStage.Prepared) Figure.Mode = FigureMode.Frozen;
            else if (Mode == ViewMode.Carried) Figure.Mode = FigureMode.Struggle;
            else if (Mode == ViewMode.Physics || Mode == ViewMode.Roaming) Figure.Mode = _stumbleTimer > 0f ? FigureMode.Struggle : FigureMode.Walk;
            else Figure.Mode = FigureMode.Idle;
        }

        // ---------------- placement ----------------

        /// <summary>Kinematic bodies only support speculative CCD; switch modes in the right order to avoid warnings.</summary>
        void SetKinematic(bool kinematic)
        {
            if (kinematic)
            {
                Body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
                Body.isKinematic = true;
            }
            else
            {
                Body.isKinematic = false;
                Body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            }
        }

        public void SetIgnoreCollision(Collider other, bool ignore)
        {
            Physics.IgnoreCollision(_charCol, other, ignore);
            Physics.IgnoreCollision(_globeCol, other, ignore);
        }

        public void AttachTo(SnapSocket socket)
        {
            ClearFigureOverride();
            Socket = socket;
            SetKinematic(true);
            Body.useGravity = false;
            transform.SetParent(socket.transform, true);
            if (socket.AllowMultiple)
            {
                Mode = ViewMode.Roaming;
                transform.position = socket.RandomRoamPoint();
                transform.rotation = Quaternion.Euler(0f, Random.Range(0f, 360f), 0f);
                _roamTarget = socket.RandomRoamPoint();
            }
            else
            {
                Mode = ViewMode.Socketed;
                transform.localPosition = Vector3.zero;
                transform.localRotation = Quaternion.identity;
            }
            UpdateFigureMode();
        }

        public void Detach()
        {
            ClearFigureOverride();
            if (Socket != null)
            {
                var s = Socket;
                Socket = null;
                s.Release(this);
            }
            transform.SetParent(null, true);
        }

        public void BeginCarry()
        {
            Detach();
            Mode = ViewMode.Carried;
            SetKinematic(false);
            Body.useGravity = false;
            P.Location = ProductLocation.Carried();
            _slipTimer = 0f;
            UpdateFigureMode();
        }

        /// <summary>Released into the world with physics. Awake characters become loose.</summary>
        public void DropFree(Vector3 velocity)
        {
            Detach();
            Mode = ViewMode.Physics;
            SetKinematic(false);
            Body.useGravity = true;
            Body.linearVelocity = velocity;
            var pos = transform.position;
            P.Location = P.Stage == ProductStage.Unprepared ? ProductLocation.Loose(pos.x, pos.y, pos.z) : ProductLocation.Floor(pos.x, pos.y, pos.z);
            _stumbleTimer = velocity.magnitude > 2f ? 1.2f : 0.3f;
            PickRoamTarget();
            UpdateFigureMode();
        }

        /// <summary>Place at a saved world position (load / wake-up).</summary>
        public void PlaceFree(Vector3 position)
        {
            Detach();
            transform.position = position;
            Mode = ViewMode.Physics;
            SetKinematic(false);
            Body.useGravity = true;
            PickRoamTarget();
            UpdateFigureMode();
        }

        /// <summary>A weak seal let the figure move: visible jolt that customers can witness.</summary>
        public void PlayStasisTwitch(float intensity)
        {
            LastMovementTime = Time.time;
            LastMovementIntensity = intensity;
            Figure.Twitch(intensity);
            if (Mode == ViewMode.Socketed) transform.localRotation = Quaternion.Euler(0f, Random.Range(-35f, 35f) * intensity, 0f);
        }

        public void LookAt(Vector3 point, float seconds)
        {
            Figure.HasLookTarget = true;
            Figure.LookTarget = point;
            _stareTimer = Mathf.Max(_stareTimer, seconds);
        }

        // ---------------- behaviour ----------------

        void Update()
        {
            if (P == null) return;
            if (P.Stage != _shown || (P.Stage >= ProductStage.Decorated && P.DecorationCode != _shownDecoration)) Refresh();
            if (P.Stage == ProductStage.Sold) return;
            UpdateFigureMode();

            Figure.Tremble = P.IsSerumActive && P.SerumRemaining < GameBalance.SerumWarningSeconds
                ? 1f - P.SerumRemaining / GameBalance.SerumWarningSeconds
                : 0f;

            var root = GameRoot.I;
            var cam = root != null && root.Player != null ? root.Player.Camera.transform : null;

            // Staring: characters occasionally lock eyes with the player.
            if (_stareTimer > 0f)
            {
                _stareTimer -= Time.deltaTime;
                if (_stareTimer <= 0f) Figure.HasLookTarget = false;
            }
            else if (cam != null && P.Stage != ProductStage.Packaged)
            {
                float dist = Vector3.Distance(cam.position, transform.position);
                if (dist < 3f && Random.value < Time.deltaTime * 0.15f)
                {
                    _staring = !_staring;
                    if (_staring) LookAt(cam.position, Random.Range(1.5f, 4f));
                }
                if (Figure.HasLookTarget && cam != null && _staring) Figure.LookTarget = cam.position;
            }

            if (Mode == ViewMode.Roaming) UpdateRoaming(cam);
            if (Mode == ViewMode.Carried && P.Stage == ProductStage.Unprepared) UpdateSlip(root);

            _syncTimer -= Time.deltaTime;
            if (_syncTimer <= 0f)
            {
                _syncTimer = 0.5f;
                SyncLocation();
            }
        }

        void UpdateRoaming(Transform cam)
        {
            // Holding-pen life: cheap kinematic wandering. They go quiet and still when you come close.
            bool playerClose = cam != null && Vector3.Distance(cam.position, transform.position) < 2.2f;
            if (playerClose)
            {
                Figure.Mode = FigureMode.Idle;
                if (!Figure.HasLookTarget) LookAt(cam.position, 2f);
                return;
            }
            _roamTimer -= Time.deltaTime;
            if (_roamTimer <= 0f || Vector3.Distance(transform.position, _roamTarget) < 0.05f)
            {
                _roamTimer = Random.Range(2f, 6f);
                if (Socket != null) _roamTarget = Socket.RandomRoamPoint();
            }
            var to = _roamTarget - transform.position;
            to.y = 0f;
            if (to.sqrMagnitude > 0.0025f)
            {
                transform.position += to.normalized * 0.25f * Time.deltaTime;
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), Time.deltaTime * 4f);
                Figure.Mode = FigureMode.Walk;
            }
            else Figure.Mode = FigureMode.Idle;
        }

        void UpdateSlip(GameRoot root)
        {
            if (P.Definition.Special != SpecialBehavior.SlipsGrip) return;
            _slipTimer += Time.deltaTime;
            if (_slipTimer > 2f && Random.value < Time.deltaTime * 0.12f && root != null)
            {
                root.Interactor.ForceRelease("The Wiggler squirms out of your grip!");
            }
        }

        void FixedUpdate()
        {
            if (P == null) return;
            if (Mode == ViewMode.Carried)
            {
                // Soft follow: the lag and overshoot make carried things feel floppy, not glued.
                var toTarget = HoldTarget - Body.position;
                Body.linearVelocity = Vector3.ClampMagnitude(toTarget * 18f, 8f);
                var delta = HoldRotation * Quaternion.Inverse(Body.rotation);
                float angle;
                Vector3 axis;
                delta.ToAngleAxis(out angle, out axis);
                if (angle > 180f) angle -= 360f;
                if (!float.IsNaN(axis.x) && Mathf.Abs(angle) > 0.5f) Body.angularVelocity = axis * (angle * Mathf.Deg2Rad * 10f);
                if (P.Stage == ProductStage.Unprepared) Body.AddTorque(Random.insideUnitSphere * 2f, ForceMode.Acceleration);
                return;
            }
            if (Mode != ViewMode.Physics || P.Stage != ProductStage.Unprepared) return;
            UpdateLoose();
        }

        /// <summary>Stable active-ragdoll approximation: upright torque + hopping locomotion.</summary>
        void UpdateLoose()
        {
            var root = GameRoot.I;
            var player = root != null && root.Player != null ? root.Player.transform.position : Vector3.zero;
            float playerDist = Vector3.Distance(player, Body.position);

            if (playerDist > SimplifyDistance)
            {
                // Far away: skip physics and just scurry.
                var flat = _roamTarget - Body.position;
                flat.y = 0f;
                if (flat.magnitude < 0.2f) PickRoamTarget();
                Body.MovePosition(Body.position + flat.normalized * LooseSpeed * 0.6f * Time.fixedDeltaTime);
                return;
            }

            if (_stumbleTimer > 0f)
            {
                _stumbleTimer -= Time.fixedDeltaTime;
                return; // flop around; no balance while stumbling
            }

            var up = transform.up;
            Vector3 uprightAxis = Vector3.Cross(up, Vector3.up);
            Body.AddTorque(uprightAxis * 80f - Body.angularVelocity * 6f, ForceMode.Acceleration);
            if (Vector3.Dot(up, Vector3.up) < 0.3f) return; // still getting up

            _roamTimer -= Time.fixedDeltaTime;
            if (playerDist < 2.5f)
            {
                var away = Body.position - player;
                away.y = 0f;
                _roamTarget = Body.position + away.normalized * 2f;
            }
            else if (_roamTimer <= 0f || Vector3.Distance(Body.position, _roamTarget) < 0.3f) PickRoamTarget();

            var dir = _roamTarget - Body.position;
            dir.y = 0f;
            if (dir.sqrMagnitude < 0.01f) return;
            dir.Normalize();

            float yawError = Vector3.SignedAngle(new Vector3(transform.forward.x, 0f, transform.forward.z), dir, Vector3.up);
            Body.AddTorque(Vector3.up * yawError * 0.3f, ForceMode.Acceleration);

            _hopTimer -= Time.fixedDeltaTime;
            if (_hopTimer <= 0f && IsGrounded())
            {
                _hopTimer = 0.22f;
                var v = Body.linearVelocity;
                var horizontal = dir * LooseSpeed;
                Body.linearVelocity = new Vector3(horizontal.x, Mathf.Max(v.y, 0.9f), horizontal.z);
            }
        }

        bool IsGrounded()
        {
            return Physics.Raycast(Body.position + Vector3.up * 0.05f, Vector3.down, 0.1f, ~0, QueryTriggerInteraction.Ignore);
        }

        void PickRoamTarget()
        {
            _roamTimer = Random.Range(2f, 5f);
            var root = GameRoot.I;
            if (P != null && root != null && root.Level != null && (P.Definition.Special == SpecialBehavior.SeeksExits || Random.value < 0.5f))
            {
                _roamTarget = root.Level.NearestEscapeTarget(transform.position);
                return;
            }
            var r = Random.insideUnitCircle * 2f;
            _roamTarget = transform.position + new Vector3(r.x, 0f, r.y);
        }

        void OnCollisionEnter(Collision c)
        {
            if (P == null || Mode != ViewMode.Physics) return;
            float speed = c.relativeVelocity.magnitude;
            if (speed < 2.5f) return;
            var root = GameRoot.I;
            if (root == null) return;
            root.Audio.Play(Sfx.Thump, transform.position, Mathf.Clamp01(speed / 6f));
            if (P.IsSealedGlobe)
            {
                root.Session.Production.ApplyDamage(P, (speed - 2.5f) * 0.15f);
                root.Toast("Clunk. That globe took some damage.");
            }
            else if (P.Stage == ProductStage.Unprepared)
            {
                root.Audio.Play(Sfx.Squeak, transform.position, 0.8f);
                _stumbleTimer = 1f;
            }
        }

        public void SyncLocation()
        {
            var pos = transform.position;
            if (P.Location.Kind == LocationKind.Floor || P.Location.Kind == LocationKind.Loose || P.Location.Kind == LocationKind.Carried)
            {
                P.Location.X = pos.x;
                P.Location.Y = pos.y;
                P.Location.Z = pos.z;
            }
        }
    }
}
