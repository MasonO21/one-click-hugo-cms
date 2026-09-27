using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Builds the whole building at runtime, reconstructed from the three concept paintings in
    /// docs/concept/ (storefront.webp, backroom.webp, basement.webp):
    ///
    ///  * Storefront — warm gift shop: tall arched window onto the snowy town, glass front door,
    ///    lit teal wall shelving full of globes, round tiered centre display with gift boxes,
    ///    brass chandelier, blue rug, hallway at the back to a STAFF ONLY door.
    ///  * Backroom — brass-lamp workshop: long central worktable (assembly), crate of supplies,
    ///    snowy window, "SMALL WORLDS BRIGHTER PEOPLE", freight lift, shipments clipboard.
    ///  * Basement — tall teal vault: glass cabinet wall A1–E5 with a rolling ladder, pillar sign
    ///    "SMALL LIVES BRIGHTER WORLDS", freight lift (deliveries), stairs up TO PRODUCTION,
    ///    miniature furniture table, clothing trays, labelled crates, lanterns, pipes.
    ///
    /// Pure set-dressing goes under a "Static" root that is static-batched at the end; anything
    /// interactive (doors, stations, sockets, signs that change) stays outside it.
    /// </summary>
    public static class LevelBuilder
    {
        static Transform _static;
        static Level _level;
        static int _decorSeed = 101;

        static readonly Color WallCream = Palette.Cream;
        static readonly Color Warm = Palette.WarmLight;

        public static Level Build(Transform parent)
        {
            var root = new GameObject("Level");
            root.transform.SetParent(parent, false);
            _level = root.AddComponent<Level>();
            var t = root.transform;
            _static = Shapes.Empty("Static", t, Vector3.zero).transform;

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.2f, 0.2f, 0.23f);
            QualitySettings.pixelLightCount = Mathf.Max(QualitySettings.pixelLightCount, 8);

            BuildStore(t);
            BuildBackroom(t);
            BuildBasement(t);

            _level.StoreCenter = new Vector3(0f, 1.5f, 5f);
            _level.BasementCenter = new Vector3(1f, -2f, 31f);
            _level.PlayerSpawn = Shapes.Empty("PlayerSpawn", t, new Vector3(3.2f, 0.05f, 8.4f)).transform;
            _level.PlayerSpawnYaw = 222f;

            StaticBatchingUtility.Combine(_static.gameObject);
            var level = _level;
            _static = null;
            _level = null;
            return level;
        }

        // =====================================================================================
        // STOREFRONT  (x -7..7, z 0..10, ceiling 3.8; hallway x 2.5..5, z 10..13)
        // =====================================================================================

        static void BuildStore(Transform t)
        {
            // Shell.
            Glossy(B("StoreFloor", new Vector3(0f, -0.05f, 5f), new Vector3(14.4f, 0.1f, 10.2f), Palette.WoodWarm), 0.45f);
            for (int i = 0; i < 23; i++) B("Plank", new Vector3(-6.6f + i * 0.6f, 0.001f, 5f), new Vector3(0.015f, 0.002f, 10f), Palette.WoodWarm * 0.75f, false);
            B("StoreCeiling", new Vector3(0f, 3.85f, 5f), new Vector3(14.4f, 0.1f, 10.2f), WallCream);
            B("WallL", new Vector3(-7.1f, 1.9f, 5f), new Vector3(0.2f, 3.8f, 10.2f), WallCream);
            B("WallR", new Vector3(7.1f, 1.9f, 5f), new Vector3(0.2f, 3.8f, 10.2f), WallCream);
            Wainscot(new Vector3(-6.98f, 0.5f, 5f), new Vector3(0.05f, 1f, 10f));
            // Front wall: arched window (x -6.4..-3.8) and glass door (x -2.9..-1.3).
            B("FrontA", new Vector3(-6.8f, 1.9f, -0.1f), new Vector3(0.8f, 3.8f, 0.2f), WallCream);
            B("FrontUnderWindow", new Vector3(-5.1f, 0.175f, -0.1f), new Vector3(2.6f, 0.35f, 0.2f), Palette.Teal);
            B("FrontOverWindow", new Vector3(-5.1f, 3.7f, -0.1f), new Vector3(2.6f, 0.2f, 0.2f), WallCream);
            B("FrontPier", new Vector3(-3.35f, 1.9f, -0.1f), new Vector3(0.9f, 3.8f, 0.2f), WallCream);
            B("FrontOverDoor", new Vector3(-2.1f, 3.2f, -0.1f), new Vector3(1.6f, 1.2f, 0.2f), WallCream);
            B("FrontF", new Vector3(2.95f, 1.9f, -0.1f), new Vector3(8.5f, 3.8f, 0.2f), WallCream);
            Wainscot(new Vector3(2.95f, 0.5f, 0.02f), new Vector3(8.4f, 1f, 0.05f));
            // Back wall with the opening to the staff hallway (x 2.5..5).
            B("BackL", new Vector3(-2.35f, 1.9f, 10.1f), new Vector3(9.7f, 3.8f, 0.2f), WallCream);
            B("BackR", new Vector3(6.1f, 1.9f, 10.1f), new Vector3(2.2f, 3.8f, 0.2f), WallCream);
            B("BackOverHall", new Vector3(3.75f, 3.3f, 10.1f), new Vector3(2.5f, 1f, 0.2f), WallCream);
            Wainscot(new Vector3(-2.35f, 0.5f, 9.98f), new Vector3(9.6f, 1f, 0.05f));
            // Crown moulding.
            B("CrownL", new Vector3(-6.95f, 3.72f, 5f), new Vector3(0.12f, 0.14f, 10f), Palette.Teal, false);
            B("CrownR", new Vector3(6.95f, 3.72f, 5f), new Vector3(0.12f, 0.14f, 10f), Palette.Teal, false);
            B("CrownB", new Vector3(0f, 3.72f, 9.95f), new Vector3(14f, 0.14f, 0.12f), Palette.Teal, false);

            // Window onto the snowy town (texture cropped from the concept painting).
            Shapes.Sign("WindowView", _static, new Vector3(-5.1f, 1.975f, -0.02f), Vector3.forward, 2.6f, 3.25f, "window_store", true);
            B("WindowSill", new Vector3(-5.1f, 0.37f, 0.14f), new Vector3(2.9f, 0.08f, 0.4f), Palette.Teal);
            B("JambL", new Vector3(-6.45f, 1.95f, 0.02f), new Vector3(0.1f, 3.3f, 0.1f), Palette.Teal, false);
            B("JambR", new Vector3(-3.75f, 1.95f, 0.02f), new Vector3(0.1f, 3.3f, 0.1f), Palette.Teal, false);
            DecorGlobe(_static, new Vector3(-5.85f, 0.41f, 0.16f), 0.75f);
            DecorGlobe(_static, new Vector3(-4.3f, 0.41f, 0.16f), 0.6f);
            Plant(new Vector3(-4.9f, 0.41f, 0.2f), 0.35f);
            AddLight("WindowDaylight", new Vector3(-5.1f, 2.6f, 0.9f), new Color(0.75f, 0.85f, 1f), 0.7f, 5f, LightArea.Store, 0f);

            // Window Display upgrade: a stepped stand of glowing globes facing the street (hidden until bought).
            _level.WindowDisplay = Shapes.Empty("WindowDisplay", t, Vector3.zero);
            var wd = _level.WindowDisplay.transform;
            Shapes.Box("WindowStandLow", wd, new Vector3(-5.1f, 0.2f, 0.75f), new Vector3(1.8f, 0.4f, 0.45f), Palette.Teal);
            Shapes.Box("WindowStandHigh", wd, new Vector3(-5.1f, 0.35f, 0.95f), new Vector3(1.2f, 0.7f, 0.25f), Palette.TealDark);
            Metal(Shapes.Box("WindowStandTrim", wd, new Vector3(-5.1f, 0.41f, 0.53f), new Vector3(1.82f, 0.02f, 0.02f), Palette.Brass, false));
            for (int i = 0; i < 3; i++) DecorGlobe(wd, new Vector3(-5.7f + i * 0.6f, 0.4f, 0.7f), 0.8f, 0f);
            for (int i = 0; i < 2; i++) DecorGlobe(wd, new Vector3(-5.4f + i * 0.6f, 0.7f, 0.95f), 0.9f, 0f);
            for (int i = 0; i < 9; i++)
                Emissive(Shapes.Prim(PrimitiveType.Sphere, "FairyLight", wd, new Vector3(-6.3f + i * 0.3f, 3.3f - Mathf.Sin(i / 8f * Mathf.PI) * 0.25f, 0.12f), Vector3.one * 0.05f, Palette.WarmLight, false), Palette.WarmLight, 2f);
            _level.WindowDisplay.SetActive(false);

            // Glass front door (opens when the shop opens), street beyond, shop name outside.
            _level.FrontDoor = MakeDoor(t, "FrontDoor", new Vector3(-2.9f, 0f, -0.02f), 0f, 1.6f, 2.6f, Palette.Teal, "front door", true);
            Shapes.Sign("StreetBackdrop", _static, new Vector3(-2.1f, 2.6f, -4.6f), Vector3.forward, 5.2f, 7.2f, "street_backdrop", true);
            B("Sidewalk", new Vector3(0f, -0.06f, -3f), new Vector3(24f, 0.1f, 6f), new Color(0.9f, 0.93f, 0.97f));
            Shapes.Sign("ShopName", _static, new Vector3(-2.1f, 3.2f, -0.21f), Vector3.back, 2.4f, 0.6f, "sign_shop_name");
            AddLight("StreetLamp", new Vector3(-2.1f, 3f, -2f), new Color(0.75f, 0.82f, 1f), 0.7f, 5f, LightArea.Store, 0f);
            B("EntranceMat", new Vector3(-2.1f, 0.005f, 0.8f), new Vector3(1.6f, 0.01f, 1f), Palette.TealDark, false);

            // OPEN / CLOSED sign on the pier beside the door.
            var signRoot = Shapes.Empty("OpenSign", t, new Vector3(-3.35f, 1.7f, 0.03f));
            var face = Shapes.Box("SignFace", signRoot.transform, Vector3.zero, new Vector3(0.5f, 0.32f, 0.03f), Palette.Bad);
            _level.Sign = signRoot.AddComponent<OpenSign>();
            var faceQuad = Shapes.Sign("SignText", signRoot.transform, new Vector3(0f, 0f, 0.02f), Vector3.forward, 0.48f, 0.3f, "sign_closed");
            _level.Sign.Face = faceQuad.GetComponent<Renderer>();
            Shapes.Rod("SignChain", signRoot.transform, new Vector3(-0.2f, 0.16f, 0f), new Vector3(0f, 0.32f, 0f), 0.005f, Palette.Brass);
            Shapes.Rod("SignChain", signRoot.transform, new Vector3(0.2f, 0.16f, 0f), new Vector3(0f, 0.32f, 0f), 0.005f, Palette.Brass);

            // Wall shelving: right wall slots 3..5, left wall slots 0..2 (plus lots of decor stock).
            WallShelving(t, 1f, 6.7f, -90f, new[] { 2.4f, 5.2f, 8.0f }, 2.8f, 3);
            WallShelving(t, -1f, -6.7f, 90f, new[] { 2.0f, 4.0f, 6.0f }, 2.0f, 0);
            HandGlobe(new Vector3(6.7f, 0.93f, 1.45f), -90f);

            BuildRoundDisplay(t);
            BuildCounter(t);

            // Side table with lamp, plants, pictures, banner.
            B("LampTable", new Vector3(0.8f, 0.375f, 9.55f), new Vector3(0.9f, 0.75f, 0.5f), Palette.WoodWarm);
            TableLamp(new Vector3(0.8f, 0.75f, 9.55f), true);
            Plant(new Vector3(-6.5f, 0f, 8.9f), 1.3f);
            Plant(new Vector3(6.4f, 0f, 0.6f), 1.1f);
            Plant(new Vector3(2.1f, 0f, 9.6f), 0.9f);
            Picture(new Vector3(0.8f, 2.4f, 9.99f), Vector3.back, 0.7f, 0.7f, "painting_town");
            // Special orders board (day 4+): look at it and press E to pin an order.
            var boardGo = Shapes.Empty("OrderBoard", t, new Vector3(-1.6f, 1.85f, 9.96f));
            Shapes.Box("BoardBack", boardGo.transform, new Vector3(0f, 0f, 0.01f), new Vector3(1.4f, 1.1f, 0.04f), Palette.TealDark);
            Shapes.Sign("BoardFace", boardGo.transform, new Vector3(0f, 0f, -0.015f), Vector3.back, 1.3f, 1.02f, "order_board");
            _level.OrderBoard = boardGo.AddComponent<OrderBoard>();
            Picture(new Vector3(6.05f, 2.2f, 9.99f), Vector3.back, 0.6f, 0.6f, "painting_town");
            Banner(new Vector3(-4f, 2.5f, 9.98f), Vector3.back, 0.55f, 1.1f);

            // Chandelier over the display.
            Shapes.Rod("ChandelierChain", _static, new Vector3(0f, 3.8f, 5f), new Vector3(0f, 3.2f, 5f), 0.015f, Palette.Brass);
            var ring = Shapes.Prim(PrimitiveType.Cylinder, "ChandelierRing", _static, new Vector3(0f, 3.12f, 5f), new Vector3(1.2f, 0.025f, 1.2f), Palette.Brass, false);
            Metal(ring);
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI / 4f;
                var p = new Vector3(Mathf.Sin(a) * 0.55f, 3.2f, 5f + Mathf.Cos(a) * 0.55f);
                Shapes.Prim(PrimitiveType.Cylinder, "Candle", _static, p - Vector3.up * 0.05f, new Vector3(0.04f, 0.05f, 0.04f), WallCream, false);
                Emissive(Shapes.Prim(PrimitiveType.Sphere, "Flame", _static, p + Vector3.up * 0.03f, Vector3.one * 0.06f, Warm, false), Warm, 3f);
            }
            AddLight("Chandelier", new Vector3(0f, 2.95f, 5f), Warm, 1.6f, 9f, LightArea.Store, 0f);
            AddLight("ShelfFillR", new Vector3(5.6f, 3.3f, 5.2f), Warm, 0.9f, 6f, LightArea.Store, 0f);
            AddLight("ShelfFillL", new Vector3(-5.6f, 3.3f, 4f), Warm, 0.9f, 6f, LightArea.Store, 0f);
            Pendant(new Vector3(-4f, 3.8f, 8.2f), 0.9f, true, 0.8f, 5f, LightArea.Store, 0f);

            // Staff hallway (x 2.5..5, z 10..13) to the STAFF ONLY door.
            B("HallWallL", new Vector3(2.4f, 1.4f, 11.5f), new Vector3(0.2f, 2.8f, 3f), WallCream);
            B("HallWallR", new Vector3(5.1f, 1.4f, 11.5f), new Vector3(0.2f, 2.8f, 3f), WallCream);
            B("HallCeiling", new Vector3(3.75f, 2.85f, 11.5f), new Vector3(2.9f, 0.1f, 3f), WallCream);
            // Solid floor bridging the storefront floor (ends z 10.1) and the backroom floor (starts z 13).
            Glossy(B("HallFloor", new Vector3(3.75f, -0.05f, 11.55f), new Vector3(2.9f, 0.1f, 3.3f), Palette.WoodWarm), 0.45f);
            B("HallRunner", new Vector3(3.75f, 0.005f, 11.5f), new Vector3(1.4f, 0.01f, 2.8f), Palette.RugBlue, false);
            Pendant(new Vector3(3.75f, 2.8f, 11.4f), 0.5f, true, 0.6f, 4f, LightArea.Store, 0f);
            _level.StaffDoor = MakeDoor(t, "StaffDoor", new Vector3(2.75f, 0f, 13f), 0f, 2f, 2.3f, Palette.TealDark, "staff door", false);
            Shapes.Sign("StaffOnly", _static, new Vector3(3.75f, 2.5f, 12.88f), Vector3.back, 1f, 0.25f, "sign_staff_only");

            // Customer navigation.
            _level.CustomerSpawn = Shapes.Empty("CustomerSpawn", t, new Vector3(-2.1f, 0f, -2.6f)).transform;
            _level.CustomerEntrance = Shapes.Empty("CustomerEntrance", t, new Vector3(-2.1f, 0f, 1.4f)).transform;
            _level.CounterSpot = Shapes.Empty("CounterSpot", t, new Vector3(-4f, 0f, 7.4f)).transform;
            _level.PremiumBrowse = Shapes.Empty("BrowsePremium", t, new Vector3(0f, 0f, 2.6f)).transform;
            _level.BrowsePoints = new[]
            {
                Shapes.Empty("BrowseR1", t, new Vector3(5.3f, 0f, 2.4f)).transform,
                Shapes.Empty("BrowseR2", t, new Vector3(5.3f, 0f, 5.2f)).transform,
                Shapes.Empty("BrowseR3", t, new Vector3(5.3f, 0f, 8.0f)).transform,
                Shapes.Empty("BrowseL1", t, new Vector3(-5.3f, 0f, 2.0f)).transform,
                Shapes.Empty("BrowseL2", t, new Vector3(-5.3f, 0f, 4.0f)).transform,
                Shapes.Empty("BrowseL3", t, new Vector3(-5.3f, 0f, 6.0f)).transform,
            };
        }

        /// <summary>Lit teal shelving with three playable display slots on the counter-height ledge.</summary>
        static void WallShelving(Transform t, float side, float slotX, float slotYaw, float[] bayCenters, float bayWidth, int firstSlot)
        {
            float x = 6.75f * side;
            float zMin = bayCenters[0] - bayWidth * 0.5f, zMax = bayCenters[bayCenters.Length - 1] + bayWidth * 0.5f;
            float zc = (zMin + zMax) * 0.5f, len = zMax - zMin;
            B("ShelfBase", new Vector3(x, 0.45f, zc), new Vector3(0.5f, 0.9f, len), Palette.Teal);
            Metal(B("ShelfBrassLip", new Vector3(x, 0.915f, zc), new Vector3(0.52f, 0.03f, len), Palette.Brass, false));
            Emissive(B("ShelfBack", new Vector3(6.97f * side, 2.35f, zc), new Vector3(0.05f, 2.9f, len), new Color(0.95f, 0.88f, 0.74f)), new Color(1f, 0.85f, 0.6f), 0.25f);
            foreach (float y in new[] { 1.55f, 2.15f, 2.75f, 3.35f })
            {
                B("ShelfBoard", new Vector3(x, y, zc), new Vector3(0.5f, 0.04f, len), Palette.Teal);
                Emissive(B("ShelfLed", new Vector3(x - 0.2f * side, y - 0.03f, zc), new Vector3(0.04f, 0.012f, len - 0.1f), Warm, false), Warm, 2f);
            }
            for (int i = 0; i <= bayCenters.Length; i++)
            {
                float z = zMin + i * bayWidth;
                B("ShelfDivider", new Vector3(x, 2.35f, z), new Vector3(0.5f, 2.9f, 0.06f), Palette.Teal);
            }
            for (int i = 0; i < bayCenters.Length; i++)
            {
                float z = bayCenters[i];
                AddShelfSlot(t, firstSlot + i, new Vector3(slotX, 0.93f, z), slotYaw);
                // Decor stock around each playable slot, on the ledge and the lit boards above.
                if (bayWidth > 2.5f) DecorGlobe(_static, new Vector3(slotX, 0.93f, z + 0.95f), 0.85f, slotYaw);
                else DecorGlobe(_static, new Vector3(slotX, 0.93f, z + 0.65f), 0.7f, slotYaw);
                float off = bayWidth > 2.5f ? 0.8f : 0.5f;
                DecorGlobe(_static, new Vector3(slotX + 0.05f * side, 1.57f, z - off), 0.95f, slotYaw);
                DecorGlobe(_static, new Vector3(slotX + 0.05f * side, 1.57f, z + off), 0.8f, slotYaw);
                DecorGlobe(_static, new Vector3(slotX + 0.05f * side, 2.17f, z), 1f, slotYaw);
                GiftBox(new Vector3(slotX + 0.05f * side, 2.77f, z - off * 0.7f), 0.22f, i % 2 == 0 ? Palette.Teal : WallCream);
                DecorGlobe(_static, new Vector3(slotX + 0.05f * side, 2.77f, z + off * 0.6f), 0.7f, slotYaw);
                if (i % 2 == 0) Plant(new Vector3(slotX + 0.05f * side, 3.37f, z), 0.3f);
            }
        }

        static void AddShelfSlot(Transform parent, int index, Vector3 pos, float yaw)
        {
            var go = Shapes.Empty("Slot" + index, parent, pos);
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Shapes.Prim(PrimitiveType.Cylinder, "Doily", go.transform, new Vector3(0f, 0.003f, 0f), new Vector3(0.36f, 0.003f, 0.36f), new Color(0.95f, 0.9f, 0.85f), false);
            var socket = go.AddComponent<SnapSocket>();
            var slot = go.AddComponent<ShelfSlot>();
            slot.Setup(index, socket);
            _level.ShelfSlots.Add(slot);
        }

        static void BuildRoundDisplay(Transform t)
        {
            var c = Level.DisplayCenter;
            // Three teal tiers with brass tops (the centrepiece of the storefront painting).
            Shapes.Prim(PrimitiveType.Cylinder, "Tier1", _static, c + new Vector3(0f, 0.43f, 0f), new Vector3(3f, 0.43f, 3f), Palette.Teal);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Tier1Top", _static, c + new Vector3(0f, 0.88f, 0f), new Vector3(3.1f, 0.02f, 3.1f), Palette.Brass));
            for (int i = 0; i < 12; i++)
            {
                float a = i * Mathf.PI / 6f;
                Metal(Shapes.Prim(PrimitiveType.Sphere, "DrawerKnob", _static, c + new Vector3(Mathf.Sin(a) * 1.51f, 0.62f, Mathf.Cos(a) * 1.51f), Vector3.one * 0.04f, Palette.Brass, false));
            }
            Shapes.Prim(PrimitiveType.Cylinder, "Tier2", _static, c + new Vector3(0f, 1.06f, 0f), new Vector3(1.9f, 0.17f, 1.9f), Palette.TealDark);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Tier2Top", _static, c + new Vector3(0f, 1.24f, 0f), new Vector3(1.96f, 0.015f, 1.96f), Palette.Brass));
            Shapes.Prim(PrimitiveType.Cylinder, "Tier3", _static, c + new Vector3(0f, 1.39f, 0f), new Vector3(1f, 0.14f, 1f), Palette.Teal);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Tier3Top", _static, c + new Vector3(0f, 1.54f, 0f), new Vector3(1.04f, 0.012f, 1.04f), Palette.Brass));

            DecorGlobe(_static, c + new Vector3(0f, 1.55f, 0f), 1.45f, 180f);
            for (int i = 0; i < 5; i++)
            {
                float a = (i * 72f + 36f) * Mathf.Deg2Rad;
                DecorGlobe(_static, c + new Vector3(Mathf.Sin(a) * 0.72f, 1.25f, -Mathf.Cos(a) * 0.72f), 0.75f, 180f - i * 72f - 36f);
            }
            // Back half of the lower tier: decor. Front half: the premium upgrade slots.
            for (int i = 0; i < 4; i++)
            {
                float deg = 110f + i * 47f;
                float a = deg * Mathf.Deg2Rad;
                DecorGlobe(_static, c + new Vector3(Mathf.Sin(a) * 1.25f, 0.9f, -Mathf.Cos(a) * 1.25f), 0.9f, 180f - deg);
            }
            _level.PremiumCase = Shapes.Empty("PremiumSlots", t, Vector3.zero);
            _level.PremiumDecor = Shapes.Empty("PremiumDecor", t, Vector3.zero);
            float[] premiumAngles = { -60f, -20f, 20f, 60f };
            for (int i = 0; i < premiumAngles.Length; i++)
            {
                float a = premiumAngles[i] * Mathf.Deg2Rad;
                var pos = c + new Vector3(Mathf.Sin(a) * 1.25f, 0.9f, -Mathf.Cos(a) * 1.25f);
                AddShelfSlot(_level.PremiumCase.transform, GameBalance.BaseShelfCapacity + i, pos, 180f - premiumAngles[i]);
                DecorGlobe(_level.PremiumDecor.transform, pos, 0.9f, 180f - premiumAngles[i]);
            }
            Shapes.Sign("PremiumPlaque", _level.PremiumCase.transform, c + new Vector3(0f, 1.07f, -0.965f), Vector3.back, 0.6f, 0.22f, "sign_premium");

            // Gift boxes stacked around the base.
            Color[] boxCols = { Palette.Teal, WallCream, Palette.Navy, new Color(0.35f, 0.5f, 0.55f) };
            for (int i = 0; i < 9; i++)
            {
                float a = (i * 40f + 15f) * Mathf.Deg2Rad;
                float s = 0.22f + (i % 3) * 0.06f;
                GiftBox(c + new Vector3(Mathf.Sin(a) * 1.75f, 0f, Mathf.Cos(a) * 1.75f), s, boxCols[i % boxCols.Length]);
            }
            // Rug.
            B("RugBorder", c + new Vector3(0f, 0.006f, 0f), new Vector3(5.4f, 0.012f, 4.4f), new Color(0.62f, 0.52f, 0.36f), false);
            B("Rug", c + new Vector3(0f, 0.01f, 0f), new Vector3(5f, 0.012f, 4f), Palette.RugBlue, false);
            B("RugCentre", c + new Vector3(0f, 0.014f, 0f), new Vector3(3.8f, 0.012f, 2.8f), Palette.RugBlue * 0.8f, false);
        }

        static void BuildCounter(Transform t)
        {
            var counterRoot = Shapes.Empty("Counter", t, new Vector3(-4f, 0f, 8.4f));
            var r = counterRoot.transform;
            Shapes.Box("CounterBody", r, new Vector3(0f, 0.5f, 0f), new Vector3(2.8f, 1f, 0.7f), Palette.Teal);
            Metal(Shapes.Box("CounterTop", r, new Vector3(0f, 1.02f, 0f), new Vector3(2.9f, 0.04f, 0.8f), Palette.Brass));
            Metal(Shapes.Box("Register", r, new Vector3(-1f, 1.17f, 0.1f), new Vector3(0.45f, 0.26f, 0.35f), Palette.Brass));
            var bell = Shapes.Prim(PrimitiveType.Sphere, "Bell", r, new Vector3(0.9f, 1.07f, -0.15f), new Vector3(0.12f, 0.08f, 0.12f), Palette.Brass);
            Metal(bell);
            _level.Counter = counterRoot.AddComponent<ServiceCounter>();
            _level.Counter.BellPoint = bell.transform;
            var socketGo = Shapes.Empty("CounterSpot", r, new Vector3(0.2f, 1.04f, 0f));
            var socket = socketGo.AddComponent<SnapSocket>();
            socket.Label = "Counter";
            socket.Radius = 0.4f;
            socket.Accepts = v => v.P != null && v.P.Stage == ProductStage.Packaged;
            socket.RejectReason = v => "Only boxed globes go on the counter.";
            socket.Placed = v =>
            {
                v.P.Location = ProductLocation.At(StationId.Counter);
                // Order pickup: a boxed globe that matches the pinned special order is collected and paid for.
                var root = GameRoot.I;
                var order = root.Session.Orders.PinnedOrder;
                if (order == null) return;
                string reason;
                if (!OrderService.Matches(order, v.P, out reason))
                {
                    root.Toast("Not right for order #" + order.Id + ": " + reason, true);
                    return;
                }
                ActionResult result;
                root.Session.Orders.Fulfil(order, v.P, out result);
                root.Toast(result.Message, !result.Success);
                if (!result.Success) return;
                root.Audio.Play(Sfx.Chime, v.transform.position);
                root.OnProductSold(v.P);
            };
            _level.AddLabel(r.TransformPoint(new Vector3(0.2f, 1.35f, 0f)), "Order pickup (pinned order)", 3f);
            _level.CounterSocket = socket;
        }

        // =====================================================================================
        // BACKROOM  (x -7..7, z 13..23, ceiling 3.6)
        // =====================================================================================

        static void BuildBackroom(Transform t)
        {
            Glossy(B("BackFloor", new Vector3(0f, -0.05f, 18f), new Vector3(14.4f, 0.1f, 10f), Palette.Slate), 0.5f);
            B("FloorMatA", new Vector3(0f, 0.005f, 16.6f), new Vector3(3f, 0.01f, 1.2f), Palette.TealDark, false);
            B("FloorMatB", new Vector3(4.4f, 0.005f, 21.3f), new Vector3(2.2f, 0.01f, 1.4f), Palette.TealDark, false);
            B("BackCeiling", new Vector3(0f, 3.65f, 18f), new Vector3(14.4f, 0.1f, 10f), new Color(0.24f, 0.2f, 0.17f));
            foreach (float x in new[] { -4f, 0f, 4f }) B("Beam", new Vector3(x, 3.48f, 18f), new Vector3(0.25f, 0.25f, 10f), new Color(0.2f, 0.15f, 0.11f), false);

            // Walls. Left wall has the snowy window (z 17..18.3).
            B("LeftA", new Vector3(-7.1f, 1.8f, 15f), new Vector3(0.2f, 3.6f, 4f), WallCream);
            B("LeftB", new Vector3(-7.1f, 1.8f, 20.65f), new Vector3(0.2f, 3.6f, 4.7f), WallCream);
            B("LeftUnderWindow", new Vector3(-7.1f, 0.3f, 17.65f), new Vector3(0.2f, 0.6f, 1.3f), Palette.Teal);
            B("LeftOverWindow", new Vector3(-7.1f, 3.45f, 17.65f), new Vector3(0.2f, 0.3f, 1.3f), WallCream);
            Shapes.Sign("BackroomWindow", _static, new Vector3(-6.99f, 1.95f, 17.65f), Vector3.right, 1.3f, 2.7f, "window_backroom", true);
            B("BackroomSill", new Vector3(-6.85f, 0.6f, 17.65f), new Vector3(0.3f, 0.06f, 1.5f), Palette.Teal);
            AddLight("BackroomWindowLight", new Vector3(-6.2f, 2.2f, 17.65f), new Color(0.75f, 0.85f, 1f), 0.45f, 4f, LightArea.Backroom, 0f);
            B("RightWall", new Vector3(7.1f, 1.8f, 18f), new Vector3(0.2f, 3.6f, 10f), WallCream);
            // Front wall (door to the staff hallway at x 2.75..4.75).
            B("FrontWallL", new Vector3(-2.225f, 1.8f, 13f), new Vector3(9.95f, 3.6f, 0.2f), WallCream);
            B("FrontWallR", new Vector3(5.975f, 1.8f, 13f), new Vector3(2.45f, 3.6f, 0.2f), WallCream);
            B("FrontOverDoor", new Vector3(3.75f, 2.95f, 13f), new Vector3(2f, 1.3f, 0.2f), WallCream);
            // Back wall z=23 (shared with the basement's upper half). Door to the basement stairs at x -7..-5.2.
            B("BackOverStairs", new Vector3(-6.1f, 2.95f, 23f), new Vector3(1.8f, 1.3f, 0.2f), WallCream);
            B("BackMain", new Vector3(1f, 1.8f, 23f), new Vector3(12.4f, 3.6f, 0.2f), WallCream);
            Wainscot(new Vector3(-6.98f, 0.55f, 15f), new Vector3(0.05f, 1.1f, 3.9f));
            Wainscot(new Vector3(-6.98f, 0.55f, 20.65f), new Vector3(0.05f, 1.1f, 4.6f));
            Wainscot(new Vector3(6.98f, 0.55f, 18f), new Vector3(0.05f, 1.1f, 9.9f));
            Wainscot(new Vector3(1f, 0.55f, 22.88f), new Vector3(12.3f, 1.1f, 0.05f));

            _level.BasementDoor = MakeDoor(t, "StairsDoor", new Vector3(-6.98f, 0f, 23f), 0f, 1.76f, 2.3f, Palette.TealDark, "basement door", false);
            _level.BasementDoor.OpenAngle = 95f; // swings into the backroom
            Shapes.Sign("ToBasement", _static, new Vector3(-6.1f, 2.55f, 22.88f), Vector3.back, 1.4f, 0.35f, "sign_to_basement");

            // Freight lift facade: supplier deliveries descend to the basement.
            Emissive(B("LiftShaft", new Vector3(4.4f, 1.2f, 22.89f), new Vector3(2.4f, 2.4f, 0.02f), new Color(0.08f, 0.07f, 0.06f), false), new Color(0.3f, 0.18f, 0.08f), 0.4f);
            for (int i = 0; i < 16; i++) B("LiftBar", new Vector3(3.25f + i * 0.153f, 1.2f, 22.8f), new Vector3(0.025f, 2.4f, 0.025f), new Color(0.15f, 0.14f, 0.13f), false);
            foreach (float y in new[] { 0.1f, 1.2f, 2.3f }) Metal(B("LiftRail", new Vector3(4.4f, y, 22.79f), new Vector3(2.4f, 0.04f, 0.03f), Palette.Brass, false));
            B("LiftPostL", new Vector3(3.12f, 1.3f, 22.85f), new Vector3(0.15f, 2.6f, 0.12f), Palette.TealDark);
            B("LiftPostR", new Vector3(5.68f, 1.3f, 22.85f), new Vector3(0.15f, 2.6f, 0.12f), Palette.TealDark);
            B("LiftHeader", new Vector3(4.4f, 2.55f, 22.85f), new Vector3(2.7f, 0.25f, 0.12f), Palette.TealDark);
            Shapes.Sign("FreightLiftSign", _static, new Vector3(4.4f, 3.05f, 22.88f), Vector3.back, 1.6f, 0.62f, "sign_freight_basement");
            _level.AddLabel(new Vector3(4.4f, 1.4f, 22.6f), "Freight lift — supplier deliveries arrive downstairs", 3.5f);

            Picture(new Vector3(0.2f, 2.1f, 22.88f), Vector3.back, 0.75f, 1.12f, "sign_small_worlds");
            Shapes.Sign("Shipments", _static, new Vector3(6.4f, 1.55f, 22.86f), Vector3.back, 0.45f, 0.6f, "clipboard_shipments");
            Banner(new Vector3(-6.95f, 2.4f, 19.4f), Vector3.right, 0.6f, 1.2f);
            Banner(new Vector3(6.95f, 2.4f, 18.8f), Vector3.left, 0.6f, 1.2f);

            // Supply shelving along the front wall: jars of snow, spare domes, bases.
            B("SupplyShelfBack", new Vector3(-4.6f, 1.6f, 13.12f), new Vector3(4.4f, 3.2f, 0.05f), Palette.TealDark);
            foreach (float y in new[] { 0.9f, 1.5f, 2.1f, 2.7f })
            {
                B("SupplyBoard", new Vector3(-4.6f, y, 13.3f), new Vector3(4.4f, 0.04f, 0.4f), Palette.Teal);
                for (int i = 0; i < 6; i++)
                {
                    float x = -6.4f + i * 0.72f;
                    int kind = (i + Mathf.RoundToInt(y * 10f)) % 3;
                    if (kind == 0) Jar(new Vector3(x, y + 0.02f, 13.3f));
                    else if (kind == 1) EmptyDome(new Vector3(x, y + 0.02f, 13.3f), 0.6f);
                    else B("BaseStack", new Vector3(x, y + 0.08f, 13.3f), new Vector3(0.25f, 0.12f, 0.25f), new Color(0.1f, 0.08f, 0.07f), false);
                }
            }
            Crate(new Vector3(-1.3f, 0f, 13.75f), new Vector3(1.2f, 0.9f, 0.7f), "crate_backroom", Vector3.forward, 0.8f, 0.62f);
            B("CrateSmall", new Vector3(-1.5f, 1.1f, 13.7f), new Vector3(0.6f, 0.4f, 0.5f), Palette.WoodWarm);

            // Stations, placed like the painting: long worktable in the middle, brass lamp desk front-left.
            _level.Prep = Station<PrepStation>(t, "Preparation Cradle", StationId.PrepCradle, new Vector3(-6.2f, 0f, 20.3f), 90f, new Vector3(1f, 0.9f, 0.9f), Vector3.zero);
            Shapes.Box("Cradle", _level.Prep.transform, new Vector3(0f, 0.92f, 0f), new Vector3(0.34f, 0.04f, 0.26f), WallCream, false);
            var injector = Shapes.Prim(PrimitiveType.Cylinder, "Injector", _level.Prep.transform, new Vector3(-0.35f, 1f, -0.3f), new Vector3(0.05f, 0.12f, 0.05f), Palette.Serum, false);
            Emissive(injector, Palette.Serum, 1.5f);
            injector.transform.localRotation = Quaternion.Euler(0f, 0f, 70f);

            _level.Assembly = Station<AssemblyStation>(t, "Assembly Worktable", StationId.Assembly, new Vector3(0f, 0f, 18.3f), 180f, new Vector3(3f, 0.9f, 1.2f), new Vector3(0f, 0f, 0.3f));
            DressWorktable(_level.Assembly.transform);

            _level.Sealer = Station<SealerStation>(t, "Sealing Machine", StationId.Sealer, new Vector3(5.9f, 0f, 20.2f), -90f, new Vector3(1f, 0.9f, 0.9f), Vector3.zero);
            Metal(Shapes.Box("SealerBody", _level.Sealer.transform, new Vector3(0f, 1.4f, -0.36f), new Vector3(1f, 1f, 0.25f), Palette.Brass, false));
            Emissive(Shapes.Prim(PrimitiveType.Sphere, "SealerGauge", _level.Sealer.transform, new Vector3(0.3f, 1.55f, -0.22f), new Vector3(0.14f, 0.14f, 0.04f), WallCream, false), WallCream, 0.4f);
            var ghost = Shapes.Prim(PrimitiveType.Sphere, "DomeGhost", _level.Sealer.Socket.transform, new Vector3(0f, 0.6f, 0f), Vector3.one * 0.34f, Palette.Glass, false);
            ghost.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
            _level.Sealer.DomeGhost = ghost.transform;
            _level.Sealer.Glow = Shapes.PointLight("SealGlow", _level.Sealer.transform, new Vector3(0f, 1.2f, 0f), Palette.Serum, 0f, 2f);

            _level.Inspection = Station<InspectionStation>(t, "Inspection Lamp", StationId.Inspection, new Vector3(-5.9f, 0f, 15.2f), 90f, new Vector3(1f, 0.85f, 0.9f), Vector3.zero);
            var lampRoot = _level.Inspection.transform;
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "LampFoot", lampRoot, new Vector3(0.3f, 0.87f, -0.3f), new Vector3(0.16f, 0.02f, 0.16f), Palette.Brass, false));
            Metal(Shapes.Rod("LampArm1", lampRoot, new Vector3(0.3f, 0.88f, -0.3f), new Vector3(0.25f, 1.55f, -0.2f), 0.015f, Palette.Brass));
            Metal(Shapes.Rod("LampArm2", lampRoot, new Vector3(0.25f, 1.55f, -0.2f), new Vector3(0.05f, 1.6f, 0.05f), 0.015f, Palette.Brass));
            var shade = Shapes.Prim(PrimitiveType.Sphere, "LampShade", lampRoot, new Vector3(0.02f, 1.55f, 0.08f), new Vector3(0.34f, 0.16f, 0.34f), Palette.Brass, false);
            Metal(shade);
            Emissive(Shapes.Prim(PrimitiveType.Sphere, "LampBulb", lampRoot, new Vector3(0.02f, 1.49f, 0.08f), Vector3.one * 0.08f, Warm, false), Warm, 3f);
            _level.Inspection.Lamp = Shapes.PointLight("Lamp", lampRoot, new Vector3(0.02f, 1.4f, 0.05f), Warm, 0.6f, 2.5f);

            _level.Packaging = Station<PackagingStation>(t, "Packaging Table", StationId.Packaging, new Vector3(5.9f, 0f, 15.2f), -90f, new Vector3(1f, 0.9f, 0.9f), Vector3.zero);
            for (int i = 0; i < 4; i++) Shapes.Box("FlatBox" + i, _level.Packaging.transform, new Vector3(0.3f, 0.92f + i * 0.02f, -0.3f), new Vector3(0.4f, 0.02f, 0.4f), Palette.Cardboard, false);
            Shapes.Box("Tissue", _level.Packaging.transform, new Vector3(-0.3f, 0.93f, -0.3f), new Vector3(0.3f, 0.05f, 0.3f), WallCream, false);

            // Carts with finished globes, packed boxes, a stool.
            Cart(new Vector3(2.8f, 0f, 21.4f), 0f, true);
            Cart(new Vector3(-2.8f, 0f, 21.4f), 0f, true);
            for (int i = 0; i < 3; i++) B("PackedBox", new Vector3(0.2f, 0.3f + i * 0.6f, 13.6f - (i % 2) * 0.05f), new Vector3(0.6f, 0.6f, 0.6f), Palette.Cardboard);
            Emissive(B("Tissue", new Vector3(0.2f, 1.81f, 13.6f), new Vector3(0.45f, 0.04f, 0.45f), WallCream, false), WallCream, 0.1f);
            BuildMachines(t);
            Stool(new Vector3(1.7f, 0f, 16.9f));

            // Lights: two pendants over the worktable, front and back fills.
            Pendant(new Vector3(-1f, 3.6f, 18.3f), 1.1f, true, 1f, 6f, LightArea.Backroom, 0.02f);
            Pendant(new Vector3(1f, 3.6f, 18.3f), 1.1f, true, 1f, 6f, LightArea.Backroom, 0.02f);
            Pendant(new Vector3(0f, 3.6f, 18.3f), 1.1f, false, 0f, 0f, LightArea.Backroom, 0f);
            Pendant(new Vector3(0f, 3.6f, 14.6f), 0.7f, true, 0.7f, 6f, LightArea.Backroom, 0.03f);
            Pendant(new Vector3(-3.5f, 3.6f, 21.4f), 0.7f, true, 0.7f, 6f, LightArea.Backroom, 0.05f);
            _level.AddLabel(new Vector3(-4.6f, 2.95f, 13.4f), "Supplies (Tab to order)", 4f);
        }

        /// <summary>
        /// Automation upgrades (Milestone 3). Each is a hidden rig that appears when bought:
        /// auto-prep gantry + hopper by the cradle, a conveyor from the sealer to packaging along
        /// the right wall, and a packaging press with a four-slot output rack.
        /// </summary>
        static void BuildMachines(Transform t)
        {
            var steel = Palette.Steel;

            // --- Automated prep: gantry injector over the cradle, hopper basket beside it.
            var prep = Shapes.Empty("AutoPrepRig", t, Vector3.zero);
            _level.AutoPrepRig = prep;
            var pr = prep.transform;
            foreach (float z in new[] { 19.9f, 20.7f }) Metal(Shapes.Rod("GantryPost", pr, new Vector3(-6.75f, 0.9f, z), new Vector3(-6.75f, 1.85f, z), 0.03f, Palette.Brass));
            Metal(Shapes.Rod("GantryBeam", pr, new Vector3(-6.75f, 1.85f, 20.3f), new Vector3(-6.2f, 1.85f, 20.3f), 0.03f, Palette.Brass));
            Metal(Shapes.Rod("GantryCross", pr, new Vector3(-6.75f, 1.85f, 19.9f), new Vector3(-6.75f, 1.85f, 20.7f), 0.03f, Palette.Brass));
            Emissive(Shapes.Prim(PrimitiveType.Cylinder, "Nozzle", pr, new Vector3(-6.2f, 1.7f, 20.3f), new Vector3(0.06f, 0.12f, 0.06f), Palette.Serum, false), Palette.Serum, 1.5f);
            Shapes.Box("HopperStand", pr, new Vector3(-6.2f, 0.35f, 19.1f), new Vector3(0.8f, 0.7f, 0.7f), Palette.TealDark);
            foreach (var w in new[] { new Vector4(-6.2f, 18.77f, 0.8f, 0.04f), new Vector4(-6.2f, 19.43f, 0.8f, 0.04f), new Vector4(-6.58f, 19.1f, 0.04f, 0.7f), new Vector4(-5.82f, 19.1f, 0.04f, 0.7f) })
                Metal(Shapes.Box("HopperWall", pr, new Vector3(w.x, 0.8f, w.y), new Vector3(w.z, 0.2f, w.w), Palette.Brass, false));
            var hopperGo = Shapes.Empty("PrepHopper", pr, new Vector3(-6.2f, 0.71f, 19.1f));
            var hopper = hopperGo.AddComponent<SnapSocket>();
            hopper.Label = "auto-prep hopper";
            hopper.AllowMultiple = true;
            hopper.Radius = 0.5f;
            hopper.RoamHalfExtents = new Vector2(0.3f, 0.25f);
            hopper.Accepts = v => v.P != null && GameRoot.I.Session.Automation.CanAddToHopper(v.P);
            hopper.RejectReason = v => "The hopper takes up to " + AutomationService.HopperCapacity + " awake characters.";
            hopper.Placed = v =>
            {
                if (v.P.Location.Kind == LocationKind.Hopper) return;
                var r = GameRoot.I.Session.Automation.AddToHopper(v.P);
                if (!string.IsNullOrEmpty(r.Message)) GameRoot.I.Toast(r.Message, !r.Success);
            };
            _level.PrepHopper = hopper;
            Panel(pr, MachineId.AutoPrep, new Vector3(-6.92f, 1.35f, 19.1f), Vector3.right);

            // --- Short conveyor along the right wall, sealer (z 19.6) down to packaging (z 15.8).
            var conv = Shapes.Empty("ConveyorRig", t, Vector3.zero);
            _level.ConveyorRig = conv;
            var cr = conv.transform;
            Shapes.Box("BeltFrame", cr, new Vector3(6.45f, 0.83f, 17.7f), new Vector3(0.5f, 0.12f, 3.9f), steel);
            Shapes.Box("BeltSurface", cr, new Vector3(6.45f, 0.895f, 17.7f), new Vector3(0.44f, 0.01f, 3.8f), new Color(0.12f, 0.12f, 0.12f), false);
            foreach (float z in new[] { 15.9f, 17.7f, 19.5f })
                foreach (float x in new[] { 6.25f, 6.65f })
                    Shapes.Box("BeltLeg", cr, new Vector3(x, 0.39f, z), new Vector3(0.05f, 0.78f, 0.05f), steel);
            var beltGo = Shapes.Empty("Belt", cr, new Vector3(6.45f, 0.905f, 17.7f));
            var belt = beltGo.AddComponent<ConveyorView>();
            belt.StartLocal = new Vector3(0f, 0f, 1.85f);
            belt.EndLocal = new Vector3(0f, 0f, -1.85f);
            for (int i = 0; i < 8; i++)
            {
                float z = 19.6f - i * (3.8f / 7f);
                belt.Rollers.Add(Metal(Shapes.Rod("Roller", cr, new Vector3(6.2f, 0.87f, z), new Vector3(6.7f, 0.87f, z), 0.03f, Palette.Brass)).transform);
            }
            _level.Conveyor = belt;
            Panel(cr, MachineId.Conveyor, new Vector3(6.97f, 1.35f, 17.7f), Vector3.left);

            // --- Packaging press over the table, output rack between the table and the front wall.
            var pack = Shapes.Empty("PackagerRig", t, Vector3.zero);
            _level.PackagerRig = pack;
            var kr = pack.transform;
            foreach (float z in new[] { 14.75f, 15.65f }) Metal(Shapes.Rod("PressPost", kr, new Vector3(6.4f, 0.9f, z), new Vector3(6.4f, 1.9f, z), 0.03f, Palette.Brass));
            Metal(Shapes.Box("PressHead", kr, new Vector3(6.05f, 1.75f, 15.2f), new Vector3(0.7f, 0.25f, 0.95f), Palette.Brass, false));
            Shapes.Box("RackFrame", kr, new Vector3(6.4f, 0.6f, 13.7f), new Vector3(0.5f, 0.04f, 1.1f), Palette.TealDark);
            Shapes.Box("RackShelf", kr, new Vector3(6.4f, 1.15f, 13.7f), new Vector3(0.5f, 0.04f, 1.1f), Palette.TealDark);
            foreach (float z in new[] { 13.18f, 14.22f }) Shapes.Box("RackPost", kr, new Vector3(6.4f, 0.75f, z), new Vector3(0.5f, 1.5f, 0.04f), Palette.TealDark);
            for (int i = 0; i < AutomationService.OutputShelfCapacity; i++)
            {
                var slotGo = Shapes.Empty("OutputSlot" + i, kr, new Vector3(6.4f, i < 2 ? 0.62f : 1.17f, i % 2 == 0 ? 13.45f : 13.95f));
                slotGo.transform.localRotation = Quaternion.Euler(0f, -90f, 0f);
                var sock = slotGo.AddComponent<SnapSocket>();
                sock.Label = "output rack";
                sock.Radius = 0.3f;
                sock.Accepts = v => false;
                sock.RejectReason = v => "Only the packaging machine fills the output rack.";
                _level.OutputSlots[i] = sock;
            }
            Panel(kr, MachineId.PackagingMachine, new Vector3(6.97f, 1.35f, 14.45f), Vector3.left);

            // --- Sealing press: a brass ram over the sealing machine that seats and seals domes by itself.
            var press = Shapes.Empty("SealPressRig", t, Vector3.zero);
            _level.SealPressRig = press;
            var sr = press.transform;
            Metal(Shapes.Rod("PressColumn", sr, new Vector3(6.6f, 0f, 20.85f), new Vector3(6.6f, 2.35f, 20.85f), 0.05f, Palette.Brass));
            Metal(Shapes.Box("PressArm", sr, new Vector3(6.25f, 2.35f, 20.5f), new Vector3(0.8f, 0.12f, 0.8f), Palette.Brass, false));
            Shapes.Prim(PrimitiveType.Cylinder, "PressRam", sr, new Vector3(5.9f, 2.1f, 20.2f), new Vector3(0.22f, 0.16f, 0.22f), steel, false);
            Panel(sr, MachineId.SealingPress, new Vector3(6.97f, 1.35f, 21.25f), Vector3.left);

            prep.SetActive(false);
            conv.SetActive(false);
            pack.SetActive(false);
            press.SetActive(false);
        }

        static void Panel(Transform parent, MachineId machine, Vector3 pos, Vector3 facing)
        {
            var go = Shapes.Empty("Panel_" + machine, parent, pos);
            go.transform.localRotation = Quaternion.LookRotation(facing);
            Shapes.Box("PanelBox", go.transform, Vector3.zero, new Vector3(0.32f, 0.4f, 0.08f), Palette.TealDark);
            var lamp = Shapes.Prim(PrimitiveType.Sphere, "PanelLamp", go.transform, new Vector3(0f, 0.1f, 0.05f), Vector3.one * 0.07f, Palette.Idle, false);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Lever", go.transform, new Vector3(0f, -0.08f, 0.06f), new Vector3(0.04f, 0.06f, 0.04f), Palette.Brass, false)).transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            var panel = go.AddComponent<MachinePanel>();
            panel.Machine = machine;
            panel.Lamp = lamp.GetComponent<Renderer>();
            _level.Panels.Add(panel);
        }

        static void DressWorktable(Transform table)
        {
            // Far half (local -Z): glass domes, bases, trays of tiny trees — like the painting.
            for (int i = 0; i < 4; i++)
            {
                var pos = new Vector3(-1.25f + i * 0.35f, 0.9f, -0.3f);
                if (i % 2 == 0) DecorGlobe(table, pos, 0.8f, 180f);
                else EmptyDome(table.TransformPoint(pos), 0.8f, table);
            }
            DecorGlobe(table, new Vector3(1.2f, 0.9f, -0.3f), 0.9f, 180f);
            var tray = Shapes.Box("TreeTray", table, new Vector3(0.62f, 0.93f, -0.35f), new Vector3(0.5f, 0.05f, 0.3f), Palette.WoodWarm, false);
            for (int i = 0; i < 6; i++)
                Shapes.Prim(PrimitiveType.Sphere, "MiniTree", tray.transform.parent, new Vector3(0.45f + (i % 3) * 0.13f, 0.99f, -0.4f + (i / 3) * 0.12f), new Vector3(0.05f, 0.1f, 0.05f), new Color(0.12f, 0.35f, 0.2f), false);
            // Snow jar with label, near the player's side.
            var jar = Shapes.Prim(PrimitiveType.Cylinder, "SnowJar", table, new Vector3(-1.15f, 1.02f, 0.35f), new Vector3(0.16f, 0.12f, 0.16f), Palette.Glass, false);
            jar.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
            Shapes.Prim(PrimitiveType.Cylinder, "SnowFill", table, new Vector3(-1.15f, 0.99f, 0.35f), new Vector3(0.14f, 0.08f, 0.14f), Palette.Snow, false);
            Shapes.Sign("SnowLabel", table, new Vector3(-1.15f, 1.02f, 0.43f), Vector3.forward, 0.12f, 0.12f, "label_snow");
            // Work order sheet lying on the table, readable from the player's side (local +Z).
            Shapes.FlatSign("WorkOrder", table, new Vector3(0.85f, 0.905f, 0.28f), Vector3.forward, 0.42f, 0.32f, "work_order");
            // Snow dispenser hanging over the socket, scenery bins (1-3) at the back edge.
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "SnowDispenser", table, new Vector3(0f, 1.6f, 0.3f), new Vector3(0.22f, 0.22f, 0.22f), Palette.Brass, false));
            Shapes.Rod("DispenserRod", table, new Vector3(0f, 1.82f, 0.3f), new Vector3(0f, 3.4f, 0.3f), 0.015f, Palette.Brass);
            Color[] bin = { new Color(0.12f, 0.4f, 0.2f), new Color(0.85f, 0.75f, 0.55f), Palette.Snow };
            for (int i = 0; i < 3; i++) Shapes.Box("Bin" + (i + 1), table, new Vector3(-0.35f + i * 0.35f, 0.95f, -0.08f), new Vector3(0.28f, 0.1f, 0.16f), bin[i], false);
            TableLamp(table.TransformPoint(new Vector3(-1.35f, 0.9f, 0.4f)), false);
        }

        // =====================================================================================
        // BASEMENT  (x -7..7, z 23..39, floor -4, ceiling 2.4)
        // =====================================================================================

        static void BuildBasement(Transform t)
        {
            const float F = Level.BasementFloorY;
            Glossy(B("BasementFloor", new Vector3(0f, F - 0.05f, 31f), new Vector3(14.4f, 0.1f, 16f), new Color(0.16f, 0.17f, 0.18f)), 0.6f);
            for (int i = 1; i < 14; i++) B("TileLine", new Vector3(-7f + i, F + 0.001f, 31f), new Vector3(0.02f, 0.002f, 16f), new Color(0.1f, 0.1f, 0.11f), false);
            B("BasementCeiling", new Vector3(0f, 2.45f, 31f), new Vector3(14.4f, 0.1f, 16f), new Color(0.1f, 0.12f, 0.14f));
            var wall = new Color(0.16f, 0.24f, 0.28f);
            B("WallRight", new Vector3(-7.1f, -0.8f, 31f), new Vector3(0.2f, 6.4f, 16f), wall);
            B("WallLeft", new Vector3(7.1f, -0.8f, 31f), new Vector3(0.2f, 6.4f, 16f), wall);
            B("WallFront", new Vector3(0f, -0.8f, 39.1f), new Vector3(14.4f, 6.4f, 0.2f), wall);
            // Lower half of the shared z=23 wall, with the freight lift opening (x -4.4..-2.2, y -4..-1.6).
            B("WallBackA", new Vector3(-5.8f, -2f, 23f), new Vector3(2.8f, 4f, 0.2f), wall);
            B("WallBackB", new Vector3(2.5f, -2f, 23f), new Vector3(9.4f, 4f, 0.2f), wall);
            B("WallBackOverLift", new Vector3(-3.3f, -0.8f, 23f), new Vector3(2.2f, 1.6f, 0.2f), wall);
            B("PanelRight", new Vector3(-6.97f, F + 0.7f, 36f), new Vector3(0.05f, 1.4f, 6f), Palette.TealDark, false);
            B("PanelFront", new Vector3(0f, F + 0.7f, 38.97f), new Vector3(13.8f, 1.4f, 0.05f), Palette.TealDark, false);

            // Vault ribs and pipes.
            foreach (float z in new[] { 26f, 30f, 34f, 38f }) Rib(z);
            Shapes.Rod("PipeA", _static, new Vector3(-6.4f, 2.05f, 23.2f), new Vector3(-6.4f, 2.05f, 38.8f), 0.07f, new Color(0.3f, 0.3f, 0.3f));
            Shapes.Rod("PipeB", _static, new Vector3(-5.95f, 1.85f, 23.2f), new Vector3(-5.95f, 1.85f, 38.8f), 0.045f, Palette.Brass * 0.8f);
            Shapes.Rod("PipeC", _static, new Vector3(5.9f, 2.1f, 23.2f), new Vector3(5.9f, 2.1f, 38.8f), 0.06f, new Color(0.3f, 0.3f, 0.3f));
            Shapes.Rod("PipeD", _static, new Vector3(-7f, 2.15f, 23.5f), new Vector3(7f, 2.15f, 23.5f), 0.08f, new Color(0.28f, 0.28f, 0.28f));
            for (int i = 0; i < 4; i++) Metal(Shapes.Prim(PrimitiveType.Cylinder, "Valve", _static, new Vector3(-6.4f, 1.92f, 25f + i * 4f), new Vector3(0.16f, 0.01f, 0.16f), Palette.Brass, false));

            BuildStairs(t);
            BuildFreightLift(t);
            BuildCabinets(t);

            // Pillar with the company motto.
            B("Pillar", new Vector3(1f, -0.8f, 28.5f), new Vector3(0.6f, 6.4f, 0.6f), Palette.TealDark);
            foreach (float y in new[] { F + 0.2f, -0.5f, 2.2f }) Metal(B("PillarBand", new Vector3(1f, y, 28.5f), new Vector3(0.64f, 0.06f, 0.64f), Palette.Brass, false));
            Shapes.Sign("MottoSign", _static, new Vector3(1f, -1.2f, 28.81f), Vector3.forward, 0.52f, 1.04f, "sign_small_lives");
            Banner(new Vector3(0.69f, -0.3f, 28.5f), Vector3.left, 0.45f, 0.9f);
            HangingBanner(new Vector3(-1.2f, 1.2f, 26f));
            HangingBanner(new Vector3(3.8f, 1.2f, 24.8f));

            BuildDioramaTable(new Vector3(2.6f, F, 32.5f));
            BuildClothingTrays(new Vector3(1.55f, F, 36.9f));
            BuildCrateShelf();

            // Breaker panel at the foot of the stairs.
            var breakerRoot = Shapes.Empty("Breaker", t, new Vector3(-6.93f, -2.5f, 33f));
            Shapes.Box("Panel", breakerRoot.transform, Vector3.zero, new Vector3(0.12f, 0.7f, 0.5f), Palette.Steel);
            var lamp = Shapes.Prim(PrimitiveType.Sphere, "BreakerLamp", breakerRoot.transform, new Vector3(0.08f, 0.25f, 0f), Vector3.one * 0.07f, Palette.Ok, false);
            _level.Breaker = breakerRoot.AddComponent<Breaker>();
            _level.Breaker.Lamp = lamp.GetComponent<Renderer>();
            _level.AddLabel(new Vector3(-6.7f, -1.95f, 33f), "Breaker", 4f);

            // Security desk (cameras are a planned upgrade).
            BuildSecurity(t);

            Cart(new Vector3(4.4f, F, 35.2f), 90f, false);
            Cart(new Vector3(-1.7f, F, 25.8f), 0f, true);

            _level.DarkCorner = Shapes.Empty("DarkCorner", t, new Vector3(6.5f, F + 0.5f, 38.5f)).transform;

            Pendant(new Vector3(4f, 2.4f, 26.6f), 1.5f, true, 1f, 7f, LightArea.Basement, 0.1f);
            Pendant(new Vector3(0f, 2.4f, 31.5f), 1.4f, true, 1f, 7f, LightArea.Basement, 0.15f);
            Pendant(new Vector3(-2.6f, 2.4f, 28f), 1.5f, true, 0.8f, 6f, LightArea.Basement, 0.45f);
            Pendant(new Vector3(3f, 2.4f, 36f), 1.6f, true, 0.8f, 6f, LightArea.Basement, 0.12f);
        }

        static void BuildStairs(Transform t)
        {
            const float F = Level.BasementFloorY;
            // Landing at backroom floor level, then 8 m of stairs down along the right wall (x -7..-5.2).
            B("Landing", new Vector3(-6.1f, -2f, 23.7f), new Vector3(1.8f, 4f, 1.4f), Palette.TealDark);
            B("LandingTop", new Vector3(-6.1f, -0.01f, 23.7f), new Vector3(1.8f, 0.02f, 1.4f), Palette.WoodWarm, false);
            float angle = Mathf.Atan2(4f, 8f) * Mathf.Rad2Deg;
            float len = Mathf.Sqrt(64f + 16f);
            var ramp = B("StairRamp", new Vector3(-6.1f, -2f - 0.05f / Mathf.Cos(angle * Mathf.Deg2Rad), 28.4f), new Vector3(1.8f, 0.1f, len), Palette.TealDark);
            ramp.transform.localRotation = Quaternion.Euler(angle, 0f, 0f);
            ramp.GetComponent<Renderer>().enabled = false; // walkable slope; the steps below are visual
            for (int i = 0; i < 16; i++)
            {
                float top = -(0.25f * i + 0.125f) + 0.06f;
                B("Step", new Vector3(-6.1f, top - 0.125f, 24.65f + i * 0.5f), new Vector3(1.8f, 0.25f, 0.5f), Palette.WoodWarm * 0.8f, false);
            }
            // Solid under the stairs so nobody walks beneath them.
            for (int i = 0; i < 8; i++)
            {
                float h = 4f - (i + 1) * 0.5f;
                if (h < 0.05f) continue;
                B("UnderStair", new Vector3(-6.1f, F + h * 0.5f, 24.9f + i), new Vector3(1.8f, h, 1f), Palette.TealDark);
            }
            // Railing on the open side.
            for (int i = 0; i <= 8; i++)
            {
                float z = 24.4f + i;
                float y = -(z - 24.4f) * 0.5f;
                Metal(Shapes.Rod("RailPost", _static, new Vector3(-5.25f, y, z), new Vector3(-5.25f, y + 0.9f, z), 0.02f, Palette.Brass));
            }
            Metal(Shapes.Rod("Handrail", _static, new Vector3(-5.25f, 0.9f, 24.4f), new Vector3(-5.25f, -3.1f, 32.4f), 0.025f, Palette.Brass));
            Metal(Shapes.Rod("LandingRail", _static, new Vector3(-5.25f, 0.9f, 23.1f), new Vector3(-5.25f, 0.9f, 24.4f), 0.025f, Palette.Brass));
            Metal(Shapes.Rod("LandingPost", _static, new Vector3(-5.25f, 0f, 23.15f), new Vector3(-5.25f, 0.9f, 23.15f), 0.02f, Palette.Brass));

            Shapes.Sign("ToProduction", _static, new Vector3(-4.7f, 1f, 23.12f), Vector3.forward, 0.75f, 0.75f, "sign_to_production");
            Metal(Shapes.Prim(PrimitiveType.Sphere, "DoorLampShade", _static, new Vector3(-4.7f, 1.9f, 23.25f), new Vector3(0.2f, 0.1f, 0.2f), Palette.Brass, false));
            AddLight("StairLamp", new Vector3(-4.8f, 1.75f, 23.5f), Warm, 0.6f, 4f, LightArea.Basement, 0.05f);
        }

        static void BuildFreightLift(Transform t)
        {
            const float F = Level.BasementFloorY;
            var iron = new Color(0.14f, 0.14f, 0.15f);
            // The cab sits under the backroom floor, behind the z=23 wall.
            B("CabFloor", new Vector3(-3.3f, F - 0.05f, 22f), new Vector3(2.3f, 0.1f, 2.1f), iron);
            B("CabWallL", new Vector3(-4.45f, F + 1.2f, 22f), new Vector3(0.1f, 2.4f, 2f), iron);
            B("CabWallR", new Vector3(-2.15f, F + 1.2f, 22f), new Vector3(0.1f, 2.4f, 2f), iron);
            B("CabBack", new Vector3(-3.3f, F + 1.2f, 21f), new Vector3(2.3f, 2.4f, 0.1f), iron);
            B("CabCeiling", new Vector3(-3.3f, F + 2.45f, 22f), new Vector3(2.3f, 0.1f, 2f), iron);
            Metal(B("CabTrim", new Vector3(-3.3f, F + 1.1f, 21.06f), new Vector3(2.2f, 0.05f, 0.02f), Palette.Brass, false));
            AddLight("LiftCabLight", new Vector3(-3.3f, F + 2.1f, 22f), Warm, 0.8f, 3.5f, LightArea.Basement, 0.08f);

            // Delivery crate inside the cab — shipments arrive here.
            B("CrateBottom", new Vector3(-3.3f, F + 0.05f, 21.9f), new Vector3(1.3f, 0.1f, 0.9f), Palette.WoodWarm);
            B("CrateFront", new Vector3(-3.3f, F + 0.2f, 22.35f), new Vector3(1.3f, 0.3f, 0.05f), Palette.WoodWarm);
            B("CrateBack", new Vector3(-3.3f, F + 0.2f, 21.45f), new Vector3(1.3f, 0.3f, 0.05f), Palette.WoodWarm);
            B("CrateL", new Vector3(-3.95f, F + 0.2f, 21.9f), new Vector3(0.05f, 0.3f, 0.9f), Palette.WoodWarm);
            B("CrateR", new Vector3(-2.65f, F + 0.2f, 21.9f), new Vector3(0.05f, 0.3f, 0.9f), Palette.WoodWarm);
            var hatchGo = Shapes.Empty("DeliveryCrate", t, new Vector3(-3.3f, F + 0.1f, 21.9f));
            _level.Hatch = hatchGo.AddComponent<SnapSocket>();
            _level.Hatch.Label = "Delivery crate";
            _level.Hatch.AllowMultiple = true;
            _level.Hatch.RoamHalfExtents = new Vector2(0.5f, 0.3f);
            // Normally one-way. When H.'s ledger asks for a globe, the matching box goes down in this crate.
            _level.Hatch.Accepts = v =>
            {
                string why;
                return v.P != null && v.P.Stage == ProductStage.Packaged && GameRoot.I.Session.Story.CanSend(v.P, out why);
            };
            _level.Hatch.RejectReason = v =>
            {
                string why;
                GameRoot.I.Session.Story.CanSend(v.P, out why);
                return why;
            };
            _level.Hatch.Placed = v =>
            {
                if (v.P == null || v.P.Stage != ProductStage.Packaged) return; // arrivals are placed here too
                var root = GameRoot.I;
                ActionResult result;
                root.Session.Story.SendGlobe(v.P, out result);
                root.Toast(result.Message, !result.Success);
                if (!result.Success) return;
                root.Audio.Play(Sfx.Hum, v.transform.position, 0.7f, 0.6f);
                root.OnProductSold(v.P);
            };

            // Gate: vertical bars that swing out into the basement.
            _level.LiftGate = MakeGate(t, new Vector3(-4.4f, F, 23.14f), 2.2f, 2.4f);
            B("LiftFrameL", new Vector3(-4.5f, F + 1.3f, 23.15f), new Vector3(0.15f, 2.6f, 0.12f), Palette.TealDark);
            B("LiftFrameR", new Vector3(-2.1f, F + 1.3f, 23.15f), new Vector3(0.15f, 2.6f, 0.12f), Palette.TealDark);
            Shapes.Sign("FreightLiftSign", _static, new Vector3(-3.3f, -1.25f, 23.12f), Vector3.forward, 1.9f, 0.4f, "sign_freight_lift");
            var lamp = Shapes.Prim(PrimitiveType.Sphere, "LiftCallLamp", t, new Vector3(-1.9f, F + 1.5f, 23.13f), Vector3.one * 0.08f, Palette.Busy, false);
            _level.LiftLamp = lamp.AddComponent<BlinkLamp>();
            _level.AddLabel(new Vector3(-3.3f, F + 2f, 23.4f), "Freight lift — deliveries", 5f);
        }

        /// <summary>The glass cabinet wall: columns A–E, rows 1–5. Rows 1–2 are usable holding cells.</summary>
        static void BuildCabinets(Transform t)
        {
            const float F = Level.BasementFloorY;
            const float rowStep = 0.95f, colStep = 1.15f, z0 = 24.8f;
            float faceX = 6.19f, midX = 6.575f;
            var cream = new Color(0.95f, 0.86f, 0.7f);
            B("CabinetPlinth", new Vector3(6.6f, F + 0.15f, 27.1f), new Vector3(0.8f, 0.3f, 5.9f), Palette.Teal);
            Emissive(B("CabinetBack", new Vector3(6.96f, F + 2.55f, 27.1f), new Vector3(0.06f, 4.6f, 5.8f), cream), new Color(1f, 0.8f, 0.55f), 0.18f);
            for (int c = 0; c <= 5; c++) B("CabinetPost", new Vector3(midX, F + 2.55f, z0 - colStep * 0.5f + c * colStep), new Vector3(0.75f, 4.6f, 0.06f), Palette.TealDark);
            for (int r = 1; r <= 6; r++) B("CabinetBoard", new Vector3(midX, F + 0.3f + (r - 1) * rowStep, 27.1f), new Vector3(0.75f, 0.05f, 5.8f), Palette.TealDark);
            B("CabinetCornice", new Vector3(6.55f, F + 5.18f, 27.1f), new Vector3(0.9f, 0.12f, 6f), Palette.Teal);
            Metal(Shapes.Rod("LadderRail", _static, new Vector3(6.05f, F + 5f, 24.2f), new Vector3(6.05f, F + 5f, 30f), 0.02f, Palette.Brass));

            string cols = "ABCDE";
            for (int c = 0; c < 5; c++)
            {
                float zc = z0 + c * colStep;
                for (int r = 1; r <= 5; r++)
                {
                    float yf = F + 0.3f + (r - 1) * rowStep;
                    string label = cols[c].ToString() + r;
                    Emissive(B("CellLight", new Vector3(faceX + 0.06f, yf + 0.77f, zc), new Vector3(0.03f, 0.02f, 1f), Warm, false), Warm, 2.2f);
                    Shapes.Sign("CellPlate" + label, _static, new Vector3(faceX - 0.02f, yf - 0.02f, zc - 0.38f), Vector3.left, 0.13f, 0.13f, "cell_" + label);
                    if (r <= 2)
                    {
                        int index = c * 2 + (r - 1);
                        var cellGo = Shapes.Empty("Cell_" + label, t, new Vector3(midX, yf + 0.025f, zc));
                        cellGo.transform.localRotation = Quaternion.Euler(0f, -90f, 0f);
                        var socket = cellGo.AddComponent<SnapSocket>();
                        var door = MakeDoor(t, "CellDoor_" + label, new Vector3(faceX, yf + 0.01f, zc - 0.55f), -90f, 1.1f, 0.76f, Palette.Brass, "cabinet " + label + " glass door", true, 0.03f);
                        var cell = cellGo.AddComponent<HoldingCell>();
                        cell.Setup(index, label, socket, door);
                        _level.Cells.Add(cell);
                    }
                    else
                    {
                        // Upper rows: long-term stock behind glass. They are also alive.
                        var glass = B("CellGlass", new Vector3(faceX, yf + 0.4f, zc), new Vector3(0.01f, 0.76f, 1.1f), Palette.Glass);
                        glass.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
                        int n = (c + r) % 4 == 0 ? 0 : ((c * 3 + r) % 3 == 0 ? 2 : 1);
                        for (int k = 0; k < n; k++)
                            FigureBuilder.Figurine(_static, new Vector3(midX, yf + 0.025f, zc + (n == 2 ? (k - 0.5f) * 0.4f : 0.1f)), -90f + (k * 20f - 10f), 1f, _decorSeed++);
                        if (n == 1 && r == 3) B("TinySuitcase", new Vector3(midX + 0.1f, yf + 0.06f, zc - 0.3f), new Vector3(0.1f, 0.07f, 0.12f), Palette.WoodWarm, false);
                    }
                }
            }

            // Rolling library ladder leaning on the cabinets.
            var wood = Palette.WoodWarm;
            foreach (float z in new[] { 26.35f, 26.85f })
            {
                Shapes.Rod("LadderSide", _static, new Vector3(5.2f, F + 0.08f, z), new Vector3(6.05f, F + 5f, z), 0.025f, wood);
                Metal(Shapes.Prim(PrimitiveType.Sphere, "LadderWheel", _static, new Vector3(5.2f, F + 0.06f, z), Vector3.one * 0.12f, Palette.Brass, false));
            }
            for (int i = 1; i < 16; i++)
            {
                float f = i / 16f;
                var p = Vector3.Lerp(new Vector3(5.2f, F + 0.08f, 0f), new Vector3(6.05f, F + 5f, 0f), f);
                Shapes.Rod("Rung", _static, new Vector3(p.x, p.y, 26.35f), new Vector3(p.x, p.y, 26.85f), 0.015f, wood);
            }

            // A second, purely decorative cabinet bank on the back wall (left of the pillar).
            for (int c = 0; c < 4; c++)
            {
                float xc = 1.5f + c * 1.3f;
                for (int r = 0; r < 4; r++)
                {
                    float yf = F + 0.3f + r * rowStep;
                    B("BackCabBoard", new Vector3(xc, yf, 23.45f), new Vector3(1.3f, 0.05f, 0.7f), Palette.TealDark);
                    Emissive(B("BackCabLight", new Vector3(xc, yf + 0.77f, 23.75f), new Vector3(1.1f, 0.02f, 0.03f), Warm, false), Warm, 2f);
                    var glass = B("BackCabGlass", new Vector3(xc, yf + 0.4f, 23.8f), new Vector3(1.2f, 0.76f, 0.01f), Palette.Glass);
                    glass.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
                    if ((c + r) % 3 != 1) FigureBuilder.Figurine(_static, new Vector3(xc, yf + 0.025f, 23.45f), 0f, 1f, _decorSeed++);
                }
                B("BackCabPost", new Vector3(xc - 0.65f, F + 1.9f, 23.45f), new Vector3(0.06f, 3.8f, 0.7f), Palette.TealDark);
            }
            B("BackCabPostEnd", new Vector3(6.25f, F + 1.9f, 23.45f), new Vector3(0.06f, 3.8f, 0.7f), Palette.TealDark);
            Emissive(B("BackCabBack", new Vector3(3.45f, F + 1.9f, 23.12f), new Vector3(5.2f, 3.8f, 0.03f), cream), new Color(1f, 0.8f, 0.55f), 0.15f);
            B("BackCabTop", new Vector3(3.45f, F + 3.85f, 23.45f), new Vector3(5.3f, 0.08f, 0.75f), Palette.TealDark);
        }

        /// <summary>Security desk with a live monitor, plus three hidden cameras (Security Cameras upgrade).</summary>
        static void BuildSecurity(Transform t)
        {
            const float F = Level.BasementFloorY;
            B("SecurityDeskBody", new Vector3(-3.9f, F + 0.375f, 37.4f), new Vector3(1.6f, 0.75f, 0.8f), Palette.WoodWarm);
            Lantern(new Vector3(-4.5f, F + 0.75f, 37.3f), false);
            var root = Shapes.Empty("SecurityDesk", t, new Vector3(-3.9f, F, 37.4f));
            Shapes.Box("MonitorCase", root.transform, new Vector3(0.1f, 1.02f, 0.2f), new Vector3(0.62f, 0.45f, 0.14f), new Color(0.12f, 0.12f, 0.12f));
            var screen = Shapes.Sign("MonitorScreen", root.transform, new Vector3(0.1f, 1.02f, 0.125f), Vector3.back, 0.54f, 0.34f, "label_snow");
            Shapes.Box("Keyboard", root.transform, new Vector3(0.1f, 0.765f, -0.15f), new Vector3(0.4f, 0.03f, 0.15f), new Color(0.2f, 0.2f, 0.2f), false);

            var props = Shapes.Empty("CameraProps", t, Vector3.zero);
            var specs = new[]
            {
                new[] { new Vector3(6.6f, 3.5f, 0.4f), new Vector3(0f, 0.8f, 6f) },
                new[] { new Vector3(6.6f, 3.3f, 13.4f), new Vector3(-2f, 0.6f, 19f) },
                new[] { new Vector3(-6.6f, 2.1f, 38.6f), new Vector3(3f, -3.5f, 27f) },
            };
            var cams = new Camera[specs.Length];
            for (int i = 0; i < specs.Length; i++)
            {
                var pos = specs[i][0];
                var rot = Quaternion.LookRotation(specs[i][1] - pos);
                var housing = Shapes.Empty("SecurityCam" + i, props.transform, pos).transform;
                housing.rotation = rot;
                Shapes.Box("Housing", housing, Vector3.zero, new Vector3(0.14f, 0.12f, 0.28f), new Color(0.85f, 0.85f, 0.82f), false);
                Emissive(Shapes.Prim(PrimitiveType.Sphere, "Led", housing, new Vector3(0.05f, 0.05f, 0.14f), Vector3.one * 0.025f, Palette.Bad, false), Palette.Bad, 3f);
                var camGo = Shapes.Empty("FeedCamera" + i, t, pos);
                camGo.transform.rotation = rot;
                var cam = camGo.AddComponent<Camera>();
                cam.fieldOfView = 75f;
                cam.nearClipPlane = 0.05f;
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = Color.black;
                cams[i] = cam;
            }
            props.SetActive(false);
            _level.SecurityDesk = root.AddComponent<SecurityDesk>();
            _level.SecurityDesk.Setup(screen.GetComponent<Renderer>(), props, cams, new[] { "Storefront", "Backroom", "Basement" });
            _level.AddLabel(new Vector3(-3.9f, F + 1.5f, 37.4f), "Security desk", 4f);
        }

        static void BuildDioramaTable(Vector3 floor)
        {
            // The dressing table from the painting: a tiny furnished room for "posing practice".
            float top = floor.y + 0.9f;
            B("DioramaTable", new Vector3(floor.x, top - 0.03f, floor.z), new Vector3(2.4f, 0.06f, 1.1f), Palette.TealDark);
            foreach (var o in new[] { new Vector2(-1.1f, -0.48f), new Vector2(1.1f, -0.48f), new Vector2(-1.1f, 0.48f), new Vector2(1.1f, 0.48f) })
                B("Leg", new Vector3(floor.x + o.x, floor.y + 0.43f, floor.z + o.y), new Vector3(0.08f, 0.86f, 0.08f), Palette.TealDark);
            B("LowerShelf", new Vector3(floor.x, floor.y + 0.25f, floor.z), new Vector3(2.3f, 0.04f, 1f), Palette.TealDark);
            for (int i = 0; i < 4; i++) B("ShelfCrate", new Vector3(floor.x - 0.8f + i * 0.55f, floor.y + 0.42f, floor.z), new Vector3(0.45f, 0.3f, 0.6f), Palette.WoodWarm);

            var c = new Vector3(floor.x - 0.2f, top, floor.z);
            B("MiniRug", c + new Vector3(0f, 0.003f, 0f), new Vector3(0.7f, 0.006f, 0.45f), new Color(0.5f, 0.15f, 0.12f), false);
            var green = new Color(0.25f, 0.4f, 0.32f);
            B("SofaSeat", c + new Vector3(0f, 0.04f, 0.14f), new Vector3(0.38f, 0.07f, 0.15f), green, false);
            B("SofaBack", c + new Vector3(0f, 0.1f, 0.21f), new Vector3(0.38f, 0.14f, 0.04f), green, false);
            B("SofaArmL", c + new Vector3(-0.19f, 0.07f, 0.14f), new Vector3(0.04f, 0.1f, 0.15f), green, false);
            B("SofaArmR", c + new Vector3(0.19f, 0.07f, 0.14f), new Vector3(0.04f, 0.1f, 0.15f), green, false);
            B("MiniTable", c + new Vector3(0f, 0.035f, -0.06f), new Vector3(0.16f, 0.06f, 0.1f), Palette.WoodWarm, false);
            B("Armchair", c + new Vector3(0.36f, 0.05f, -0.05f), new Vector3(0.14f, 0.1f, 0.14f), new Color(0.55f, 0.45f, 0.35f), false);
            B("Bookshelf", c + new Vector3(-0.45f, 0.15f, 0.2f), new Vector3(0.16f, 0.3f, 0.08f), Palette.WoodWarm, false);
            for (int i = 0; i < 3; i++) B("Books", c + new Vector3(-0.45f, 0.06f + i * 0.09f, 0.16f), new Vector3(0.13f, 0.06f, 0.01f), new[] { Palette.StoreTrim, Palette.Teal, Palette.Brass }[i], false);
            Metal(Shapes.Rod("MiniLampPole", _static, c + new Vector3(0.3f, 0f, 0.2f), c + new Vector3(0.3f, 0.2f, 0.2f), 0.006f, Palette.Brass));
            Emissive(Shapes.Prim(PrimitiveType.Cylinder, "MiniLampShade", _static, c + new Vector3(0.3f, 0.21f, 0.2f), new Vector3(0.07f, 0.03f, 0.07f), Warm, false), Warm, 2.5f);
            FigureBuilder.Figurine(_static, c + new Vector3(-0.05f, 0.075f, 0.12f), 180f, 1f, _decorSeed++, true);
            Lantern(new Vector3(floor.x + 1f, top, floor.z - 0.3f), true);
            DecorGlobe(_static, new Vector3(floor.x + 0.8f, top, floor.z + 0.3f), 0.7f, 180f);
        }

        static void BuildClothingTrays(Vector3 floor)
        {
            float top = floor.y + 0.8f;
            B("TrayTable", new Vector3(floor.x, floor.y + 0.4f, floor.z), new Vector3(4.9f, 0.8f, 0.9f), Palette.TealDark);
            string[] kinds = { "coats", "dresses", "hats", "scarves" };
            Color[][] cols =
            {
                new[] { Palette.Navy, new Color(0.55f, 0.15f, 0.15f), new Color(0.3f, 0.3f, 0.32f) },
                new[] { new Color(0.6f, 0.3f, 0.35f), new Color(0.35f, 0.4f, 0.55f), WallCream },
                new[] { Palette.Navy, new Color(0.2f, 0.35f, 0.3f), new Color(0.55f, 0.15f, 0.15f) },
                new[] { new Color(0.55f, 0.12f, 0.13f), new Color(0.72f, 0.55f, 0.2f), WallCream },
            };
            for (int k = 0; k < 4; k++)
            {
                var tc = new Vector3(floor.x - 1.8f + k * 1.1f, top, floor.z);
                B("Tray", tc + new Vector3(0f, 0.04f, 0f), new Vector3(1f, 0.08f, 0.75f), Palette.WoodWarm);
                Shapes.Sign("TrayLabel", _static, tc + new Vector3(0f, 0.04f, -0.38f), Vector3.back, 0.45f, 0.15f, "tray_" + kinds[k]);
                for (int i = 0; i < 12; i++)
                {
                    var p = tc + new Vector3(-0.36f + (i % 4) * 0.24f, 0.09f, -0.24f + (i / 4) * 0.24f);
                    var col = cols[k][i % 3];
                    switch (k)
                    {
                        case 0: B("Coat", p, new Vector3(0.12f, 0.02f, 0.16f), col, false); break;
                        case 1: Shapes.Prim(PrimitiveType.Sphere, "Dress", _static, p, new Vector3(0.12f, 0.025f, 0.16f), col, false); break;
                        case 2:
                            Shapes.Prim(PrimitiveType.Cylinder, "Hat", _static, p + Vector3.up * 0.01f, new Vector3(0.08f, 0.015f, 0.08f), col, false);
                            Shapes.Prim(PrimitiveType.Sphere, "HatTip", _static, p + Vector3.up * 0.04f, new Vector3(0.05f, 0.05f, 0.05f), col, false);
                            break;
                        default: B("Scarf", p, new Vector3(0.05f, 0.015f, 0.2f), col, false); break;
                    }
                }
            }
            Lantern(new Vector3(floor.x + 2.2f, top, floor.z + 0.1f), true);
            DecorGlobe(_static, new Vector3(floor.x + 2.2f, top, floor.z - 0.28f), 0.55f, 180f);
        }

        static void BuildCrateShelf()
        {
            const float F = Level.BasementFloorY;
            B("CrateShelfBoard", new Vector3(-6.55f, F + 0.9f, 36.3f), new Vector3(0.8f, 0.05f, 4.8f), Palette.TealDark);
            B("CrateShelfBoard", new Vector3(-6.55f, F + 1.9f, 36.3f), new Vector3(0.8f, 0.05f, 4.8f), Palette.TealDark);
            B("CrateShelfPost", new Vector3(-6.55f, F + 1.2f, 33.9f), new Vector3(0.8f, 2.4f, 0.06f), Palette.TealDark);
            B("CrateShelfPost", new Vector3(-6.55f, F + 1.2f, 38.7f), new Vector3(0.8f, 2.4f, 0.06f), Palette.TealDark);
            Crate(new Vector3(-6.6f, F, 35f), new Vector3(0.7f, 0.8f, 1.6f), "crate_winter", Vector3.right, 1f, 0.36f);
            Crate(new Vector3(-6.6f, F, 37.4f), new Vector3(0.7f, 0.8f, 1.6f), "crate_everyday", Vector3.right, 1f, 0.36f);
            Crate(new Vector3(-6.6f, F + 0.93f, 35f), new Vector3(0.7f, 0.85f, 1.6f), "crate_holiday", Vector3.right, 1f, 0.36f);
            Crate(new Vector3(-6.6f, F + 0.93f, 37.4f), new Vector3(0.7f, 0.85f, 1.6f), "crate_accessories", Vector3.right, 1f, 0.36f);
            for (int i = 0; i < 4; i++) B("SmallBox", new Vector3(-6.55f, F + 2.05f, 34.4f + i * 1.1f), new Vector3(0.5f, 0.25f, 0.7f), Palette.WoodWarm * 0.9f);
        }

        // =====================================================================================
        // helpers
        // =====================================================================================

        /// <summary>Static box under the batched root.</summary>
        static GameObject B(string name, Vector3 center, Vector3 size, Color color, bool collider = true)
        {
            return Shapes.Box(name, _static, center, size, color, collider);
        }

        static GameObject Glossy(GameObject go, float smoothness)
        {
            var r = go.GetComponent<Renderer>();
            var c = r.sharedMaterial.HasProperty("_BaseColor") ? r.sharedMaterial.GetColor("_BaseColor") : r.sharedMaterial.color;
            r.sharedMaterial = Shapes.Mat(c, 0f, false, smoothness);
            return go;
        }

        static GameObject Metal(GameObject go)
        {
            var r = go.GetComponent<Renderer>();
            var c = r.sharedMaterial.HasProperty("_BaseColor") ? r.sharedMaterial.GetColor("_BaseColor") : r.sharedMaterial.color;
            r.sharedMaterial = Shapes.Mat(c, 0f, false, 0.75f);
            return go;
        }

        static GameObject Emissive(GameObject go, Color color, float strength)
        {
            go.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(color, strength);
            return go;
        }

        static void Wainscot(Vector3 center, Vector3 size)
        {
            B("Wainscot", center, size, Palette.Teal, false);
            var capSize = new Vector3(size.x > size.z ? size.x : size.x + 0.02f, 0.04f, size.z > size.x ? size.z : size.z + 0.02f);
            Metal(B("WainscotCap", center + new Vector3(0f, size.y * 0.5f, 0f), capSize, Palette.Brass, false));
        }

        static void AddLight(string name, Vector3 pos, Color color, float intensity, float range, LightArea area, float flicker)
        {
            var light = Shapes.PointLight(name, _static, pos, color, intensity, range);
            var f = light.gameObject.AddComponent<FlickerLight>();
            f.Area = area;
            f.FlickerAmount = flicker;
            _level.Lights.Add(f);
        }

        /// <summary>Brass pendant lamp hanging from the ceiling, optionally with a real light.</summary>
        static void Pendant(Vector3 ceiling, float drop, bool withLight, float intensity, float range, LightArea area, float flicker)
        {
            var bulb = ceiling - Vector3.up * drop;
            Shapes.Rod("Cord", _static, ceiling, bulb + Vector3.up * 0.1f, 0.006f, Color.black);
            Metal(Shapes.Prim(PrimitiveType.Sphere, "Shade", _static, bulb + Vector3.up * 0.06f, new Vector3(0.36f, 0.16f, 0.36f), Palette.Brass, false));
            Emissive(Shapes.Prim(PrimitiveType.Sphere, "Bulb", _static, bulb, Vector3.one * 0.09f, Warm, false), Warm, 3f);
            if (withLight) AddLight("Pendant", bulb - Vector3.up * 0.1f, Warm, intensity, range, area, flicker);
        }

        static void TableLamp(Vector3 surface, bool withLight)
        {
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "LampBase", _static, surface + new Vector3(0f, 0.03f, 0f), new Vector3(0.14f, 0.03f, 0.14f), Palette.Brass, false));
            Metal(Shapes.Rod("LampStem", _static, surface, surface + Vector3.up * 0.35f, 0.012f, Palette.Brass));
            Emissive(Shapes.Prim(PrimitiveType.Cylinder, "LampShade", _static, surface + Vector3.up * 0.4f, new Vector3(0.26f, 0.09f, 0.26f), new Color(0.98f, 0.9f, 0.75f), false), new Color(1f, 0.85f, 0.6f), 1.2f);
            if (withLight) AddLight("TableLamp", surface + Vector3.up * 0.35f, Warm, 0.6f, 3.5f, LightArea.Store, 0f);
        }

        static void Lantern(Vector3 surface, bool withLight)
        {
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "LanternBase", _static, surface + new Vector3(0f, 0.02f, 0f), new Vector3(0.16f, 0.02f, 0.16f), Palette.Brass, false));
            Emissive(Shapes.Prim(PrimitiveType.Cylinder, "LanternGlass", _static, surface + new Vector3(0f, 0.14f, 0f), new Vector3(0.12f, 0.1f, 0.12f), Warm, false), Warm, 2.5f);
            Metal(Shapes.Prim(PrimitiveType.Sphere, "LanternCap", _static, surface + new Vector3(0f, 0.26f, 0f), new Vector3(0.16f, 0.08f, 0.16f), Palette.Brass, false));
            Metal(Shapes.Prim(PrimitiveType.Sphere, "LanternRing", _static, surface + new Vector3(0f, 0.32f, 0f), new Vector3(0.05f, 0.05f, 0.02f), Palette.Brass, false));
            if (withLight) AddLight("Lantern", surface + Vector3.up * 0.2f, Warm, 0.7f, 4f, LightArea.Basement, 0.08f);
        }

        /// <summary>A finished-looking snow globe prop with a still figurine inside.</summary>
        static void DecorGlobe(Transform parent, Vector3 pos, float scale, float yaw = 180f)
        {
            var root = Shapes.Empty("DecorGlobe", parent, pos).transform;
            root.localRotation = Quaternion.Euler(0f, yaw, 0f);
            root.localScale = Vector3.one * scale;
            Shapes.Prim(PrimitiveType.Cylinder, "Base", root, new Vector3(0f, 0.025f, 0f), new Vector3(0.33f, 0.025f, 0.33f), new Color(0.1f, 0.08f, 0.07f), false);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Band", root, new Vector3(0f, 0.045f, 0f), new Vector3(0.34f, 0.008f, 0.34f), Palette.Brass, false));
            Shapes.Prim(PrimitiveType.Cylinder, "Snow", root, new Vector3(0f, 0.058f, 0f), new Vector3(0.3f, 0.006f, 0.3f), Palette.Snow, false);
            int seed = _decorSeed++;
            FigureBuilder.Figurine(root, new Vector3(0f, 0.06f, 0f), 0f, 1f, seed);
            if (seed % 3 == 0)
                Shapes.Prim(PrimitiveType.Sphere, "Tree", root, new Vector3(0.09f, 0.12f, -0.05f), new Vector3(0.05f, 0.11f, 0.05f), new Color(0.12f, 0.38f, 0.22f), false);
            else if (seed % 3 == 1)
            {
                Shapes.Prim(PrimitiveType.Cylinder, "LampPost", root, new Vector3(-0.09f, 0.13f, -0.04f), new Vector3(0.008f, 0.07f, 0.008f), Color.black, false);
                Emissive(Shapes.Prim(PrimitiveType.Sphere, "LampGlow", root, new Vector3(-0.09f, 0.21f, -0.04f), Vector3.one * 0.02f, Warm, false), Warm, 3f);
            }
            var dome = Shapes.Prim(PrimitiveType.Sphere, "Dome", root, new Vector3(0f, 0.21f, 0f), Vector3.one * 0.34f, Palette.Glass, false);
            dome.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
        }

        /// <summary>The unsettling one from the storefront painting: a hand pressed flat against the glass.</summary>
        static void HandGlobe(Vector3 pos, float yaw)
        {
            var root = Shapes.Empty("HandGlobe", _static, pos).transform;
            root.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Shapes.Prim(PrimitiveType.Cylinder, "Base", root, new Vector3(0f, 0.025f, 0f), new Vector3(0.33f, 0.025f, 0.33f), new Color(0.1f, 0.08f, 0.07f), false);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "Band", root, new Vector3(0f, 0.045f, 0f), new Vector3(0.34f, 0.008f, 0.34f), Palette.Brass, false));
            Shapes.Prim(PrimitiveType.Cylinder, "Snow", root, new Vector3(0f, 0.058f, 0f), new Vector3(0.3f, 0.006f, 0.3f), Palette.Snow, false);
            var fig = Shapes.Empty("Figure", root, new Vector3(0f, 0.06f, 0.05f)).transform;
            var rig = FigureBuilder.Build(fig, FigureStyle.ForSeed(7, ArchetypeId.Watcher), true);
            rig.ArmR.localRotation = Quaternion.Euler(-150f, 0f, -10f);
            rig.ArmL.localRotation = Quaternion.Euler(-25f, 0f, 15f);
            rig.Head.localRotation = Quaternion.Euler(-12f, 0f, 0f);
            Shapes.Prim(PrimitiveType.Sphere, "Palm", root, new Vector3(0.02f, 0.25f, 0.155f), new Vector3(0.04f, 0.045f, 0.008f), new Color(0.97f, 0.86f, 0.78f), false);
            var dome = Shapes.Prim(PrimitiveType.Sphere, "Dome", root, new Vector3(0f, 0.21f, 0f), Vector3.one * 0.34f, Palette.Glass, false);
            dome.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
        }

        static void EmptyDome(Vector3 worldPos, float scale, Transform parent = null)
        {
            var root = Shapes.Empty("EmptyDome", parent != null ? parent : _static, Vector3.zero).transform;
            root.position = worldPos;
            root.localScale = Vector3.one * scale;
            var dome = Shapes.Prim(PrimitiveType.Sphere, "Dome", root, new Vector3(0f, 0.17f, 0f), Vector3.one * 0.34f, Palette.Glass, false);
            dome.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
        }

        static void Jar(Vector3 pos)
        {
            var jar = Shapes.Prim(PrimitiveType.Cylinder, "Jar", _static, pos + Vector3.up * 0.1f, new Vector3(0.14f, 0.1f, 0.14f), Palette.Glass, false);
            jar.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
            Shapes.Prim(PrimitiveType.Cylinder, "JarFill", _static, pos + Vector3.up * 0.07f, new Vector3(0.12f, 0.06f, 0.12f), Palette.Snow, false);
            Metal(Shapes.Prim(PrimitiveType.Cylinder, "JarLid", _static, pos + Vector3.up * 0.21f, new Vector3(0.15f, 0.015f, 0.15f), Palette.Brass, false));
        }

        static void GiftBox(Vector3 floorPos, float size, Color color)
        {
            B("GiftBox", floorPos + Vector3.up * size * 0.5f, new Vector3(size, size, size), color, false);
            Metal(B("Ribbon", floorPos + Vector3.up * size * 0.5f, new Vector3(size * 1.02f, size * 1.02f, size * 0.15f), Palette.Brass, false));
            Metal(B("Ribbon", floorPos + Vector3.up * size * 0.5f, new Vector3(size * 0.15f, size * 1.02f, size * 1.02f), Palette.Brass, false));
        }

        static void Plant(Vector3 floorPos, float height)
        {
            Shapes.Prim(PrimitiveType.Cylinder, "Pot", _static, floorPos + Vector3.up * height * 0.12f, new Vector3(height * 0.3f, height * 0.12f, height * 0.3f), Palette.Teal, false);
            for (int i = 0; i < 4; i++)
            {
                var off = new Vector3(Mathf.Sin(i * 1.7f) * height * 0.15f, height * (0.45f + i * 0.14f), Mathf.Cos(i * 1.7f) * height * 0.15f);
                Shapes.Prim(PrimitiveType.Sphere, "Leaves", _static, floorPos + off, Vector3.one * height * (0.42f - i * 0.05f), Palette.Foliage, false);
            }
        }

        static void Picture(Vector3 pos, Vector3 facing, float w, float h, string tex)
        {
            Metal(B("Frame", pos - facing * 0.015f, new Vector3(Mathf.Abs(facing.z) > 0.5f ? w + 0.1f : 0.03f, h + 0.1f, Mathf.Abs(facing.z) > 0.5f ? 0.03f : w + 0.1f), Palette.Brass, false));
            Shapes.Sign("Picture", _static, pos + facing * 0.005f, facing, w, h, tex);
        }

        static void Banner(Vector3 pos, Vector3 facing, float w, float h)
        {
            Shapes.Sign("Banner", _static, pos, facing, w, h, "banner_snowflake");
            var right = Vector3.Cross(Vector3.up, facing).normalized;
            Metal(Shapes.Rod("BannerRod", _static, pos + Vector3.up * (h * 0.5f + 0.03f) - right * (w * 0.6f), pos + Vector3.up * (h * 0.5f + 0.03f) + right * (w * 0.6f), 0.012f, Palette.Brass));
        }

        static void HangingBanner(Vector3 pos)
        {
            Banner(pos, Vector3.forward, 0.6f, 1.2f);
            Shapes.Sign("BannerBack", _static, pos, Vector3.back, 0.6f, 1.2f, "banner_snowflake");
            Shapes.Rod("BannerCord", _static, pos + Vector3.up * 0.63f, new Vector3(pos.x, 2.4f, pos.z), 0.005f, Color.black);
        }

        static void Crate(Vector3 floorPos, Vector3 size, string labelTex, Vector3 labelFacing, float labelW, float labelH)
        {
            var center = floorPos + Vector3.up * size.y * 0.5f;
            B("Crate", center, size, Palette.WoodWarm);
            B("CrateSlat", center + Vector3.up * size.y * 0.35f, new Vector3(size.x + 0.02f, 0.05f, size.z + 0.02f), Palette.WoodWarm * 0.8f, false);
            B("CrateSlat", center - Vector3.up * size.y * 0.35f, new Vector3(size.x + 0.02f, 0.05f, size.z + 0.02f), Palette.WoodWarm * 0.8f, false);
            float half = Mathf.Abs(labelFacing.x) > 0.5f ? size.x * 0.5f : size.z * 0.5f;
            Shapes.Sign("CrateLabel", _static, center + labelFacing * (half + 0.012f), labelFacing, labelW, labelH, labelTex);
        }

        static void Cart(Vector3 floorPos, float yaw, bool globes)
        {
            var root = Shapes.Empty("Cart", _static, floorPos).transform;
            root.localRotation = Quaternion.Euler(0f, yaw, 0f);
            foreach (float y in new[] { 0.3f, 0.85f }) Shapes.Box("CartShelf", root, new Vector3(0f, y, 0f), new Vector3(1f, 0.04f, 0.6f), Palette.TealDark);
            foreach (var o in new[] { new Vector2(-0.48f, -0.28f), new Vector2(0.48f, -0.28f), new Vector2(-0.48f, 0.28f), new Vector2(0.48f, 0.28f) })
            {
                Metal(Shapes.Rod("CartPost", root, new Vector3(o.x, 0.08f, o.y), new Vector3(o.x, 1f, o.y), 0.015f, Palette.Brass));
                Shapes.Prim(PrimitiveType.Sphere, "Wheel", root, new Vector3(o.x, 0.05f, o.y), Vector3.one * 0.1f, Color.black, false);
            }
            if (globes)
            {
                DecorGlobe(root, new Vector3(-0.25f, 0.87f, 0f), 0.7f, 180f);
                DecorGlobe(root, new Vector3(0.25f, 0.87f, 0f), 0.7f, 180f);
                DecorGlobe(root, new Vector3(0f, 0.32f, 0f), 0.75f, 180f);
            }
            else
            {
                Shapes.Box("CartCrate", root, new Vector3(-0.2f, 1.02f, 0f), new Vector3(0.45f, 0.3f, 0.45f), Palette.WoodWarm);
                Shapes.Box("CartCrate", root, new Vector3(0.25f, 0.47f, 0f), new Vector3(0.4f, 0.3f, 0.4f), Palette.WoodWarm);
            }
        }

        static void Stool(Vector3 floorPos)
        {
            Shapes.Prim(PrimitiveType.Cylinder, "StoolSeat", _static, floorPos + Vector3.up * 0.7f, new Vector3(0.38f, 0.03f, 0.38f), Palette.WoodWarm);
            for (int i = 0; i < 3; i++)
            {
                float a = i * 2.094f;
                Metal(Shapes.Rod("StoolLeg", _static, floorPos + new Vector3(Mathf.Sin(a) * 0.2f, 0f, Mathf.Cos(a) * 0.2f), floorPos + new Vector3(Mathf.Sin(a) * 0.12f, 0.68f, Mathf.Cos(a) * 0.12f), 0.015f, Palette.Brass));
            }
        }

        static void Rib(float z)
        {
            const float baseY = 1.3f, rise = 1.05f;
            Vector3 prev = new Vector3(-7f, baseY, z);
            for (int i = 1; i <= 6; i++)
            {
                float x = -7f + i * (14f / 6f);
                var p = new Vector3(x, baseY + rise * (1f - (x / 7f) * (x / 7f)), z);
                var d = p - prev;
                var seg = B("VaultRib", (prev + p) * 0.5f, new Vector3(d.magnitude + 0.05f, 0.18f, 0.3f), Palette.TealDark, false);
                seg.transform.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
                prev = p;
            }
        }

        /// <summary>A station: interactive root with a table, a snap socket and a status light.</summary>
        static T Station<T>(Transform parent, string title, StationId id, Vector3 pos, float yaw, Vector3 tableSize, Vector3 socketOffset) where T : StationBase
        {
            var root = Shapes.Empty(title, parent, pos);
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            Shapes.Box("Table", root.transform, new Vector3(0f, tableSize.y * 0.5f, 0f), tableSize, Palette.TealDark);
            Metal(Shapes.Box("TableTop", root.transform, new Vector3(0f, tableSize.y - 0.01f, 0f), new Vector3(tableSize.x + 0.04f, 0.03f, tableSize.z + 0.04f), Palette.Brass, false));
            var socketGo = Shapes.Empty("Socket", root.transform, new Vector3(socketOffset.x, tableSize.y + 0.005f, socketOffset.z));
            var socket = socketGo.AddComponent<SnapSocket>();
            socket.Radius = 0.45f;
            var status = Shapes.Prim(PrimitiveType.Sphere, "StatusLight", root.transform, new Vector3(tableSize.x * 0.5f - 0.08f, tableSize.y + 0.05f, -(tableSize.z * 0.5f - 0.08f)), Vector3.one * 0.08f, Palette.Idle, false);
            var station = root.AddComponent<T>();
            station.Setup(id, title, socket, status.GetComponent<Renderer>());
            return station;
        }

        /// <summary>
        /// Hinged door. baseYaw orients the closed door; the Door component rotates the hinge
        /// relative to that. Glass doors get a brass frame and a see-through pane.
        /// </summary>
        static Door MakeDoor(Transform parent, string name, Vector3 hingePos, float baseYaw, float width, float height, Color color, string label, bool glass, float thickness = 0.06f)
        {
            var baseGo = Shapes.Empty(name + "Base", parent, hingePos);
            baseGo.transform.localRotation = Quaternion.Euler(0f, baseYaw, 0f);
            var hinge = Shapes.Empty(name, baseGo.transform, Vector3.zero);
            if (!glass)
            {
                Shapes.Box("Panel", hinge.transform, new Vector3(width * 0.5f, height * 0.5f, 0f), new Vector3(width, height, thickness), color);
                Metal(Shapes.Prim(PrimitiveType.Sphere, "Knob", hinge.transform, new Vector3(width - 0.12f, Mathf.Min(1f, height * 0.5f), 0.05f), Vector3.one * 0.07f, Palette.Brass, false));
            }
            else
            {
                float frame = Mathf.Min(0.08f, width * 0.07f);
                Shapes.Box("StileL", hinge.transform, new Vector3(frame * 0.5f, height * 0.5f, 0f), new Vector3(frame, height, thickness), color, false);
                Shapes.Box("StileR", hinge.transform, new Vector3(width - frame * 0.5f, height * 0.5f, 0f), new Vector3(frame, height, thickness), color, false);
                Shapes.Box("RailTop", hinge.transform, new Vector3(width * 0.5f, height - frame * 0.5f, 0f), new Vector3(width, frame, thickness), color, false);
                float kick = height > 1.5f ? 0.5f : frame;
                Shapes.Box("RailBottom", hinge.transform, new Vector3(width * 0.5f, kick * 0.5f, 0f), new Vector3(width, kick, thickness), color, false);
                var pane = Shapes.Box("Glass", hinge.transform, new Vector3(width * 0.5f, height * 0.5f, 0f), new Vector3(width, height, thickness * 0.5f), Palette.Glass);
                pane.GetComponent<Renderer>().sharedMaterial = Shapes.Mat(Palette.Glass, 0f, true, 0.9f);
                Metal(Shapes.Prim(PrimitiveType.Sphere, "Knob", hinge.transform, new Vector3(width - frame * 1.5f, Mathf.Min(1f, height * 0.5f), thickness), Vector3.one * Mathf.Min(0.07f, height * 0.06f), Palette.Brass, false));
            }
            var door = hinge.AddComponent<Door>();
            door.Label = label;
            return door;
        }

        /// <summary>Freight lift gate: iron bars on a hinge, swinging out into the basement.</summary>
        static Door MakeGate(Transform parent, Vector3 hingePos, float width, float height)
        {
            var baseGo = Shapes.Empty("LiftGateBase", parent, hingePos);
            var hinge = Shapes.Empty("LiftGate", baseGo.transform, Vector3.zero);
            var blocker = Shapes.Box("GateCollider", hinge.transform, new Vector3(width * 0.5f, height * 0.5f, 0f), new Vector3(width, height, 0.05f), Color.black);
            blocker.GetComponent<Renderer>().enabled = false;
            var iron = new Color(0.15f, 0.14f, 0.13f);
            for (int i = 0; i < 14; i++) Shapes.Box("Bar", hinge.transform, new Vector3(0.08f + i * (width - 0.16f) / 13f, height * 0.5f, 0f), new Vector3(0.025f, height, 0.025f), iron, false);
            foreach (float y in new[] { 0.08f, height * 0.5f, height - 0.08f })
                Metal(Shapes.Box("GateRail", hinge.transform, new Vector3(width * 0.5f, y, 0f), new Vector3(width, 0.05f, 0.04f), Palette.Brass, false));
            var door = hinge.AddComponent<Door>();
            door.Label = "freight lift gate";
            return door;
        }
    }
}
