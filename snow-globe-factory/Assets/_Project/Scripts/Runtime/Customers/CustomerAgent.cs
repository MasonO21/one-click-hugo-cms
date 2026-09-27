using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    public enum CustomerState
    {
        Entering,
        Browsing,
        Handling,
        Investigating,
        Deciding,
        WalkingToCounter,
        Waiting,
        Leaving,
        Fleeing,
    }

    public struct NoiseEvent
    {
        public Vector3 Position;
        public float Loudness;
        public EvidenceType Type;
        public int SourceId;
        public PlayerArea Area;
    }

    /// <summary>
    /// A shopper. Suspicion only rises from evidence this customer could actually perceive:
    /// line of sight + distance for things seen, door/soundproofing attenuation for things heard.
    /// </summary>
    public sealed class CustomerAgent : MonoBehaviour, IInteractable, ISecondaryInteractable
    {
        public const float WalkSpeed = 1.3f;
        public const float FleeSpeed = 3f;
        public const float SightRange = 9f;
        public const float PatienceSeconds = 60f;

        public int Id;
        public CustomerSuspicion Suspicion;
        public CustomerState State;
        public Product ChosenProduct;
        public string Speech = "";
        public float SpeechUntil;
        public Transform Head;

        CustomerSpawner _spawner;
        Level _level;
        Vector3 _target;
        float _timer;
        float _patience;
        int _browsesLeft;
        float _perceptionTimer;
        bool _rangBell;
        bool _reminded;
        /// <summary>A displayed globe this customer has picked up for a closer look (day 4+).</summary>
        public ProductView Handled;
        float _handleTimer;
        bool _handledThisStop;
        ThemeId _preferred;
        ProductView _lookingAt;
        GameObject _bag;
        readonly Dictionary<int, float> _seenMovementAt = new Dictionary<int, float>();
        readonly Dictionary<int, float> _lastEvidenceAt = new Dictionary<int, float>();

        static readonly string[] BrowseLines = { "Oh, these are darling.", "So detailed!", "Look at its little face.", "Are these handmade?", "My aunt would love this one." };
        static readonly string[] ChatLines = { "Oh? Tell me more about the Winter Village line!", "Handmade, you say? Lovely.", "I didn't notice that one. Ooh." };

        static GameRoot Root { get { return GameRoot.I; } }

        public void Init(int id, CustomerSpawner spawner, Level level, float attentiveness)
        {
            Id = id;
            _spawner = spawner;
            _level = level;
            Suspicion = Root.Session.Suspicion.Register(id, attentiveness);
            var themes = Root.Session.State.UnlockedThemes;
            _preferred = themes[Random.Range(0, themes.Count)];
            name = "Customer_" + id;

            var rng = new System.Random(id * 31);
            Color coat = Color.HSVToRGB((float)rng.NextDouble(), 0.45f, 0.7f);
            Color skin = new[] { new Color(0.98f, 0.83f, 0.7f), new Color(0.8f, 0.6f, 0.45f), new Color(0.45f, 0.3f, 0.22f) }[rng.Next(3)];
            Shapes.Prim(PrimitiveType.Capsule, "Body", transform, new Vector3(0f, 0.8f, 0f), new Vector3(0.55f, 0.8f, 0.45f), coat, false);
            Shapes.Box("Scarf", transform, new Vector3(0f, 1.38f, 0f), new Vector3(0.4f, 0.1f, 0.35f), Palette.StoreTrim, false);
            Head = Shapes.Empty("Head", transform, new Vector3(0f, 1.62f, 0f)).transform;
            Shapes.Prim(PrimitiveType.Sphere, "Skull", Head, Vector3.zero, Vector3.one * 0.32f, skin, false);
            Shapes.Prim(PrimitiveType.Sphere, "EyeL", Head, new Vector3(-0.06f, 0.03f, 0.14f), Vector3.one * 0.05f, Color.black, false);
            Shapes.Prim(PrimitiveType.Sphere, "EyeR", Head, new Vector3(0.06f, 0.03f, 0.14f), Vector3.one * 0.05f, Color.black, false);
            var col = gameObject.AddComponent<CapsuleCollider>();
            col.height = 1.8f;
            col.radius = 0.3f;
            col.center = new Vector3(0f, 0.9f, 0f);
            var rb = gameObject.AddComponent<Rigidbody>();
            rb.isKinematic = true;

            transform.position = level.CustomerSpawn.position;
            SetState(CustomerState.Entering, level.CustomerEntrance.position);
        }

        readonly List<Vector3> _waypoints = new List<Vector3>();

        void SetState(CustomerState s, Vector3 target, float timer = 0f)
        {
            State = s;
            _target = target;
            _timer = timer;
            _level.PathAround(transform.position, target, _waypoints);
        }

        public void Say(string text, float seconds = 3.5f)
        {
            Speech = text;
            SpeechUntil = Time.time + seconds;
            Root.Hud.Subtitle("Customer", text);
        }

        bool Arrived { get { var d = _target - transform.position; d.y = 0f; return _waypoints.Count == 0 && d.magnitude < 0.15f; } }

        void Update()
        {
            if (Root == null || Root.Session == null) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            Move(dt);
            _perceptionTimer -= dt;
            if (_perceptionTimer <= 0f)
            {
                _perceptionTimer = 0.25f;
                Perceive();
            }

            if (Suspicion.Stage == SuspicionStage.Alarmed && State != CustomerState.Fleeing)
            {
                CancelPurchase();
                Say(Suspicion.SawUndeniable ? "It's ALIVE. They're all alive!" : "I... I have to go.", 4f);
                Root.Audio.Play(Sfx.Squeak, Head.position, 0.6f, 0.5f);
                SetState(CustomerState.Fleeing, _level.CustomerEntrance.position);
                return;
            }

            switch (State)
            {
                case CustomerState.Entering:
                    if (!Arrived) break;
                    _browsesLeft = Random.Range(2, 4);
                    NextBrowse();
                    break;

                case CustomerState.Browsing:
                    if (!Arrived) break;
                    LookAtNearestGlobe();
                    if (!_handledThisStop && _lookingAt != null && DayProgression.CustomersHandleGlobes(Root.Session.State.Day.Day))
                    {
                        _handledThisStop = true;
                        if (Random.value < 0.35f && TryPickUp(_lookingAt)) break;
                    }
                    _timer -= dt;
                    if (_timer > 0f) break;
                    if (Suspicion.Stage >= SuspicionStage.Investigating && FocusView() != null)
                    {
                        StartInvestigating();
                        break;
                    }
                    if (--_browsesLeft > 0) NextBrowse();
                    else SetState(CustomerState.Deciding, transform.position);
                    break;

                case CustomerState.Handling:
                    if (Handled == null || Handled.P == null || Handled.P.Stage != ProductStage.Displayed || Handled.Socket == null) { EndHandling(); break; }
                    Handled.transform.localPosition = new Vector3(0f, 0.35f + Mathf.Sin(Time.time * 2f) * 0.01f, 0.28f);
                    Handled.transform.localRotation = Quaternion.Euler(0f, Mathf.Sin(Time.time * 0.8f) * 35f, 0f);
                    FaceTowards(Handled.transform.position, dt);
                    _handleTimer -= dt;
                    if (_handleTimer <= 0f) EndHandling();
                    break;

                case CustomerState.Investigating:
                {
                    var v = FocusView();
                    if (v == null || Suspicion.Stage < SuspicionStage.Investigating)
                    {
                        Say("Hm. Must have been my imagination.");
                        NextBrowse();
                        break;
                    }
                    FaceTowards(v.transform.position, dt);
                    _timer -= dt;
                    if (_timer <= 0f)
                    {
                        Say("I'm going to... think about it.");
                        Leave();
                    }
                    break;
                }

                case CustomerState.Deciding:
                    ChooseProduct();
                    break;

                case CustomerState.WalkingToCounter:
                    if (!StillAvailable()) { Say("Wait, where did it go?"); CancelPurchase(); NextBrowse(); break; }
                    if (!Arrived) break;
                    if (State != CustomerState.Waiting && _patience <= 0f) _patience = PatienceSeconds;
                    State = CustomerState.Waiting;
                    break;

                case CustomerState.Waiting:
                {
                    // Shuffle forward as the queue moves.
                    var spot = _spawner.QueueSpot(this);
                    if ((spot - _target).sqrMagnitude > 0.01f) { SetState(CustomerState.WalkingToCounter, spot); break; }
                    bool atFront = _spawner.QueueIndex(this) == 0;
                    if (!_rangBell && atFront)
                    {
                        _rangBell = true;
                        Root.Audio.Play(Sfx.Bell, _level.Counter.BellPoint.position);
                        Root.Hud.Alert("Customer waiting at the counter!");
                    }
                    FaceTowards(_level.Counter.transform.position + Vector3.forward, dt);
                    if (!StillAvailable()) { Say("Hey, I wanted that one!"); CancelPurchase(); Leave(); Root.Session.State.Day.Stats.CustomersLost++; break; }
                    _patience -= dt;
                    if (!_reminded && _patience < PatienceSeconds * 0.5f)
                    {
                        _reminded = true;
                        if (atFront) Root.Audio.Play(Sfx.Bell, _level.Counter.BellPoint.position);
                        Say(atFront ? "Hello? Anyone?" : "Is this line even moving?");
                    }
                    if (_patience <= 0f)
                    {
                        Say("Forget it.");
                        CancelPurchase();
                        Root.Session.State.Day.Stats.CustomersLost++;
                        Leave();
                    }
                    break;
                }

                case CustomerState.Leaving:
                case CustomerState.Fleeing:
                    if (Arrived && Vector3.Distance(_target, _level.CustomerSpawn.position) < 0.2f) Despawn();
                    else if (Arrived) SetState(State, _level.CustomerSpawn.position);
                    break;
            }
        }

        void Move(float dt)
        {
            if (State == CustomerState.Waiting || State == CustomerState.Deciding || State == CustomerState.Investigating && Arrived) return;
            var goal = _waypoints.Count > 0 ? _waypoints[0] : _target;
            var to = goal - transform.position;
            to.y = 0f;
            float speed = State == CustomerState.Fleeing ? FleeSpeed : WalkSpeed;
            if (_waypoints.Count > 0 && to.magnitude < 0.2f)
            {
                _waypoints.RemoveAt(0);
                return;
            }
            if (to.magnitude < 0.05f) return;
            transform.position += Vector3.ClampMagnitude(to.normalized * speed * dt, to.magnitude);
            FaceTowards(transform.position + to, dt);
            // Little bob so they don't glide.
            Head.localPosition = new Vector3(0f, 1.62f + Mathf.Abs(Mathf.Sin(Time.time * 8f)) * 0.03f, 0f);
        }

        void FaceTowards(Vector3 point, float dt)
        {
            var d = point - transform.position;
            d.y = 0f;
            if (d.sqrMagnitude < 0.0001f) return;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(d), dt * 6f);
        }

        void NextBrowse()
        {
            var pts = _level.BrowsePoints;
            var p = pts[Random.Range(0, pts.Length)].position;
            // The premium tier of the round display draws customers once it's stocked.
            if (_level.PremiumCase.activeSelf && Random.value < 0.3f) p = _level.PremiumBrowse.position;
            SetState(CustomerState.Browsing, p, Random.Range(4f, 6.5f));
            _handledThisStop = false;
            if (Random.value < 0.35f) Say(BrowseLines[Random.Range(0, BrowseLines.Length)]);
        }

        void StartInvestigating()
        {
            var v = FocusView();
            var standoff = v.transform.position + (transform.position - v.transform.position).normalized * 0.8f;
            standoff.y = 0f;
            SetState(CustomerState.Investigating, standoff, 8f);
            Say(Suspicion.LastReaction.Length > 0 ? Suspicion.LastReaction : "Hold on...");
        }

        ProductView FocusView()
        {
            ProductView v;
            return Suspicion.FocusSourceId >= 0 && Root.Views.TryGetValue(Suspicion.FocusSourceId, out v) && v != null && v.P.Stage == ProductStage.Displayed ? v : null;
        }

        void LookAtNearestGlobe()
        {
            _lookingAt = null;
            float best = 2.5f;
            foreach (var v in Root.Views.Values)
            {
                if (v == null || v.P.Stage != ProductStage.Displayed) continue;
                float d = Vector3.Distance(v.transform.position, Head.position);
                if (d < best) { best = d; _lookingAt = v; }
            }
            if (_lookingAt != null) FaceTowards(_lookingAt.transform.position, Time.deltaTime);
        }

        void ChooseProduct()
        {
            ProductView pick = null;
            int bestValue = -1;
            foreach (var v in Root.Views.Values)
            {
                if (v == null || v.P.Stage != ProductStage.Displayed || Root.Session.Store.IsReserved(v.P.Id)) continue;
                if (v.P.Id == Suspicion.FocusSourceId) continue; // not the creepy one
                int value = QualityModel.EstimateValue(v.P) + Random.Range(0, 15) + (v.P.Theme == _preferred ? 25 : 0);
                if (value > bestValue) { bestValue = value; pick = v; }
            }
            if (pick == null)
            {
                Say(Root.Session.Store.DisplayedCount() == 0 ? "Empty shelves? Oh well." : "Nothing for me today.");
                Root.Session.State.Day.Stats.CustomersLost++;
                Leave();
                return;
            }
            var r = Root.Session.Store.Reserve(pick.P, Id);
            if (!r.Success) { Leave(); return; }
            ChosenProduct = pick.P;
            Say("I'll take the " + pick.P.CharacterName.Split('#')[0].Trim() + " one!");
            SetState(CustomerState.WalkingToCounter, _spawner.JoinQueue(this));
        }

        bool TryPickUp(ProductView v)
        {
            if (v.Socket == null || Root.Interactor.Held == v || Root.Customers.IsReservedByWaitingCustomer(v.P.Id)) return false;
            if (!Root.Session.Store.Reserve(v.P, Id).Success) return false;
            Handled = v;
            _handleTimer = Random.Range(3f, 5f);
            State = CustomerState.Handling;
            Root.Audio.Play(Sfx.Tap, v.transform.position, 0.4f);
            if (Random.value < 0.5f) Say(v.P.Theme == _preferred ? "Oh, this is exactly my style." : "Let me get a closer look...");
            return true;
        }

        /// <summary>Put the globe back where it was (it stays reserved only if they decided to buy it).</summary>
        void EndHandling()
        {
            var v = Handled;
            Handled = null;
            if (v != null && v.Socket != null)
            {
                v.transform.localPosition = Vector3.zero;
                v.transform.localRotation = Quaternion.identity;
            }
            if (v != null && v.P != null && (ChosenProduct == null || ChosenProduct.Id != v.P.Id)) Root.Session.Store.CancelReservation(v.P.Id, Id);
            if (State == CustomerState.Handling) SetState(CustomerState.Browsing, transform.position, 1.5f);
        }

        bool StillAvailable()
        {
            return ChosenProduct != null && ChosenProduct.Stage == ProductStage.Displayed && Root.Session.Store.IsReserved(ChosenProduct.Id);
        }

        public bool IsWaitingAtCounter { get { return State == CustomerState.Waiting && StillAvailable() && _spawner.QueueIndex(this) == 0; } }

        public void CompletePurchase()
        {
            if (!IsWaitingAtCounter) return;
            var p = ChosenProduct;
            ActionResult r;
            int price = Root.Session.Store.CompleteSale(p, Id, out r);
            Root.Toast(r.Message, !r.Success);
            if (price <= 0) return;
            Root.Audio.Play(Sfx.Chime, transform.position);
            Root.OnProductSold(p);
            ChosenProduct = null;
            _bag = Shapes.Box("Bag", transform, new Vector3(0.35f, 0.9f, 0.1f), new Vector3(0.3f, 0.3f, 0.3f), Palette.BoxColor, false);
            Say(Suspicion.Stage >= SuspicionStage.Curious ? "Thanks... I guess." : "Thank you! Merry everything!");
            Leave();
        }

        void CancelPurchase()
        {
            if (Handled != null) EndHandling();
            if (ChosenProduct != null) Root.Session.Store.CancelReservation(ChosenProduct.Id, Id);
            ChosenProduct = null;
            _spawner.LeaveQueue(this);
        }

        void Leave()
        {
            if (Handled != null) EndHandling();
            _spawner.LeaveQueue(this);
            SetState(CustomerState.Leaving, _level.CustomerEntrance.position);
        }

        void Despawn()
        {
            CancelPurchase();
            Root.Session.State.Exposure.OnCustomerLeft(Suspicion.Stage, Suspicion.SawUndeniable);
            if (Suspicion.Stage >= SuspicionStage.Investigating) Root.Hud.Alert("A customer left unsettled. Business exposure rose.");
            Root.Session.Suspicion.Remove(Id);
            Root.Session.Store.CancelAllReservations(Id);
            _spawner.Remove(this);
            Destroy(gameObject);
        }

        /// <summary>Silent removal (loading a save): no exposure consequences.</summary>
        public void DespawnSilently()
        {
            if (Handled != null) EndHandling();
            Root.Session.Suspicion.Remove(Id);
            Root.Session.Store.CancelAllReservations(Id);
            Destroy(gameObject);
        }

        // ---------------- perception ----------------

        void Perceive()
        {
            var eye = Head.position;
            float now = Time.time;
            var visMult = Root.Session.State.Modifiers.DisplayVisibilityMultiplier;
            foreach (var v in Root.Views.Values)
            {
                if (v == null || v.P == null) continue;
                var p = v.P;
                if (p.Stage == ProductStage.Displayed)
                {
                    // Movement inside a displayed globe.
                    float seenAt;
                    if (v.RecentlyMoved(0.8f) && (!_seenMovementAt.TryGetValue(p.Id, out seenAt) || seenAt < v.LastMovementTime))
                    {
                        bool inHands = v == Handled;
                        float perception = inHands ? 1f : Perception(v, eye, 70f);
                        if (perception > 0f)
                        {
                            if (inHands)
                            {
                                // It moved while they were holding it. They drop it.
                                _seenMovementAt[p.Id] = v.LastMovementTime;
                                Witness(EvidenceType.GlobeMovement, Mathf.Clamp01(v.LastMovementIntensity * 1.5f + 0.3f), 1f, p.Id);
                                Root.Session.Production.ApplyDamage(p, 0.15f);
                                Root.Audio.Play(Sfx.Thump, v.transform.position);
                                Say("It MOVED in my hands!", 4f);
                                EndHandling();
                                continue;
                            }
                            _seenMovementAt[p.Id] = v.LastMovementTime;
                            bool premium = v.Socket != null && v.Socket.GetComponent<ShelfSlot>() != null && v.Socket.GetComponent<ShelfSlot>().Index >= GameBalance.BaseShelfCapacity;
                            Witness(EvidenceType.GlobeMovement, v.LastMovementIntensity * (premium ? visMult : 1f), perception, p.Id);
                        }
                    }
                    // Eyes following them from a weakly sealed globe.
                    if (p.EffectiveIntegrity < GameBalance.DefectRevealThreshold && Vector3.Distance(eye, v.transform.position) < 2.5f)
                    {
                        float perception = Perception(v, eye, 50f);
                        if (perception > 0f)
                        {
                            v.LookAt(eye, 1f);
                            if (Cooldown(p.Id, 8f)) Witness(EvidenceType.EyesFollowing, 1f - p.EffectiveIntegrity, perception, p.Id);
                        }
                    }
                    continue;
                }
                if (v.IsLooseCharacter)
                {
                    float perception = Perception(v, eye, 100f);
                    if (perception <= 0f) continue;
                    var type = v.Mode == ViewMode.Carried ? EvidenceType.UnpreparedCarriedInPublic : EvidenceType.EscapedCharacter;
                    if (Cooldown(-1000 - p.Id, 5f)) Witness(type, 1f, perception, -1);
                }
            }
        }

        bool Cooldown(int key, float seconds)
        {
            float last;
            if (_lastEvidenceAt.TryGetValue(key, out last) && Time.time - last < seconds) return false;
            _lastEvidenceAt[key] = Time.time;
            return true;
        }

        /// <summary>0 if not visible; otherwise 0..1 from distance and how directly they're looking.</summary>
        float Perception(ProductView v, Vector3 eye, float halfAngle)
        {
            var target = v.transform.position + Vector3.up * 0.12f;
            var to = target - eye;
            float dist = to.magnitude;
            if (dist > SightRange) return 0f;
            float angle = Vector3.Angle(transform.forward, to);
            if (angle > halfAngle) return 0f;
            RaycastHit hit;
            if (Physics.Raycast(eye, to / dist, out hit, dist + 0.2f, ~0, QueryTriggerInteraction.Ignore))
            {
                if (hit.collider.attachedRigidbody != v.Body && hit.collider.GetComponentInParent<ProductView>() != v)
                {
                    // Something in the way (wall, closed door, shelf, the player's back). Grazing the
                    // player's body right next to the item they're carrying still counts as seeing it.
                    bool grazingCarrier = v.Mode == ViewMode.Carried && hit.collider.GetComponentInParent<PlayerController>() != null && hit.distance > dist - 0.4f;
                    if (!grazingCarrier) return 0f;
                }
            }
            float distance = 1f - Mathf.Clamp01((dist - 1.5f) / (SightRange - 1.5f));
            float facing = 1f - Mathf.Clamp01(angle / halfAngle) * 0.5f;
            return distance * facing;
        }

        public void HearNoise(NoiseEvent n)
        {
            float perceived;
            EvidenceType type = n.Type;
            if (n.Area == PlayerArea.Storefront)
            {
                perceived = n.Loudness * (1f - Mathf.Clamp01(Vector3.Distance(n.Position, Head.position) / 8f));
            }
            else
            {
                // Sound has to leak through the staff door (and the basement door) to reach the shop.
                float leak = _level.StaffDoor.IsOpen ? 0.6f : 0.15f;
                if (n.Area == PlayerArea.Basement) leak *= (_level.BasementDoor.IsOpen ? 0.6f : 0.25f) * Root.Session.State.Modifiers.NoiseLeakMultiplier;
                perceived = n.Loudness * leak;
                type = EvidenceType.StaffDoorNoise;
            }
            if (!Root.Audio.MusicDucked) perceived *= 0.7f; // the music box covers a lot
            if (perceived < 0.08f) return;
            Witness(type, Mathf.Clamp01(n.Loudness), Mathf.Clamp01(perceived * 1.5f), n.SourceId);
        }

        void Witness(EvidenceType type, float intensity, float perception, int sourceId)
        {
            var before = Suspicion.Stage;
            Suspicion.Witness(type, intensity, perception, sourceId);
            if (Suspicion.Stage != before || type == EvidenceType.EscapedCharacter || Random.value < 0.4f) Say(Suspicion.LastReaction);
            if (Suspicion.Stage > before && Suspicion.Stage >= SuspicionStage.Investigating) Root.Hud.Alert("A customer is getting suspicious.");
        }

        // ---------------- player responses ----------------

        public string Prompt(PlayerInteractor player)
        {
            if (State == CustomerState.Fleeing) return "They won't listen now.";
            return Suspicion.CanBeDistracted ? "E: Chat — point out another product" : "Customer (they need a moment)";
        }

        public void Interact(PlayerInteractor player)
        {
            if (Suspicion.TryDistract())
            {
                Say(ChatLines[Random.Range(0, ChatLines.Length)]);
                if (State == CustomerState.Investigating) NextBrowse();
            }
            else Root.Toast(Suspicion.Stage == SuspicionStage.Alarmed ? "Too late for small talk." : "They're not in the mood to chat again yet.", true);
        }

        public string SecondaryPrompt(PlayerInteractor player)
        {
            if (Suspicion.ExchangeOffered || Suspicion.Stage < SuspicionStage.Curious || Suspicion.Stage == SuspicionStage.Alarmed) return null;
            return "X: Offer an exchange / discount on something else";
        }

        public void SecondaryInteract(PlayerInteractor player)
        {
            if (Suspicion.TryOfferExchange())
            {
                Say("A free exchange? Well... that's very kind.");
                if (State == CustomerState.Investigating) NextBrowse();
            }
        }
    }
}
