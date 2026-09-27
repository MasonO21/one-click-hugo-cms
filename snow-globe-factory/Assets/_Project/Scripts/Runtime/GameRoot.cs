using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Composition root. Owns the GameSession (pure simulation) and all scene-side systems,
    /// ticks the simulation, and turns simulation events into things you see and hear.
    /// </summary>
    public sealed class GameRoot : MonoBehaviour
    {
        public static GameRoot I { get; private set; }

        public GameSession Session { get; private set; }
        public Level Level { get; private set; }
        public PlayerController Player { get; private set; }
        public PlayerInteractor Interactor { get; private set; }
        public Hud Hud { get; private set; }
        public AudioKit Audio { get; private set; }
        public HorrorDirectorRunner Horror { get; private set; }
        public CustomerSpawner Customers { get; private set; }
        public SaveSystem Saves { get; private set; }

        public readonly Dictionary<int, ProductView> Views = new Dictionary<int, ProductView>();
        public bool ClosingRequested { get; private set; }
        /// <summary>Basement characters stay silent until this time (atmospheric beat).</summary>
        public float SilentUntil;

        uint _seed;
        readonly CameraWatch _cameraWatch = new CameraWatch();

        /// <summary>Hooks the view layer into core rules that need to know about the world (who can see what).</summary>
        void WireSession()
        {
            Session.Production.IsObserved = IsObserved;
        }

        /// <summary>Is the player or any customer looking at this product right now?</summary>
        bool IsObserved(Product p)
        {
            ProductView v;
            if (!Views.TryGetValue(p.Id, out v) || v == null) return false;
            var cam = Player.Camera.transform;
            var to = v.transform.position - cam.position;
            if (to.magnitude < 12f && Vector3.Dot(cam.forward, to.normalized) > 0.75f) return true;
            foreach (var c in Customers.Active) if (c != null && c.CanSee(v)) return true;
            return false;
        }

        public void Boot(uint seed)
        {
            I = this;
            _seed = seed;
            Settings.Load();
            Saves = new SaveSystem();

            Level = LevelBuilder.Build(transform);
            Audio = new GameObject("Audio").AddComponent<AudioKit>();
            Audio.transform.SetParent(transform, false);
            Audio.Init(Level.StoreCenter, Level.BasementCenter);

            var playerGo = new GameObject("Player");
            playerGo.transform.SetParent(transform, false);
            playerGo.AddComponent<CharacterController>();
            Player = playerGo.AddComponent<PlayerController>();
            Player.Init();
            Interactor = playerGo.AddComponent<PlayerInteractor>();
            Interactor.Controller = Player;

            Customers = new GameObject("Customers").AddComponent<CustomerSpawner>();
            Customers.transform.SetParent(transform, false);
            Customers.Init(Level);
            Horror = gameObject.AddComponent<HorrorDirectorRunner>();
            Hud = gameObject.AddComponent<Hud>();

            // A fresh session renders behind the title screen; the player picks New / Continue.
            Session = GameSession.NewGame(seed);
            WireSession();
            RebuildViews();
            Player.Teleport(Level.PlayerSpawn.position, Level.PlayerSpawnYaw);
            Level.PremiumDecor.SetActive(true);
            Level.PremiumCase.SetActive(false);
            Hud.ShowTitle(Saves.Exists(Saves.SavePath));
        }

        // ---------------------------------------------------------------- session lifecycle

        public void StartNewGame()
        {
            LoadState(GameState.NewGame(_seed ^ (uint)System.DateTime.Now.Ticks), resetPlayer: true);
            Saves.Save(Session.State, Saves.CheckpointPath);
            Hud.ShowBriefing("Day 1", DayProgression.Briefing(1) +
                "\n\nThe basement holds today's stock. Carry a character up to the Preparation Cradle, then work the line: " +
                "Cradle → Assembly → Sealer → (Inspection) → Packaging → a shelf slot in the shop. Flip the sign by the entrance when you're ready to open.");
        }

        public bool LoadFrom(string path)
        {
            var state = Saves.Load(path);
            if (state == null)
            {
                Toast("No save found.", true);
                return false;
            }
            LoadState(state, resetPlayer: true);
            Toast("Loaded day " + state.Day.Day + ".");
            return true;
        }

        public void SaveGame()
        {
            string reason;
            if (!Session.CanSave(out reason)) { Toast(reason, true); return; }
            foreach (var v in Views.Values) if (v != null) v.SyncLocation();
            Toast(Saves.Save(Session.State, Saves.SavePath) ? "Game saved." : "Save failed — see console.", false);
        }

        void LoadState(GameState state, bool resetPlayer)
        {
            Interactor.ClearHeld();
            Customers.DespawnAll();
            DestroyViews();
            var log = Session.Load(state);
            WireSession();
            foreach (var line in log) Debug.Log("[SnowGlobe] Save repair: " + line);
            ClosingRequested = false;
            Horror.ResetState();
            CloseBasementDoors();
            Level.FrontDoor.SetOpen(Session.State.Day.Phase == DayPhase.Open);
            RebuildViews();
            if (resetPlayer) Player.Teleport(Level.PlayerSpawn.position, Level.PlayerSpawnYaw);
            if (Session.State.Day.Phase == DayPhase.AfterClosing) Hud.ShowSummary();
        }

        public void OpenShop()
        {
            var r = Session.Days.OpenStore();
            Toast(r.Message, !r.Success);
            if (r.Success)
            {
                Audio.Play(Sfx.Bell, Level.CustomerEntrance.position, 0.6f, 1.2f);
                Level.FrontDoor.SetOpen(true);
            }
            ClosingRequested = false;
        }

        public void RequestClose()
        {
            if (!Session.Days.IsOpen || ClosingRequested) return;
            ClosingRequested = true;
            Toast(Customers.Count > 0 ? "Closing — waiting for the last customer to leave." : "Closing up.");
        }

        void FinishDay()
        {
            ClosingRequested = false;
            var summary = Session.Days.CloseStore();
            Level.FrontDoor.SetOpen(false);
            // Returned (refunded) globes come back to the counter.
            foreach (var p in Session.State.Products)
            {
                if (p.Stage == ProductStage.Packaged && p.Location.IsStation(StationId.Counter) && !Views.ContainsKey(p.Id)) SpawnView(p);
            }
            Hud.ShowSummary(summary);
        }

        public void StartNextDay()
        {
            var r = Session.Days.StartNextDay();
            if (!r.Success) { Toast(r.Message, true); return; }
            CloseBasementDoors();
            var posted = Session.Orders.OnNewDay();
            Saves.Save(Session.State, Saves.CheckpointPath);
            string orders = posted.Count > 0 ? "\n\n" + posted.Count + " new special order(s) on the board by the counter." : "";
            string note = DayProgression.SupplierNoteFor(Session.State.Day.Day);
            if (note != null) orders += "\n\nA note was tucked into this morning's crate:\n<i>" + note.Substring(note.IndexOf('—') + 2) + "</i>";
            string ledger = Session.Story.MorningNote();
            if (ledger != null) orders += "\n\n<i>" + ledger + "</i>\n(See Tab → Notes.)";
            Hud.ShowBriefing("Day " + Session.State.Day.Day, DayProgression.Briefing(Session.State.Day.Day) + orders + "\n\n(Checkpoint saved.)");
        }

        // ---------------------------------------------------------------- tick

        void Update()
        {
            if (Session == null) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            if (Session.Days.Tick(dt)) RequestClose();
            if (ClosingRequested && Customers.Count == 0) FinishDay();

            var arrived = Session.Supply.Tick(dt);
            if (arrived != null)
            {
                foreach (var p in arrived) SpawnView(p);
                Audio.Play(Sfx.Knock, Level.Hatch.transform.position);
                Audio.Play(Sfx.Hum, Level.Hatch.transform.position, 0.6f, 0.7f);
                Level.LiftLamp.Blink(20f);
                Hud.Alert(arrived.Count + " delivery in the basement freight lift.");
                Hud.Subtitle("", "*the freight lift grinds down... something knocks inside the crate*");
            }

            foreach (var e in Session.Production.Tick(dt, Session.PowerFactor)) HandleProductionEvent(e);
            foreach (var e in Session.Automation.Tick(dt, Session.PowerAvailable)) HandleAutomationEvent(e);
            SyncMachineRigs();
            Session.Suspicion.Tick(dt);
            _cameraWatch.Tick(dt);

            bool premium = Session.State.OwnedUpgrades.Contains(UpgradeId.PremiumDisplayCase);
            if (Level.PremiumCase.activeSelf != premium)
            {
                Level.PremiumCase.SetActive(premium);
                Level.PremiumDecor.SetActive(!premium);
            }

            if (GameInput.QuickSaveDown) SaveGame();
            if (GameInput.QuickLoadDown) LoadFrom(Saves.SavePath);
        }

        void HandleProductionEvent(ProductionEvent e)
        {
            ProductView v;
            if (!Views.TryGetValue(e.ProductId, out v) || v == null) return;
            switch (e.Type)
            {
                case ProductionEventType.SerumWarning:
                    Audio.Play(Sfx.Tick, v.transform.position, 0.8f);
                    Hud.Alert(v.P.CharacterName + "'s serum is wearing off! (Q near them to re-dose)");
                    break;
                case ProductionEventType.SerumExpired:
                    if (Interactor.Held == v) Interactor.ForceRelease(v.P.CharacterName + " woke up in your hands!");
                    else
                    {
                        var pos = v.transform.position + Vector3.up * 0.05f;
                        v.PlaceFree(pos);
                        v.P.Location = ProductLocation.Loose(pos.x, pos.y, pos.z);
                    }
                    Audio.Play(Sfx.Squeak, v.transform.position);
                    Player.AddShake(0.3f);
                    Hud.Alert(v.P.CharacterName + " woke up and ran! The globe kit is ruined.");
                    break;
                case ProductionEventType.StasisMovement:
                    v.PlayStasisTwitch(e.Intensity);
                    Audio.Play(Sfx.Tap, v.transform.position, 0.3f);
                    break;
                case ProductionEventType.StasisNoise:
                    Audio.Play(Sfx.Mumble, v.transform.position, 0.5f);
                    EmitNoise(v.transform.position, e.Intensity, EvidenceType.MuffledVoice, v.P.Id);
                    break;
                case ProductionEventType.UnseenShift:
                {
                    // The Watcher turned to face you while nobody was looking. No sound, no witness.
                    var toPlayer = Player.transform.position - v.transform.position;
                    toPlayer.y = 0f;
                    if (toPlayer.sqrMagnitude > 0.01f) v.transform.rotation = Quaternion.LookRotation(toPlayer);
                    v.LookAt(Player.Camera.transform.position, 20f);
                    break;
                }
                case ProductionEventType.HoldingNoise:
                    if (Time.time < SilentUntil) break;
                    Audio.Play(Sfx.Mumble, v.transform.position, 0.35f, Random.Range(0.8f, 1.3f));
                    EmitNoise(v.transform.position, e.Intensity * 0.8f, EvidenceType.StaffDoorNoise, -1);
                    break;
            }
        }

        void HandleAutomationEvent(AutomationEvent e)
        {
            ProductView v = null;
            if (e.ProductId != 0) Views.TryGetValue(e.ProductId, out v);
            string name = AutomationService.NameOf(e.Machine);
            switch (e.Type)
            {
                case AutomationEventType.Moved:
                    if (v != null) Replace(v);
                    break;
                case AutomationEventType.Completed:
                    if (v != null) Audio.Play(e.Machine == MachineId.AutoPrep ? Sfx.Inject : e.Machine == MachineId.PackagingMachine ? Sfx.Chime : e.Machine == MachineId.SealingPress ? Sfx.Hum : Sfx.Tap, v.transform.position, 0.6f);
                    break;
                case AutomationEventType.Blocked:
                    Hud.Alert(name + ": " + e.Message);
                    break;
                case AutomationEventType.Breakdown:
                case AutomationEventType.Jammed:
                    Hud.Alert(e.Message);
                    Audio.Play(Sfx.PowerDown, Player.transform.position, 0.5f, 1.4f);
                    Player.AddShake(0.2f);
                    break;
            }
        }

        /// <summary>Automation rigs appear once their upgrade is installed.</summary>
        void SyncMachineRigs()
        {
            var a = Session.Automation;
            SetActive(Level.AutoPrepRig, a.Owns(MachineId.AutoPrep));
            SetActive(Level.ConveyorRig, a.Owns(MachineId.Conveyor));
            SetActive(Level.PackagerRig, a.Owns(MachineId.PackagingMachine));
            SetActive(Level.SealPressRig, a.Owns(MachineId.SealingPress));
            SetActive(Level.WindowDisplay, Session.State.OwnedUpgrades.Contains(UpgradeId.WindowDisplay));
            SetActive(Level.Assistant.gameObject, Session.State.Modifiers.HasAssistant);
        }

        static void SetActive(GameObject go, bool active)
        {
            if (go != null && go.activeSelf != active) go.SetActive(active);
        }

        /// <summary>Moves a view to wherever its product's location now says it is.</summary>
        void Replace(ProductView v)
        {
            if (Interactor.Held == v) return;
            v.Detach();
            PlaceView(v);
        }

        public void EmitNoise(Vector3 position, float loudness, EvidenceType type, int sourceId)
        {
            Customers.BroadcastNoise(new NoiseEvent { Position = position, Loudness = loudness, Type = type, SourceId = sourceId, Area = Level.AreaOf(position) });
        }

        // ---------------------------------------------------------------- views

        public ProductView SpawnView(Product p)
        {
            var go = new GameObject("Product");
            var v = go.AddComponent<ProductView>();
            v.Init(p);
            Views[p.Id] = v;
            PlaceView(v);
            return v;
        }

        void PlaceView(ProductView v)
        {
            var loc = v.P.Location;
            switch (loc.Kind)
            {
                case LocationKind.Holding:
                {
                    // Keep the saved cabinet if it's free; otherwise the next free one; otherwise the lift crate.
                    var cell = Level.FreeCell(loc.Index);
                    if (cell != null)
                    {
                        v.P.Location = ProductLocation.Holding(cell.Index);
                        cell.Socket.Place(v);
                    }
                    else
                    {
                        v.P.Location = ProductLocation.Hatch();
                        Level.Hatch.Place(v);
                    }
                    return;
                }
                case LocationKind.Hatch:
                    Level.Hatch.Place(v);
                    return;
                case LocationKind.Shelf:
                    if (loc.Index >= 0 && loc.Index < Level.ShelfSlots.Count) { Level.ShelfSlots[loc.Index].Socket.Place(v); return; }
                    break;
                case LocationKind.Station:
                {
                    var socket = (StationId)loc.Index == StationId.Counter ? Level.CounterSocket : Level.StationFor((StationId)loc.Index).Socket;
                    if (socket.Occupant == null) { socket.Place(v); return; }
                    // Station already occupied: set it down on the floor beside it rather than losing it.
                    var beside = socket.transform.position + socket.transform.right * 0.6f + Vector3.up * 0.1f;
                    v.PlaceFree(beside);
                    v.P.Location = ProductLocation.Floor(beside.x, beside.y, beside.z);
                    return;
                }
                case LocationKind.Hopper:
                    SyncMachineRigs();
                    Level.PrepHopper.Place(v);
                    return;
                case LocationKind.Conveyor:
                    SyncMachineRigs();
                    Level.Conveyor.Attach(v);
                    return;
                case LocationKind.OutputShelf:
                {
                    SyncMachineRigs();
                    var slot = loc.Index >= 0 && loc.Index < Level.OutputSlots.Length ? Level.OutputSlots[loc.Index] : null;
                    if (slot != null && slot.Occupant == null) { slot.Place(v); return; }
                    var near = Level.Packaging.Socket.transform.position + Vector3.right * 0.6f + Vector3.up * 0.1f;
                    v.PlaceFree(near);
                    v.P.Location = ProductLocation.Floor(near.x, near.y, near.z);
                    return;
                }
                case LocationKind.Floor:
                case LocationKind.Loose:
                    v.PlaceFree(new Vector3(loc.X, loc.Y + 0.05f, loc.Z));
                    return;
            }
            // Fallback (e.g. Carried): drop at the player's feet.
            var p = Player.transform.position + Player.transform.forward * 0.8f + Vector3.up * 0.3f;
            v.PlaceFree(p);
            v.P.Location = v.P.Stage == ProductStage.Unprepared ? ProductLocation.Loose(p.x, p.y, p.z) : ProductLocation.Floor(p.x, p.y, p.z);
        }

        void RebuildViews()
        {
            foreach (var p in Session.State.Products)
            {
                if (p.Stage == ProductStage.Sold) continue;
                SpawnView(p);
            }
        }

        void DestroyViews()
        {
            foreach (var v in Views.Values)
            {
                if (v == null) continue;
                v.Detach();
                v.P = null;
                Destroy(v.gameObject);
            }
            Views.Clear();
        }

        void CloseBasementDoors()
        {
            foreach (var cell in Level.Cells) cell.Door.SetOpen(false);
            Level.LiftGate.SetOpen(false);
        }

        public void OnProductSold(Product p)
        {
            ProductView v;
            if (!Views.TryGetValue(p.Id, out v)) return;
            Views.Remove(p.Id);
            if (v == null) return;
            if (Interactor.Held == v) Interactor.ClearHeld();
            v.Detach();
            Destroy(v.gameObject);
        }

        public void RejectToHolding(ProductView v)
        {
            var cell = Level.FreeCell();
            var r = Session.Production.RejectToHolding(v.P, cell != null ? cell.Index : 0);
            Toast(r.Message, !r.Success);
            if (!r.Success) return;
            v.Detach();
            if (cell != null) cell.Socket.Place(v);
            else
            {
                // Every cabinet is full: they wait in the lift crate instead.
                v.P.Location = ProductLocation.Hatch();
                Level.Hatch.Place(v);
            }
            Audio.Play(Sfx.Squeak, v.transform.position, 0.5f);
        }

        // ---------------------------------------------------------------- feedback

        public void Toast(string message, bool bad = false)
        {
            if (!string.IsNullOrEmpty(message)) Hud.Toast(message, bad);
        }
    }
}
