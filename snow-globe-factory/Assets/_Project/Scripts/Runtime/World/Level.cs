using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    public struct WorldLabel
    {
        public Vector3 Position;
        public string Text;
        public float MaxDistance;
    }

    /// <summary>
    /// Anchors of the built level. Everything gameplay needs to find lives here.
    ///
    /// Layout (metres, +Z runs from the street into the building):
    ///   Storefront  z 0..10   (+ staff hallway x 2.5..5, z 10..13)   floor y 0
    ///   Backroom    z 13..23                                          floor y 0
    ///   Basement    z 23..39, reached by stairs from the backroom      floor y -4
    /// </summary>
    public sealed class Level : MonoBehaviour
    {
        public const float StoreBackZ = 13f;     // storefront incl. staff hallway
        public const float BackroomBackZ = 23f;
        public const float BasementFloorY = -4f;

        public static readonly Vector3 DisplayCenter = new Vector3(0f, 0f, 5f);
        public const float DisplayAvoidRadius = 2.1f;

        public Transform PlayerSpawn;
        public float PlayerSpawnYaw;
        public PrepStation Prep;
        public AssemblyStation Assembly;
        public SealerStation Sealer;
        public InspectionStation Inspection;
        public PackagingStation Packaging;
        public readonly List<ShelfSlot> ShelfSlots = new List<ShelfSlot>();
        /// <summary>Premium tier slots on the round display (enabled by the upgrade).</summary>
        public GameObject PremiumCase;
        /// <summary>Decorative globes shown in the premium spots until the upgrade is bought.</summary>
        public GameObject PremiumDecor;
        public readonly List<HoldingCell> Cells = new List<HoldingCell>();
        /// <summary>Delivery crate inside the basement freight lift.</summary>
        public SnapSocket Hatch;
        public Door LiftGate;
        public BlinkLamp LiftLamp;
        public SnapSocket CounterSocket;
        public OrderBoard OrderBoard;
        public SecurityDesk SecurityDesk;
        // Automation (Milestone 3): shown once the matching upgrade is installed.
        public GameObject AutoPrepRig, ConveyorRig, PackagerRig, SealPressRig;
        /// <summary>Window Display upgrade: a lit stand of globes facing the street.</summary>
        public GameObject WindowDisplay;
        public SnapSocket PrepHopper;
        public ConveyorView Conveyor;
        public SnapSocket[] OutputSlots = new SnapSocket[AutomationService.OutputShelfCapacity];
        public readonly List<MachinePanel> Panels = new List<MachinePanel>();
        public Door FrontDoor;
        public Door StaffDoor;
        public Door BasementDoor;
        public ServiceCounter Counter;
        /// <summary>Behind the counter; active only while the Shop Assistant is hired.</summary>
        public ShopAssistant Assistant;
        /// <summary>Boutique refit decor, one layer per tier (shown as tiers are bought).</summary>
        public readonly GameObject[] RefitDecor = new GameObject[ReputationService.MaxRefitTier];
        public OpenSign Sign;
        public Breaker Breaker;
        public Transform CustomerSpawn;
        public Transform CustomerEntrance;
        public Transform CounterSpot;
        public Transform DarkCorner;
        public Transform[] BrowsePoints;
        public Transform PremiumBrowse;
        public readonly List<FlickerLight> Lights = new List<FlickerLight>();
        public readonly List<WorldLabel> Labels = new List<WorldLabel>();
        public Vector3 StoreCenter;
        public Vector3 BasementCenter;

        public PlayerArea AreaOf(Vector3 p)
        {
            if (p.z < StoreBackZ) return PlayerArea.Storefront;
            if (p.z < BackroomBackZ && p.y > -0.5f) return PlayerArea.Backroom;
            return PlayerArea.Basement;
        }

        public IEnumerable<StationBase> Stations
        {
            get
            {
                yield return Prep;
                yield return Assembly;
                yield return Sealer;
                yield return Inspection;
                yield return Packaging;
            }
        }

        public StationBase StationFor(StationId id)
        {
            switch (id)
            {
                case StationId.PrepCradle: return Prep;
                case StationId.Assembly: return Assembly;
                case StationId.Sealer: return Sealer;
                case StationId.Inspection: return Inspection;
                case StationId.Packaging: return Packaging;
                default: return null;
            }
        }

        public HoldingCell CellAt(int index)
        {
            return index >= 0 && index < Cells.Count ? Cells[index] : null;
        }

        /// <summary>First empty holding cabinet, preferring <paramref name="preferred"/>. Null if all are full.</summary>
        public HoldingCell FreeCell(int preferred = -1)
        {
            var p = CellAt(preferred);
            if (p != null && p.Occupant == null) return p;
            foreach (var c in Cells) if (c.Occupant == null) return c;
            return null;
        }

        /// <summary>
        /// Where a loose character heads next: always toward the public shop, one doorway at a time.
        /// Closed doors stop them, which is exactly why doors matter.
        /// </summary>
        public Vector3 NearestEscapeTarget(Vector3 from)
        {
            switch (AreaOf(from))
            {
                case PlayerArea.Basement:
                    if (BasementDoor.IsOpen)
                    {
                        // On (or at the foot of) the stairs: climb to the door. Otherwise: go to the foot.
                        if (from.x < -5.1f && from.z < 33.6f) return new Vector3(-6.1f, 0f, 21.8f);
                        return new Vector3(-6.1f, BasementFloorY, 33.2f);
                    }
                    return new Vector3(Random.Range(-4.5f, 5f), BasementFloorY, Random.Range(26f, 37f));
                case PlayerArea.Backroom:
                    if (StaffDoor.IsOpen) return new Vector3(3.75f, 0f, 11.5f);
                    return new Vector3(Random.Range(-4f, 4f), 0f, Random.Range(14.5f, 21.5f));
                default:
                    var p = new Vector3(Random.Range(-5f, 5f), 0f, Random.Range(1.5f, 9f));
                    if ((p - DisplayCenter).magnitude < DisplayAvoidRadius) p.x = p.x < 0f ? -3.5f : 3.5f;
                    return p;
            }
        }

        static readonly Vector3[] Ring = BuildRing();
        readonly List<Vector3> _candidate = new List<Vector3>();

        static Vector3[] BuildRing()
        {
            var r = new Vector3[8];
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI / 4f;
                r[i] = DisplayCenter + new Vector3(Mathf.Sin(a) * 2.5f, 0f, Mathf.Cos(a) * 2.5f);
            }
            return r;
        }

        static bool Clear(Vector3 from, Vector3 to)
        {
            var a = new Vector2(from.x, from.z);
            var b = new Vector2(to.x, to.z);
            var c = new Vector2(DisplayCenter.x, DisplayCenter.z);
            var ab = b - a;
            float t = ab.sqrMagnitude < 0.0001f ? 0f : Mathf.Clamp01(Vector2.Dot(c - a, ab) / ab.sqrMagnitude);
            return (a + ab * t - c).magnitude >= DisplayAvoidRadius;
        }

        /// <summary>
        /// Customers walk in straight lines. If that line would cut through the round display,
        /// fills <paramref name="path"/> with waypoints around it (shortest way round a ring of 8 points).
        /// </summary>
        public void PathAround(Vector3 from, Vector3 to, List<Vector3> path)
        {
            path.Clear();
            if (from.z > StoreBackZ || to.z > StoreBackZ || Clear(from, to)) return;
            float best = float.MaxValue;
            for (int i = 0; i < Ring.Length; i++)
            {
                if (!Clear(from, Ring[i])) continue;
                for (int dir = -1; dir <= 1; dir += 2)
                {
                    _candidate.Clear();
                    int j = i;
                    float len = Vector3.Distance(from, Ring[i]);
                    _candidate.Add(Ring[i]);
                    for (int step = 0; step < Ring.Length; step++)
                    {
                        if (Clear(Ring[j], to))
                        {
                            float total = len + Vector3.Distance(Ring[j], to);
                            if (total < best)
                            {
                                best = total;
                                path.Clear();
                                path.AddRange(_candidate);
                            }
                            break;
                        }
                        int next = (j + dir + Ring.Length) % Ring.Length;
                        len += Vector3.Distance(Ring[j], Ring[next]);
                        _candidate.Add(Ring[next]);
                        j = next;
                    }
                }
            }
            for (int i = 0; i < path.Count; i++) path[i] = new Vector3(path[i].x, from.y, path[i].z);
        }

        public void AddLabel(Vector3 pos, string text, float maxDistance = 6f)
        {
            Labels.Add(new WorldLabel { Position = pos, Text = text, MaxDistance = maxDistance });
        }
    }
}
