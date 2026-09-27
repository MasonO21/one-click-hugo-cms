using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Placeholder IMGUI interface. Information is drawn near the object it describes
    /// (station status, serum timers, customer suspicion); the corner panel only holds
    /// cash, day, supplies and exposure. Any modal panel pauses the game.
    /// </summary>
    public sealed class Hud : MonoBehaviour
    {
        struct Line
        {
            public string Text;
            public float Until;
            public bool Bad;
        }

        enum Tab { Supplies, Upgrades, SaveLoad, Settings, Help }

        readonly List<Line> _toasts = new List<Line>();
        readonly List<Line> _subtitles = new List<Line>();
        readonly List<Line> _alerts = new List<Line>();

        bool _title, _menu, _paused, _summary, _briefing;
        bool _hasSave;
        Tab _tab;
        DaySummary _lastSummary;
        string _briefingTitle = "", _briefingText = "";
        Vector2 _scroll;
        GUIStyle _label, _center, _big, _small, _box;

        static GameRoot Root { get { return GameRoot.I; } }

        public bool AnyModal { get { return _title || _menu || _paused || _summary || _briefing; } }

        public void ShowTitle(bool hasSave)
        {
            _title = true;
            _hasSave = hasSave;
        }

        public void ShowBriefing(string title, string text)
        {
            _briefing = true;
            _briefingTitle = title;
            _briefingText = text;
        }

        public void ShowSummary(DaySummary summary)
        {
            _lastSummary = summary;
            _summary = true;
        }

        /// <summary>Re-open the end-of-day panel (idempotent: bills are charged only once).</summary>
        public void ShowSummary()
        {
            if (Root.Session.State.Day.Phase != DayPhase.AfterClosing) return;
            ShowSummary(Root.Session.Days.CloseStore());
        }

        public void Toast(string text, bool bad)
        {
            _toasts.Add(new Line { Text = text, Until = Time.unscaledTime + 4f, Bad = bad });
            if (_toasts.Count > 4) _toasts.RemoveAt(0);
        }

        public void Subtitle(string speaker, string text)
        {
            if (!Settings.Subtitles || string.IsNullOrEmpty(text)) return;
            _subtitles.Add(new Line { Text = string.IsNullOrEmpty(speaker) ? text : speaker + ": " + text, Until = Time.unscaledTime + 4.5f });
            if (_subtitles.Count > 3) _subtitles.RemoveAt(0);
        }

        public void Alert(string text)
        {
            _alerts.Add(new Line { Text = text, Until = Time.unscaledTime + 6f, Bad = true });
            if (_alerts.Count > 4) _alerts.RemoveAt(0);
            if (Root != null && Root.Audio != null) Root.Audio.Play2D(Sfx.Tick, 0.5f);
        }

        void Update()
        {
            if (Root == null || Root.Player == null) return;
            bool lockedToStation = Root.Interactor.LockedStation != null;
            if (!_title && !_summary && !_briefing)
            {
                if (GameInput.MenuDown && !lockedToStation) { _menu = !_menu; _paused = false; }
                else if (GameInput.PauseDown && !lockedToStation)
                {
                    if (_menu) _menu = false;
                    else _paused = !_paused;
                }
            }
            if (_briefing && (GameInput.InteractDown || GameInput.PauseDown)) _briefing = false;
            Time.timeScale = AnyModal ? 0f : 1f;
            Root.Player.CursorFree = AnyModal;
            Prune(_toasts);
            Prune(_subtitles);
            Prune(_alerts);
        }

        static void Prune(List<Line> lines)
        {
            for (int i = lines.Count - 1; i >= 0; i--) if (lines[i].Until < Time.unscaledTime) lines.RemoveAt(i);
        }

        void Styles()
        {
            if (_label != null) return;
            _label = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true, richText = true };
            _label.normal.textColor = Color.white;
            _center = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter };
            _big = new GUIStyle(_center) { fontSize = 28, fontStyle = FontStyle.Bold };
            _small = new GUIStyle(_center) { fontSize = 12 };
            _box = new GUIStyle(GUI.skin.box) { fontSize = 14, alignment = TextAnchor.UpperLeft, richText = true, wordWrap = true };
            _box.normal.textColor = Color.white;
        }

        void OnGUI()
        {
            if (Root == null || Root.Session == null) return;
            Styles();
            if (_title) { DrawTitle(); return; }

            DrawWorldLabels();
            DrawCornerPanel();
            DrawAlerts();
            DrawPrompts();
            DrawToastsAndSubtitles();
            var station = Root.Interactor.LockedStation;
            if (station != null) station.DrawGUI();

            if (_summary) DrawSummary();
            else if (_briefing) DrawBriefing();
            else if (_menu) DrawMenu();
            else if (_paused) DrawPause();
        }

        // ------------------------------------------------------------ world-anchored info

        bool ToScreen(Vector3 world, out Vector2 screen)
        {
            var cam = Root.Player.Camera;
            var sp = cam.WorldToScreenPoint(world);
            screen = new Vector2(sp.x, Screen.height - sp.y);
            return sp.z > 0.1f;
        }

        void Label(Vector3 world, string text, float maxDist, Color color, float width = 260f)
        {
            var cam = Root.Player.Camera.transform.position;
            if (Vector3.Distance(cam, world) > maxDist) return;
            Vector2 s;
            if (!ToScreen(world, out s)) return;
            var content = new GUIContent(text);
            float h = _small.CalcHeight(content, width);
            var r = new Rect(s.x - width * 0.5f, s.y - h, width, h);
            GUI.color = new Color(0f, 0f, 0f, 0.55f);
            GUI.DrawTexture(r, Texture2D.whiteTexture);
            GUI.color = color;
            GUI.Label(r, content, _small);
            GUI.color = Color.white;
        }

        void DrawWorldLabels()
        {
            foreach (var l in Root.Level.Labels) Label(l.Position, l.Text, l.MaxDistance, new Color(1f, 0.95f, 0.85f));
            foreach (var st in Root.Level.Stations) Label(st.transform.position + Vector3.up * 1.35f, st.Status(), 4.5f, Color.white);

            foreach (var v in Root.Views.Values)
            {
                if (v == null || v.P == null) continue;
                var p = v.P;
                if (p.IsSerumActive)
                {
                    bool low = p.SerumRemaining < GameBalance.SerumWarningSeconds;
                    Label(v.transform.position + Vector3.up * 0.4f, "Serum " + Mathf.CeilToInt(p.SerumRemaining) + "s", 8f, low ? Palette.Bad : Palette.Serum, 90f);
                }
                else if (p.Stage >= ProductStage.Sealed && p.Stage <= ProductStage.Displayed && Root.Interactor.FocusProduct == v)
                {
                    string est = "$" + QualityModel.EstimateValue(p) + " · " + QualityModel.Tier(QualityModel.Compute(p)) + (p.Certified ? " · certified" : " · not inspected");
                    Label(v.transform.position + Vector3.up * 0.45f, est, 3f, Palette.WarmLight, 220f);
                }
                if (v.IsEscaped) Label(v.transform.position + Vector3.up * 0.35f, "LOOSE", 12f, Palette.Bad, 60f);
            }

            foreach (var c in Root.Customers.Active)
            {
                if (c == null) continue;
                var stage = c.Suspicion.Stage;
                string icon = stage == SuspicionStage.Comfortable ? "" : stage == SuspicionStage.Curious ? "?" : stage == SuspicionStage.Investigating ? "??" : "!";
                Color col = stage == SuspicionStage.Comfortable ? Palette.Ok : stage == SuspicionStage.Curious ? Palette.Busy : stage == SuspicionStage.Investigating ? new Color(1f, 0.55f, 0.1f) : Palette.Bad;
                Vector2 s;
                if (!ToScreen(c.Head.position + Vector3.up * 0.35f, out s)) continue;
                if (Vector3.Distance(Root.Player.Camera.transform.position, c.Head.position) > 14f) continue;
                var bar = new Rect(s.x - 40f, s.y, 80f, 8f);
                GUI.color = new Color(0f, 0f, 0f, 0.6f);
                GUI.DrawTexture(bar, Texture2D.whiteTexture);
                GUI.color = col;
                GUI.DrawTexture(new Rect(bar.x + 1f, bar.y + 1f, 78f * c.Suspicion.Value / 100f, 6f), Texture2D.whiteTexture);
                GUI.color = Color.white;
                if (icon.Length > 0)
                {
                    GUI.color = col;
                    GUI.Label(new Rect(s.x - 30f, s.y - 34f, 60f, 32f), icon, _big);
                    GUI.color = Color.white;
                }
                if (Time.time < c.SpeechUntil) Label(c.Head.position + Vector3.up * 0.75f, "\"" + c.Speech + "\"", 14f, Color.white, 240f);
            }
        }

        // ------------------------------------------------------------ fixed HUD

        void DrawCornerPanel()
        {
            var s = Root.Session;
            var st = s.State;
            string phase = st.Day.Phase == DayPhase.BeforeOpening ? "Before opening" : st.Day.Phase == DayPhase.Open ? (Root.ClosingRequested ? "Closing" : "OPEN") : "Closed";
            string text = "<b>Day " + st.Day.Day + "</b> · " + phase + " · " + s.Days.ClockText +
                          "\n<b>$" + st.Wallet.Cash + "</b>" + (st.Wallet.Debt > 0 ? "  (owed $" + st.Wallet.Debt + ")" : "") +
                          "\nKits " + st.Inventory.GlobeKits + " · Serum " + st.Inventory.SerumCharges + " · Boxes " + st.Inventory.PackagingBoxes +
                          "\nHolding " + s.HoldingCount() + " · On display " + s.Store.DisplayedCount() + "/" + st.ShelfCapacity +
                          (s.PowerAvailable ? "" : "\n<color=#ff5544><b>POWER OUT</b></color>");
            var r = new Rect(12f, 12f, 290f, s.PowerAvailable ? 92f : 112f);
            GUI.Box(r, text, _box);
            // Exposure meter.
            var bar = new Rect(12f, r.yMax + 4f, 290f, 16f);
            GUI.color = new Color(0f, 0f, 0f, 0.6f);
            GUI.DrawTexture(bar, Texture2D.whiteTexture);
            GUI.color = Color.Lerp(Palette.Ok, Palette.Bad, st.Exposure.Value / 100f);
            GUI.DrawTexture(new Rect(bar.x + 2f, bar.y + 2f, (bar.width - 4f) * st.Exposure.Value / 100f, bar.height - 4f), Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.Label(new Rect(bar.x, bar.y - 2f, bar.width, 20f), "Exposure: " + st.Exposure.Level, _small);
            GUI.Label(new Rect(12f, bar.yMax + 2f, 290f, 20f), "Tab: management · Esc: pause", _small);
        }

        void DrawAlerts()
        {
            float y = 12f;
            var waiting = Root.Customers.WaitingAtCounter;
            if (waiting != null)
            {
                GUI.Box(new Rect(Screen.width - 352f, y, 340f, 26f), "<color=#ffcc44>Customer waiting at the counter</color>", _box);
                y += 30f;
            }
            int loose = Root.Horror.LooseCount();
            if (loose > 0)
            {
                GUI.Box(new Rect(Screen.width - 352f, y, 340f, 26f), "<color=#ff5544>" + loose + " character(s) loose!</color>", _box);
                y += 30f;
            }
            foreach (var a in _alerts)
            {
                var content = new GUIContent(a.Text);
                float h = _box.CalcHeight(content, 340f);
                GUI.Box(new Rect(Screen.width - 352f, y, 340f, h), a.Text, _box);
                y += h + 4f;
            }
        }

        void DrawPrompts()
        {
            if (AnyModal) return;
            float cx = Screen.width * 0.5f, cy = Screen.height * 0.5f;
            GUI.DrawTexture(new Rect(cx - 2f, cy - 2f, 4f, 4f), Texture2D.whiteTexture);
            var i = Root.Interactor;
            float y = cy + 24f;
            foreach (var text in new[] { i.PrimaryPrompt, i.SecondaryPrompt, i.CarryPrompt })
            {
                if (string.IsNullOrEmpty(text)) continue;
                GUI.color = new Color(0f, 0f, 0f, 0.5f);
                GUI.DrawTexture(new Rect(cx - 330f, y, 660f, 24f), Texture2D.whiteTexture);
                GUI.color = Color.white;
                GUI.Label(new Rect(cx - 330f, y, 660f, 24f), text, _center);
                y += 26f;
            }
        }

        void DrawToastsAndSubtitles()
        {
            float y = Screen.height * 0.25f;
            foreach (var t in _toasts)
            {
                GUI.color = t.Bad ? new Color(1f, 0.6f, 0.5f) : Color.white;
                GUI.Label(new Rect(Screen.width * 0.5f - 300f, y, 600f, 24f), t.Text, _center);
                y += 24f;
            }
            GUI.color = Color.white;
            float sy = Screen.height - 40f - _subtitles.Count * 26f;
            foreach (var s in _subtitles)
            {
                var r = new Rect(Screen.width * 0.5f - 380f, sy, 760f, 24f);
                GUI.color = new Color(0f, 0f, 0f, 0.65f);
                GUI.DrawTexture(r, Texture2D.whiteTexture);
                GUI.color = Color.white;
                GUI.Label(r, s.Text, _center);
                sy += 26f;
            }
        }

        // ------------------------------------------------------------ modal panels

        static Rect Centered(float w, float h) { return new Rect((Screen.width - w) * 0.5f, (Screen.height - h) * 0.5f, w, h); }

        void DrawTitle()
        {
            var full = new Rect(0f, 0f, Screen.width, Screen.height);
            var art = Shapes.Tex("title_storefront");
            if (art != null) GUI.DrawTexture(full, art, ScaleMode.ScaleAndCrop);
            GUI.color = new Color(0.03f, 0.04f, 0.08f, art != null ? 0.55f : 0.85f);
            GUI.DrawTexture(Centered(620f, 420f), Texture2D.whiteTexture);
            if (art == null) GUI.DrawTexture(full, Texture2D.whiteTexture);
            GUI.color = Color.white;
            var r = Centered(520f, 360f);
            GUILayout.BeginArea(r);
            GUILayout.Label("Little Lives", _big);
            GUILayout.Label("SNOW GLOBE FACTORY", _center);
            GUILayout.Space(10f);
            GUILayout.Label("Every figurine is posed by hand. Every figurine is alive.\n(A prototype. Placeholder art. Keyboard + mouse.)", _center);
            GUILayout.Space(20f);
            if (GUILayout.Button("New game", GUILayout.Height(36f))) { _title = false; Root.StartNewGame(); }
            GUI.enabled = _hasSave;
            if (GUILayout.Button("Continue", GUILayout.Height(36f)) && Root.LoadFrom(Root.Saves.SavePath)) _title = false;
            GUI.enabled = true;
            GUILayout.Space(10f);
            GUILayout.Label("The Stillness Serum and stasis seals are fictional devices. No gore.", _small);
            GUILayout.EndArea();
        }

        void DrawBriefing()
        {
            var r = Centered(560f, 300f);
            GUI.Box(r, "");
            GUILayout.BeginArea(new Rect(r.x + 20f, r.y + 16f, r.width - 40f, r.height - 32f));
            GUILayout.Label(_briefingTitle, _big);
            GUILayout.Space(8f);
            GUILayout.Label(_briefingText, _label);
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Get to work (E)", GUILayout.Height(32f))) _briefing = false;
            GUILayout.EndArea();
        }

        void DrawSummary()
        {
            var s = _lastSummary;
            var r = Centered(480f, 420f);
            GUI.Box(r, "");
            GUILayout.BeginArea(new Rect(r.x + 20f, r.y + 16f, r.width - 40f, r.height - 32f));
            GUILayout.Label("End of day " + s.Day, _big);
            GUILayout.Label(
                "Globes produced: " + s.GlobesProduced + "\nGlobes sold: " + s.GlobesSold + "\nCustomers lost: " + s.CustomersLost +
                "\nKits ruined (woke up): " + s.KitsRuined +
                "\n\nRevenue: $" + s.Revenue + "\nPurchases: -$" + s.Expenses + "\nOperating cost: -$" + s.OperatingCost +
                (s.Refunds > 0 ? "\nRefunds (returned globes): -$" + s.Refunds : "") + "\n<b>Net: $" + s.Net + "</b>" +
                "\n\nBusiness exposure: " + Mathf.RoundToInt(s.Exposure) + "/100 (" + s.ExposureLevel + ")", _label);
            if (s.Verdict == ClosureVerdict.Warning)
                GUILayout.Label("<color=#ffaa33><b>WARNING:</b> an inspector has been asking questions. Another bad day and they'll shut you down.</color>", _label);
            GUILayout.FlexibleSpace();
            if (s.Verdict == ClosureVerdict.Closure)
            {
                GUILayout.Label("<color=#ff5544><b>The shop has been closed pending an investigation.</b></color>", _label);
                if (GUILayout.Button("Recover: reload this morning's checkpoint", GUILayout.Height(32f)))
                {
                    _summary = false;
                    Root.LoadFrom(Root.Saves.CheckpointPath);
                }
            }
            else
            {
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Management (upgrades)", GUILayout.Height(32f))) { _summary = false; _menu = true; _tab = Tab.Upgrades; }
                if (GUILayout.Button("Save", GUILayout.Height(32f))) Root.SaveGame();
                if (GUILayout.Button("Start day " + (s.Day + 1), GUILayout.Height(32f))) { _summary = false; Root.StartNextDay(); }
                GUILayout.EndHorizontal();
            }
            GUILayout.EndArea();
        }

        void DrawPause()
        {
            var r = Centered(320f, 260f);
            GUI.Box(r, "Paused");
            GUILayout.BeginArea(new Rect(r.x + 20f, r.y + 30f, r.width - 40f, r.height - 40f));
            if (GUILayout.Button("Resume", GUILayout.Height(30f))) _paused = false;
            if (GUILayout.Button("Save (F5)", GUILayout.Height(30f))) Root.SaveGame();
            if (GUILayout.Button("Load save (F9)", GUILayout.Height(30f))) { _paused = false; Root.LoadFrom(Root.Saves.SavePath); }
            if (GUILayout.Button("Settings", GUILayout.Height(30f))) { _paused = false; _menu = true; _tab = Tab.Settings; }
            if (GUILayout.Button("Quit", GUILayout.Height(30f))) Application.Quit();
            GUILayout.EndArea();
        }

        void DrawMenu()
        {
            var r = Centered(640f, 480f);
            GUI.Box(r, "");
            GUILayout.BeginArea(new Rect(r.x + 14f, r.y + 10f, r.width - 28f, r.height - 20f));
            _tab = (Tab)GUILayout.Toolbar((int)_tab, new[] { "Supplies", "Upgrades", "Save / Load", "Settings", "Help" });
            GUILayout.Space(6f);
            _scroll = GUILayout.BeginScrollView(_scroll);
            switch (_tab)
            {
                case Tab.Supplies: DrawSupplies(); break;
                case Tab.Upgrades: DrawUpgrades(); break;
                case Tab.SaveLoad: DrawSaveLoad(); break;
                case Tab.Settings: DrawSettings(); break;
                default: DrawHelp(); break;
            }
            GUILayout.EndScrollView();
            if (GUILayout.Button("Close (Tab)", GUILayout.Height(28f))) _menu = false;
            GUILayout.EndArea();
        }

        void DrawSupplies()
        {
            var s = Root.Session;
            var inv = s.State.Inventory;
            GUILayout.Label("Cash: <b>$" + s.State.Wallet.Cash + "</b>" + (s.State.Wallet.Debt > 0 ? "   Owed to supplier: $" + s.State.Wallet.Debt + " (half of each sale repays it)" : ""), _label);
            GUILayout.Label("A standard globe costs $20 to make (character $8, kit $7, serum $2, box $3) and sells for about $40.", _label);
            SupplyRow("Globe kit (base, scenery, snow, dome)", SupplyItem.GlobeKit, inv.GlobeKits);
            SupplyRow("Stillness Serum charge (fictional)", SupplyItem.SerumCharge, inv.SerumCharges);
            SupplyRow("Packaging box", SupplyItem.PackagingBox, inv.PackagingBoxes);
            GUILayout.Space(8f);
            GUILayout.Label("<b>Characters</b> — delivered to the basement hatch shortly after ordering.", _label);
            foreach (var def in ArchetypeCatalog.All)
            {
                GUILayout.BeginHorizontal();
                bool unlocked = def.UnlockDay <= s.State.Day.Day;
                GUILayout.Label(def.DisplayName + " — sells ~$" + def.BaseSaleValue + (unlocked ? "\n<size=11>" + def.Description + "</size>" : "\n<size=11>Supplier offers these from day " + def.UnlockDay + ".</size>"), _label, GUILayout.Width(440f));
                GUI.enabled = unlocked;
                if (GUILayout.Button("Order $" + def.AcquisitionCost, GUILayout.Width(120f))) Root.Toast(s.Supply.OrderCharacter(def.Id).Message);
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            if (s.Supply.CanRequestEmergencyOrder())
            {
                GUILayout.Space(8f);
                GUILayout.Label("<color=#ffcc44>You can't afford a production run and have nothing to sell.</color>", _label);
                if (GUILayout.Button("Request emergency supply order (repaid from future sales)")) Root.Toast(s.Supply.RequestEmergencyOrder().Message);
            }
        }

        void SupplyRow(string label, SupplyItem item, int have)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label(label + "  (have " + have + ")", _label, GUILayout.Width(360f));
            int cost = SupplyService.UnitCost(item);
            if (GUILayout.Button("+1 ($" + cost + ")", GUILayout.Width(100f))) Root.Toast(Root.Session.Supply.Buy(item, 1).Message);
            if (GUILayout.Button("+5 ($" + cost * 5 + ")", GUILayout.Width(100f))) Root.Toast(Root.Session.Supply.Buy(item, 5).Message);
            GUILayout.EndHorizontal();
        }

        void DrawUpgrades()
        {
            var s = Root.Session;
            bool open = s.State.Day.Phase == DayPhase.Open;
            GUILayout.Label(open ? "<color=#ffcc44>Installers only come while the shop is closed.</color>" : "Cash: <b>$" + s.State.Wallet.Cash + "</b>", _label);
            foreach (var def in UpgradeCatalog.All)
            {
                bool owned = s.Upgrades.Owns(def.Id);
                GUILayout.BeginHorizontal(GUI.skin.box);
                GUILayout.Label("<b>" + def.Name + "</b>  $" + def.Cost + "  <size=11>[" + def.Category + "]</size>\n<size=12>Solves: " + def.Solves + "\nTrade-off: " + def.Tradeoff + "</size>", _label, GUILayout.Width(440f));
                string status;
                bool can = false;
                if (owned) status = "Installed";
                else if (!def.PrototypeFunctional) status = "Planned";
                else if (def.UnlockDay > s.State.Day.Day) status = "Day " + def.UnlockDay;
                else { status = "Buy"; can = !open; }
                GUI.enabled = can;
                if (GUILayout.Button(status, GUILayout.Width(120f), GUILayout.Height(44f))) Root.Toast(s.Upgrades.Purchase(def.Id).Message);
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            var m = s.State.Modifiers;
            GUILayout.Label("Power draw: " + m.PowerDraw + "/" + GameBalance.BasePowerCapacity + (m.IsOverPowered ? "  <color=#ff5544>(overloaded — power failures more likely)</color>" : ""), _label);
        }

        void DrawSaveLoad()
        {
            string reason;
            bool canSave = Root.Session.CanSave(out reason);
            GUILayout.Label(canSave ? "Saving is available." : "<color=#ffcc44>" + reason + "</color>", _label);
            GUI.enabled = canSave;
            if (GUILayout.Button("Save game", GUILayout.Height(30f))) Root.SaveGame();
            GUI.enabled = true;
            if (GUILayout.Button("Load save", GUILayout.Height(30f))) { _menu = false; Root.LoadFrom(Root.Saves.SavePath); }
            if (GUILayout.Button("Load this morning's checkpoint", GUILayout.Height(30f))) { _menu = false; Root.LoadFrom(Root.Saves.CheckpointPath); }
            GUILayout.Space(12f);
            if (GUILayout.Button("Start a new game", GUILayout.Height(30f))) { _menu = false; Root.StartNewGame(); }
            GUILayout.Label("Saves: " + Root.Saves.SavePath, _small);
        }

        void DrawSettings()
        {
            Settings.Subtitles = GUILayout.Toggle(Settings.Subtitles, " Subtitles for sounds and speech");
            Settings.ReducedFlicker = GUILayout.Toggle(Settings.ReducedFlicker, " Reduced flickering lights");
            GUILayout.Label("Camera shake: " + Mathf.RoundToInt(Settings.CameraShake * 100f) + "%", _label);
            Settings.CameraShake = GUILayout.HorizontalSlider(Settings.CameraShake, 0f, 1f);
            GUILayout.Label("Mouse sensitivity: " + Settings.MouseSensitivity.ToString("0.0"), _label);
            Settings.MouseSensitivity = GUILayout.HorizontalSlider(Settings.MouseSensitivity, 0.3f, 6f);
            GUILayout.Label("Music volume: " + Mathf.RoundToInt(Settings.MusicVolume * 100f) + "%", _label);
            Settings.MusicVolume = GUILayout.HorizontalSlider(Settings.MusicVolume, 0f, 1f);
            if (GUILayout.Button("Save settings", GUILayout.Height(28f))) { Settings.Save(); Root.Toast("Settings saved."); }
        }

        void DrawHelp()
        {
            GUILayout.Label(
                "<b>Controls</b>\nWASD move · Shift walk faster · Mouse look\nLMB pick up / place (releasing near a valid spot snaps it in)\n" +
                "E interact / station action · X secondary (reject, offer exchange)\nQ re-dose serum on a prepared character\nRMB + mouse rotate held item · F hold item close to inspect\n" +
                "Tab management · Esc pause / step away from a station · F5 save · F9 load\n\n" +
                "<b>The line</b>\n1. Basement pen → carry an awake character up to the Preparation Cradle.\n2. Cradle: time the injection (Stillness Serum starts a countdown).\n" +
                "3. Assembly: pose + face front, pick scenery (1-3), pour snow into the band.\n4. Sealer: drop the dome when centred, then seal (before the serum runs out!).\n" +
                "5. Inspection (optional): scan under the lamp. Certified globes are worth +10%; X rejects a bad one.\n6. Packaging: follow the fold/tape keys.\n" +
                "7. Carry the box to a shop shelf slot to unbox it. Ring up customers at the counter.\n\n" +
                "<b>Secrecy</b>\nCustomers only react to what they can see or hear. Close the staff door. Pull twitching globes off the shelf. " +
                "Chat (E) to distract a curious customer — but nobody un-sees a tiny person running across the floor.", _label);
        }
    }
}
