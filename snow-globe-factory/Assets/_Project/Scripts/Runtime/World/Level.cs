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

    /// <summary>Anchors of the built greybox level. Everything gameplay needs to find lives here.</summary>
    public sealed class Level : MonoBehaviour
    {
        // Z boundaries of the three connected areas (the basement is reached by a ramp behind the backroom).
        public const float StoreBackZ = 8f;
        public const float BackroomBackZ = 16f;

        public Transform PlayerSpawn;
        public PrepStation Prep;
        public AssemblyStation Assembly;
        public SealerStation Sealer;
        public InspectionStation Inspection;
        public PackagingStation Packaging;
        public readonly List<ShelfSlot> ShelfSlots = new List<ShelfSlot>();
        public GameObject PremiumCase;
        public HoldingPen[] Pens = new HoldingPen[2];
        public SnapSocket Hatch;
        public SnapSocket CounterSocket;
        public Door StaffDoor;
        public Door BasementDoor;
        public ServiceCounter Counter;
        public OpenSign Sign;
        public Breaker Breaker;
        public Transform CustomerSpawn;
        public Transform CustomerEntrance;
        public Transform CounterSpot;
        public Transform DarkCorner;
        public Transform[] BrowsePoints;
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

        /// <summary>
        /// Where a loose character heads next: always toward the public shop, one doorway at a time.
        /// Closed doors stop them, which is exactly why doors matter.
        /// </summary>
        public Vector3 NearestEscapeTarget(Vector3 from)
        {
            switch (AreaOf(from))
            {
                case PlayerArea.Basement:
                    if (BasementDoor.IsOpen) return from.z > 22.5f ? new Vector3(0f, -3f, 22f) : new Vector3(0f, 0f, 15.5f);
                    return new Vector3(Random.Range(-5f, 5f), -3f, Random.Range(23f, 26f));
                case PlayerArea.Backroom:
                    if (StaffDoor.IsOpen) return new Vector3(-3f, 0f, 7.5f);
                    return new Vector3(Random.Range(-4f, 4f), 0f, Random.Range(9f, 15f));
                default:
                    return new Vector3(Random.Range(-4.5f, 4.5f), 0f, Random.Range(1.5f, 6.5f));
            }
        }

        public void AddLabel(Vector3 pos, string text, float maxDistance = 6f)
        {
            Labels.Add(new WorldLabel { Position = pos, Text = text, MaxDistance = maxDistance });
        }
    }
}
