using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Builds the whole greybox building from primitives at runtime: a warm storefront,
    /// a fluorescent backroom with five stations, and a ramp down to a cold basement.
    /// Swap pieces for real art later without touching gameplay code: gameplay only
    /// references the anchors stored on <see cref="Level"/>.
    /// </summary>
    public static class LevelBuilder
    {
        public static Level Build(Transform parent)
        {
            var root = new GameObject("Level");
            root.transform.SetParent(parent, false);
            var level = root.AddComponent<Level>();
            var t = root.transform;

            RenderSettings.ambientMode = AmbientMode();
            RenderSettings.ambientLight = new Color(0.22f, 0.21f, 0.24f);
            QualitySettings.pixelLightCount = Mathf.Max(QualitySettings.pixelLightCount, 8);

            BuildExterior(t);
            BuildStore(level, t);
            BuildBackroom(level, t);
            BuildRampAndBasement(level, t);

            level.StoreCenter = new Vector3(0f, 1.5f, 4f);
            level.BasementCenter = new Vector3(0f, -1.5f, 27f);
            level.PlayerSpawn = Shapes.Empty("PlayerSpawn", t, new Vector3(0f, 0.05f, 5f)).transform;
            return level;
        }

        static UnityEngine.Rendering.AmbientMode AmbientMode() { return UnityEngine.Rendering.AmbientMode.Flat; }

        // ------------------------------------------------------------------ exterior

        static void BuildExterior(Transform t)
        {
            Shapes.Box("Sidewalk", t, new Vector3(0f, -0.06f, -6f), new Vector3(24f, 0.1f, 12f), new Color(0.9f, 0.93f, 0.97f));
            var sky = Shapes.PointLight("StreetLamp", t, new Vector3(0f, 3.5f, -4f), new Color(0.7f, 0.8f, 1f), 1.2f, 10f);
            sky.gameObject.name = "StreetLamp";
        }

        // ------------------------------------------------------------------ storefront (z 0..8)

        static void BuildStore(Level level, Transform parent)
        {
            var t = Shapes.Empty("Storefront", parent, Vector3.zero).transform;
            Shapes.Box("Floor", t, new Vector3(0f, -0.05f, 4f), new Vector3(12.4f, 0.1f, 8f), Palette.StoreFloor);
            Shapes.Box("Ceiling", t, new Vector3(0f, 3.05f, 4f), new Vector3(12.4f, 0.1f, 8f), Palette.StoreWall);
            Shapes.Box("WallL", t, new Vector3(-6.1f, 1.5f, 4f), new Vector3(0.2f, 3f, 8f), Palette.StoreWall);
            Shapes.Box("WallR", t, new Vector3(6.1f, 1.5f, 4f), new Vector3(0.2f, 3f, 8f), Palette.StoreWall);
            // Front wall with the customer entrance.
            Shapes.Box("FrontL", t, new Vector3(-3.6f, 1.5f, -0.1f), new Vector3(5.2f, 3f, 0.2f), Palette.StoreWall);
            Shapes.Box("FrontR", t, new Vector3(3.6f, 1.5f, -0.1f), new Vector3(5.2f, 3f, 0.2f), Palette.StoreWall);
            Shapes.Box("FrontLintel", t, new Vector3(0f, 2.6f, -0.1f), new Vector3(2f, 0.8f, 0.2f), Palette.StoreTrim);
            // Back wall with the staff door into the backroom.
            Shapes.Box("BackL", t, new Vector3(-5.1f, 1.5f, 8f), new Vector3(2.2f, 3f, 0.2f), Palette.StoreWall);
            Shapes.Box("BackR", t, new Vector3(2.1f, 1.5f, 8f), new Vector3(8.2f, 3f, 0.2f), Palette.StoreWall);
            Shapes.Box("BackLintel", t, new Vector3(-3f, 2.6f, 8f), new Vector3(2f, 0.8f, 0.2f), Palette.StoreTrim);
            Shapes.Box("Baseboard", t, new Vector3(0f, 0.08f, 7.88f), new Vector3(12f, 0.16f, 0.04f), Palette.StoreTrim, false);
            level.StaffDoor = MakeDoor(t, "StaffDoor", new Vector3(-4f, 0f, 8f), 2f, 2.2f, Palette.Wood, "staff door");
            level.AddLabel(new Vector3(-3f, 2.4f, 7.8f), "STAFF ONLY", 12f);

            // Display shelves: three slots per wall.
            Shapes.Box("ShelfCabinetL", t, new Vector3(-5.7f, 0.5f, 4f), new Vector3(0.6f, 1f, 3.6f), Palette.Wood);
            Shapes.Box("ShelfBackL", t, new Vector3(-5.95f, 1.6f, 4f), new Vector3(0.1f, 1.2f, 3.6f), Palette.StoreTrim);
            Shapes.Box("ShelfCabinetR", t, new Vector3(5.7f, 0.5f, 4f), new Vector3(0.6f, 1f, 3.6f), Palette.Wood);
            Shapes.Box("ShelfBackR", t, new Vector3(5.95f, 1.6f, 4f), new Vector3(0.1f, 1.2f, 3.6f), Palette.StoreTrim);
            float[] zs = { 2.9f, 4f, 5.1f };
            for (int i = 0; i < 3; i++) AddShelfSlot(level, t, i, new Vector3(-5.6f, 1f, zs[i]), 90f);
            for (int i = 0; i < 3; i++) AddShelfSlot(level, t, 3 + i, new Vector3(5.6f, 1f, zs[i]), -90f);

            // Premium display case (upgrade): four extra slots in the middle of the shop.
            level.PremiumCase = Shapes.Empty("PremiumCase", t, new Vector3(0f, 0f, 4.25f));
            Shapes.Box("Plinth", level.PremiumCase.transform, new Vector3(0f, 0.45f, 0f), new Vector3(1.2f, 0.9f, 1f), new Color(0.35f, 0.1f, 0.3f));
            AddShelfSlot(level, level.PremiumCase.transform, 6, new Vector3(-0.3f, 0.9f, -0.22f), 180f);
            AddShelfSlot(level, level.PremiumCase.transform, 7, new Vector3(0.3f, 0.9f, -0.22f), 180f);
            AddShelfSlot(level, level.PremiumCase.transform, 8, new Vector3(-0.3f, 0.9f, 0.25f), 180f);
            AddShelfSlot(level, level.PremiumCase.transform, 9, new Vector3(0.3f, 0.9f, 0.25f), 180f);
            level.AddLabel(new Vector3(0f, 1.5f, 4.25f), "Premium Display Case", 5f);

            // Checkout counter with bell, and a counter-top spot for boxes / returned goods.
            var counterRoot = Shapes.Empty("Counter", t, new Vector3(3.5f, 0f, 6.6f));
            Shapes.Box("CounterBody", counterRoot.transform, new Vector3(0f, 0.5f, 0f), new Vector3(3f, 1f, 0.7f), Palette.Wood);
            var bell = Shapes.Prim(PrimitiveType.Sphere, "Bell", counterRoot.transform, new Vector3(-1.1f, 1.04f, -0.1f), new Vector3(0.12f, 0.08f, 0.12f), new Color(0.9f, 0.75f, 0.3f));
            level.Counter = counterRoot.AddComponent<ServiceCounter>();
            level.Counter.BellPoint = bell.transform;
            var counterSocketGo = Shapes.Empty("CounterSpot", counterRoot.transform, new Vector3(0.9f, 1f, 0f));
            level.CounterSocket = counterSocketGo.AddComponent<SnapSocket>();
            level.CounterSocket.Label = "Counter";
            level.CounterSocket.Radius = 0.35f;
            level.CounterSocket.Accepts = v => v.P != null && v.P.Stage == ProductStage.Packaged;
            level.CounterSocket.RejectReason = v => "Only boxed globes go on the counter.";
            level.CounterSocket.Placed = v => v.P.Location = ProductLocation.At(StationId.Counter);

            // Special order board (planned for Day 4).
            Shapes.Box("OrderBoard", t, new Vector3(1f, 1.8f, 7.87f), new Vector3(1.4f, 0.9f, 0.05f), new Color(0.2f, 0.3f, 0.22f), false);
            level.AddLabel(new Vector3(1f, 1.8f, 7.8f), "SPECIAL ORDERS\n(from Day 4 — planned)", 5f);

            // OPEN / CLOSED sign by the entrance.
            var signRoot = Shapes.Empty("OpenSign", t, new Vector3(2.4f, 1.7f, 0.05f));
            var face = Shapes.Box("SignFace", signRoot.transform, Vector3.zero, new Vector3(1f, 0.45f, 0.05f), Palette.Bad);
            level.Sign = signRoot.AddComponent<OpenSign>();
            level.Sign.Face = face.GetComponent<Renderer>();
            level.AddLabel(new Vector3(2.4f, 2.1f, 0.2f), "OPEN / CLOSED", 6f);

            // Cosy details.
            var tree = Shapes.Empty("XmasTree", t, new Vector3(5f, 0f, 1f)).transform;
            Shapes.Prim(PrimitiveType.Cylinder, "Trunk", tree, new Vector3(0f, 0.25f, 0f), new Vector3(0.15f, 0.25f, 0.15f), Palette.Wood);
            Shapes.Prim(PrimitiveType.Sphere, "Low", tree, new Vector3(0f, 0.8f, 0f), new Vector3(1.1f, 0.8f, 1.1f), new Color(0.1f, 0.4f, 0.2f), false);
            Shapes.Prim(PrimitiveType.Sphere, "Mid", tree, new Vector3(0f, 1.35f, 0f), new Vector3(0.8f, 0.7f, 0.8f), new Color(0.12f, 0.45f, 0.22f), false);
            Shapes.Prim(PrimitiveType.Sphere, "Top", tree, new Vector3(0f, 1.8f, 0f), new Vector3(0.45f, 0.5f, 0.45f), new Color(0.14f, 0.5f, 0.25f), false);
            var star = Shapes.Prim(PrimitiveType.Sphere, "Star", tree, new Vector3(0f, 2.1f, 0f), Vector3.one * 0.15f, Palette.WarmLight, false);
            star.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.WarmLight, 3f);
            Shapes.Box("Rug", t, new Vector3(0f, 0.005f, 2.5f), new Vector3(3f, 0.01f, 2f), Palette.StoreTrim, false);

            AddLight(level, t, new Vector3(-3f, 2.7f, 2.5f), Palette.WarmLight, 1.4f, 7f, LightArea.Store, 0f);
            AddLight(level, t, new Vector3(3f, 2.7f, 2.5f), Palette.WarmLight, 1.4f, 7f, LightArea.Store, 0f);
            AddLight(level, t, new Vector3(-3f, 2.7f, 6f), Palette.WarmLight, 1.4f, 7f, LightArea.Store, 0f);
            AddLight(level, t, new Vector3(3f, 2.7f, 6f), Palette.WarmLight, 1.4f, 7f, LightArea.Store, 0f);

            // Customer navigation points.
            level.CustomerSpawn = Shapes.Empty("CustomerSpawn", t, new Vector3(0f, 0f, -4f)).transform;
            level.CustomerEntrance = Shapes.Empty("CustomerEntrance", t, new Vector3(0f, 0f, 1f)).transform;
            level.CounterSpot = Shapes.Empty("CounterSpot", t, new Vector3(3.5f, 0f, 5.7f)).transform;
            level.BrowsePoints = new[]
            {
                Shapes.Empty("BrowseL1", t, new Vector3(-4.5f, 0f, 3.3f)).transform,
                Shapes.Empty("BrowseL2", t, new Vector3(-4.5f, 0f, 4.8f)).transform,
                Shapes.Empty("BrowseR1", t, new Vector3(4.5f, 0f, 3.3f)).transform,
                Shapes.Empty("BrowseR2", t, new Vector3(4.5f, 0f, 4.8f)).transform,
                Shapes.Empty("BrowseCase", t, new Vector3(0f, 0f, 3f)).transform,
            };
        }

        static void AddShelfSlot(Level level, Transform parent, int index, Vector3 pos, float yaw)
        {
            var go = Shapes.Empty("Slot" + index, parent, pos);
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Shapes.Prim(PrimitiveType.Cylinder, "Doily", go.transform, new Vector3(0f, 0.003f, 0f), new Vector3(0.3f, 0.003f, 0.3f), new Color(0.95f, 0.9f, 0.85f), false);
            var socket = go.AddComponent<SnapSocket>();
            var slot = go.AddComponent<ShelfSlot>();
            slot.Setup(index, socket);
            level.ShelfSlots.Add(slot);
        }

        // ------------------------------------------------------------------ backroom (z 8..16)

        static void BuildBackroom(Level level, Transform parent)
        {
            var t = Shapes.Empty("Backroom", parent, Vector3.zero).transform;
            Shapes.Box("Floor", t, new Vector3(0f, -0.05f, 12f), new Vector3(12.4f, 0.1f, 8f), Palette.BackFloor);
            Shapes.Box("Ceiling", t, new Vector3(0f, 3.05f, 12f), new Vector3(12.4f, 0.1f, 8f), Palette.BackWall);
            Shapes.Box("WallL", t, new Vector3(-6.1f, 1.5f, 12f), new Vector3(0.2f, 3f, 8f), Palette.BackWall);
            Shapes.Box("WallR", t, new Vector3(6.1f, 1.5f, 12f), new Vector3(0.2f, 3f, 8f), Palette.BackWall);
            Shapes.Box("BackL", t, new Vector3(-3.7f, 1.5f, 16f), new Vector3(5f, 3f, 0.2f), Palette.BackWall);
            Shapes.Box("BackR", t, new Vector3(3.7f, 1.5f, 16f), new Vector3(5f, 3f, 0.2f), Palette.BackWall);
            Shapes.Box("BackLintel", t, new Vector3(0f, 2.6f, 16f), new Vector3(2.4f, 0.8f, 0.2f), Palette.BackWall);
            level.BasementDoor = MakeDoor(t, "BasementDoor", new Vector3(-1.2f, 0f, 16f), 2.4f, 2.2f, Palette.Grime, "basement door");
            level.AddLabel(new Vector3(0f, 2.4f, 15.8f), "BASEMENT — STAFF ONLY", 8f);

            // Production line, in order around the room.
            level.Prep = Station<PrepStation>(level, t, "Preparation Cradle", StationId.PrepCradle, new Vector3(-5f, 0f, 10f), 90f);
            Shapes.Box("Cradle", level.Prep.transform, new Vector3(0f, 0.92f, 0f), new Vector3(0.3f, 0.04f, 0.22f), new Color(0.8f, 0.8f, 0.85f), false);
            var injector = Shapes.Prim(PrimitiveType.Cylinder, "Injector", level.Prep.transform, new Vector3(-0.35f, 1f, 0.3f), new Vector3(0.05f, 0.12f, 0.05f), Palette.Serum, false);
            injector.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Serum, 1.5f);
            injector.transform.localRotation = Quaternion.Euler(0f, 0f, 70f);

            level.Assembly = Station<AssemblyStation>(level, t, "Assembly Station", StationId.Assembly, new Vector3(-5f, 0f, 12.8f), 90f);
            Shapes.Prim(PrimitiveType.Cylinder, "SnowDispenser", level.Assembly.transform, new Vector3(0f, 1.7f, 0f), new Vector3(0.22f, 0.25f, 0.22f), Palette.Steel, false);
            for (int i = 0; i < 3; i++)
            {
                Shapes.Box("Bin" + (i + 1), level.Assembly.transform, new Vector3(-0.3f + i * 0.3f, 0.95f, -0.38f), new Vector3(0.22f, 0.1f, 0.14f), i == 0 ? new Color(0.12f, 0.4f, 0.2f) : i == 1 ? new Color(0.85f, 0.75f, 0.55f) : Palette.Snow, false);
            }

            level.Sealer = Station<SealerStation>(level, t, "Sealing Machine", StationId.Sealer, new Vector3(-3.4f, 0f, 15.1f), 180f);
            Shapes.Box("SealerBody", level.Sealer.transform, new Vector3(0f, 1.35f, -0.38f), new Vector3(1f, 0.9f, 0.25f), new Color(0.4f, 0.45f, 0.55f), false);
            var ghost = Shapes.Prim(PrimitiveType.Sphere, "DomeGhost", level.Sealer.Socket.transform, new Vector3(0f, 0.45f, 0f), new Vector3(0.27f, 0.25f, 0.27f), Palette.Glass, false);
            ghost.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
            level.Sealer.DomeGhost = ghost.transform;
            level.Sealer.Glow = Shapes.PointLight("SealGlow", level.Sealer.transform, new Vector3(0f, 1.2f, 0f), Palette.Serum, 0f, 2f);

            level.Inspection = Station<InspectionStation>(level, t, "Inspection Lamp", StationId.Inspection, new Vector3(5f, 0f, 12.8f), -90f);
            Shapes.Box("LampArm", level.Inspection.transform, new Vector3(0f, 1.4f, -0.35f), new Vector3(0.05f, 1f, 0.05f), Palette.Steel, false);
            Shapes.Prim(PrimitiveType.Sphere, "LampHead", level.Inspection.transform, new Vector3(0f, 1.85f, -0.15f), new Vector3(0.25f, 0.12f, 0.25f), Palette.Steel, false);
            level.Inspection.Lamp = Shapes.PointLight("Lamp", level.Inspection.transform, new Vector3(0f, 1.6f, 0f), Color.white, 0.6f, 2.5f);

            level.Packaging = Station<PackagingStation>(level, t, "Packaging Table", StationId.Packaging, new Vector3(5f, 0f, 10f), -90f);
            for (int i = 0; i < 4; i++) Shapes.Box("FlatBox" + i, level.Packaging.transform, new Vector3(0.3f, 0.92f + i * 0.02f, -0.3f), new Vector3(0.35f, 0.02f, 0.35f), Palette.BoxColor, false);

            // Supplies shelf (inventory is abstract; this is set dressing plus a label).
            Shapes.Box("SupplyShelf", t, new Vector3(2.8f, 1f, 8.35f), new Vector3(3f, 2f, 0.4f), Palette.Steel);
            level.AddLabel(new Vector3(2.8f, 2.2f, 8.6f), "Supplies (Tab to order)", 5f);

            AddLight(level, t, new Vector3(-3f, 2.85f, 12f), Palette.ColdLight, 1.1f, 7f, LightArea.Backroom, 0.03f);
            AddLight(level, t, new Vector3(3f, 2.85f, 12f), Palette.ColdLight, 1.1f, 7f, LightArea.Backroom, 0.03f);
            AddLight(level, t, new Vector3(0f, 2.85f, 9.5f), Palette.ColdLight, 0.9f, 6f, LightArea.Backroom, 0.05f);
        }

        static T Station<T>(Level level, Transform parent, string title, StationId id, Vector3 pos, float yaw) where T : StationBase
        {
            var root = Shapes.Empty(title, parent, pos);
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Shapes.Box("Table", root.transform, new Vector3(0f, 0.45f, 0f), new Vector3(1f, 0.9f, 0.9f), Palette.Steel);
            var socketGo = Shapes.Empty("Socket", root.transform, new Vector3(0f, 0.9f, 0f));
            var socket = socketGo.AddComponent<SnapSocket>();
            socket.Radius = 0.45f;
            var status = Shapes.Prim(PrimitiveType.Sphere, "StatusLight", root.transform, new Vector3(0.42f, 0.95f, -0.36f), Vector3.one * 0.08f, Palette.Idle, false);
            var station = root.AddComponent<T>();
            station.Setup(id, title, socket, status.GetComponent<Renderer>());
            return station;
        }

        // ------------------------------------------------------------------ ramp + basement (z 16..32, y -3)

        static void BuildRampAndBasement(Level level, Transform parent)
        {
            var t = Shapes.Empty("Basement", parent, Vector3.zero).transform;

            // Ramp corridor: 6m run, 3m drop.
            float angle = Mathf.Atan2(3f, 6f) * Mathf.Rad2Deg;
            float length = Mathf.Sqrt(36f + 9f);
            var ramp = Shapes.Box("Ramp", t, new Vector3(0f, -1.5f - 0.1f / Mathf.Cos(angle * Mathf.Deg2Rad), 19f), new Vector3(2.4f, 0.2f, length), Palette.Grime);
            ramp.transform.localRotation = Quaternion.Euler(angle, 0f, 0f);
            Shapes.Box("RampWallL", t, new Vector3(-1.3f, 0f, 19f), new Vector3(0.2f, 6f, 6f), Palette.BasementWall);
            Shapes.Box("RampWallR", t, new Vector3(1.3f, 0f, 19f), new Vector3(0.2f, 6f, 6f), Palette.BasementWall);
            Shapes.Box("RampCeiling", t, new Vector3(0f, 3.05f, 19f), new Vector3(2.8f, 0.1f, 6f), Palette.BasementWall);
            AddLight(level, t, new Vector3(0f, 1.2f, 17.5f), Palette.SickLight, 0.6f, 5f, LightArea.Basement, 0.1f);

            // Basement shell.
            Shapes.Box("Floor", t, new Vector3(0f, -3.05f, 27f), new Vector3(14.4f, 0.1f, 10f), Palette.BasementFloor);
            Shapes.Box("Ceiling", t, new Vector3(0f, -0.15f, 27f), new Vector3(14.4f, 0.1f, 10f), Palette.BasementWall);
            Shapes.Box("WallL", t, new Vector3(-7.1f, -1.6f, 27f), new Vector3(0.2f, 2.8f, 10f), Palette.BasementWall);
            Shapes.Box("WallR", t, new Vector3(7.1f, -1.6f, 27f), new Vector3(0.2f, 2.8f, 10f), Palette.BasementWall);
            Shapes.Box("WallBack", t, new Vector3(0f, -1.6f, 32.1f), new Vector3(14.4f, 2.8f, 0.2f), Palette.BasementWall);
            Shapes.Box("WallFrontL", t, new Vector3(-4.2f, 0f, 22f), new Vector3(6f, 6f, 0.2f), Palette.BasementWall);
            Shapes.Box("WallFrontR", t, new Vector3(4.2f, 0f, 22f), new Vector3(6f, 6f, 0.2f), Palette.BasementWall);
            Shapes.Box("WallFrontLintel", t, new Vector3(0f, 1.1f, 22f), new Vector3(2.4f, 3.8f, 0.2f), Palette.BasementWall);
            Shapes.Box("Stain", t, new Vector3(-1.5f, -2.995f, 25f), new Vector3(2f, 0.01f, 1.4f), Palette.Grime, false);

            // Two low holding pens: the player leans over to grab; the gates matter for escapes.
            level.Pens[0] = MakePen(t, 0, -1f);
            level.Pens[1] = MakePen(t, 1, 1f);
            level.AddLabel(new Vector3(-4.7f, -2f, 27f), "Holding A", 6f);
            level.AddLabel(new Vector3(4.7f, -2f, 27f), "Holding B", 6f);

            // Delivery hatch: mysterious shipments slide down the chute into this crate.
            Shapes.Box("CrateBottom", t, new Vector3(0f, -2.95f, 31.3f), new Vector3(1.2f, 0.1f, 0.8f), Palette.Wood);
            Shapes.Box("CrateFront", t, new Vector3(0f, -2.8f, 30.9f), new Vector3(1.2f, 0.3f, 0.05f), Palette.Wood);
            Shapes.Box("CrateL", t, new Vector3(-0.6f, -2.8f, 31.3f), new Vector3(0.05f, 0.3f, 0.8f), Palette.Wood);
            Shapes.Box("CrateR", t, new Vector3(0.6f, -2.8f, 31.3f), new Vector3(0.05f, 0.3f, 0.8f), Palette.Wood);
            Shapes.Box("Chute", t, new Vector3(0f, -1.3f, 31.95f), new Vector3(0.8f, 1.4f, 0.1f), new Color(0.15f, 0.15f, 0.15f), false);
            var hatchGo = Shapes.Empty("HatchSocket", t, new Vector3(0f, -2.9f, 31.3f));
            level.Hatch = hatchGo.AddComponent<SnapSocket>();
            level.Hatch.Label = "Delivery crate";
            level.Hatch.AllowMultiple = true;
            level.Hatch.RoamHalfExtents = new Vector2(0.45f, 0.25f);
            level.Hatch.Accepts = v => false;
            level.Hatch.RejectReason = v => "Deliveries only come in, never go out.";
            level.AddLabel(new Vector3(0f, -1.9f, 31.3f), "Delivery hatch", 6f);

            // Electrical: breaker panel and some humming boxes.
            var breakerRoot = Shapes.Empty("Breaker", t, new Vector3(-6.95f, -1.6f, 24f));
            Shapes.Box("Panel", breakerRoot.transform, Vector3.zero, new Vector3(0.12f, 0.7f, 0.5f), Palette.Steel);
            var lamp = Shapes.Prim(PrimitiveType.Sphere, "BreakerLamp", breakerRoot.transform, new Vector3(0.08f, 0.25f, 0f), Vector3.one * 0.07f, Palette.Ok, false);
            level.Breaker = breakerRoot.AddComponent<Breaker>();
            level.Breaker.Lamp = lamp.GetComponent<Renderer>();
            level.AddLabel(new Vector3(-6.7f, -1f, 24f), "Breaker", 5f);
            Shapes.Box("Transformer", t, new Vector3(-6.5f, -2.5f, 25.5f), new Vector3(0.8f, 1f, 0.8f), new Color(0.3f, 0.32f, 0.3f));

            // Security desk (cameras are a planned upgrade).
            Shapes.Box("SecurityDesk", t, new Vector3(5.5f, -2.6f, 23.3f), new Vector3(1.8f, 0.8f, 0.8f), Palette.Wood);
            Shapes.Box("DeadMonitor", t, new Vector3(5.5f, -1.95f, 23.5f), new Vector3(0.6f, 0.45f, 0.1f), Color.black, false);
            level.AddLabel(new Vector3(5.5f, -1.4f, 23.3f), "Security desk — cameras (planned)", 5f);

            level.DarkCorner = Shapes.Empty("DarkCorner", t, new Vector3(-6.6f, -2.2f, 22.4f)).transform;

            AddLight(level, t, new Vector3(-4.6f, -0.5f, 29.4f), Palette.SickLight, 0.9f, 5f, LightArea.Basement, 0.12f);
            AddLight(level, t, new Vector3(4.6f, -0.5f, 29.4f), Palette.SickLight, 0.9f, 5f, LightArea.Basement, 0.12f);
            AddLight(level, t, new Vector3(0f, -0.5f, 24.5f), Palette.SickLight, 0.8f, 5f, LightArea.Basement, 0.2f);
            AddLight(level, t, new Vector3(0f, -0.5f, 28f), Palette.SickLight, 0.7f, 4f, LightArea.Basement, 0.45f);
        }

        static HoldingPen MakePen(Transform t, int room, float side)
        {
            float cx = 4.7f * side;
            var root = Shapes.Empty("HoldingPen" + room, t, new Vector3(cx, -3f, 29.45f));
            var r = root.transform;
            // Low walls (60cm): outer side, back is the basement wall, inner side, and front with a gate gap.
            Shapes.Box("Inner", r, new Vector3(-2.2f * side, 0.3f, 0f), new Vector3(0.08f, 0.6f, 4.9f), Palette.Grime);
            Shapes.Box("FrontA", r, new Vector3(-1.3f, 0.3f, -2.45f), new Vector3(1.8f, 0.6f, 0.08f), Palette.Grime);
            Shapes.Box("FrontB", r, new Vector3(1.3f, 0.3f, -2.45f), new Vector3(1.8f, 0.6f, 0.08f), Palette.Grime);
            var gate = MakeDoor(r, "Gate", new Vector3(-0.4f, 0f, -2.45f), 0.8f, 0.6f, new Color(0.35f, 0.33f, 0.3f), "pen gate");
            gate.OpenAngle = 100f;
            var socketGo = Shapes.Empty("PenSocket", r, Vector3.zero);
            var socket = socketGo.AddComponent<SnapSocket>();
            socket.RoamHalfExtents = new Vector2(1.9f, 2.1f);
            socket.Radius = 2.5f;
            var pen = root.AddComponent<HoldingPen>();
            pen.Setup(room, socket, gate);
            pen.ScratchPoint = gate.transform;
            return pen;
        }

        // ------------------------------------------------------------------ helpers

        static Door MakeDoor(Transform parent, string name, Vector3 hingePos, float width, float height, Color color, string label)
        {
            var hinge = Shapes.Empty(name, parent, hingePos);
            Shapes.Box("Panel", hinge.transform, new Vector3(width * 0.5f, height * 0.5f, 0f), new Vector3(width, height, 0.08f), color);
            var door = hinge.AddComponent<Door>();
            door.Label = label;
            return door;
        }

        static void AddLight(Level level, Transform parent, Vector3 pos, Color color, float intensity, float range, LightArea area, float flicker)
        {
            var light = Shapes.PointLight("Light", parent, pos, color, intensity, range);
            var f = light.gameObject.AddComponent<FlickerLight>();
            f.Area = area;
            f.FlickerAmount = flicker;
            level.Lights.Add(f);
            Shapes.Prim(PrimitiveType.Cube, "Fixture", light.transform, new Vector3(0f, 0.1f, 0f), new Vector3(0.4f, 0.05f, 0.15f), color, false)
                .GetComponent<Renderer>().sharedMaterial = Shapes.Mat(color, 1.5f);
        }
    }
}
