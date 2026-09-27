using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Walk-in customers while the shop is open, plus the queue at the counter.</summary>
    public sealed class CustomerSpawner : MonoBehaviour
    {
        /// <summary>Grows with the shop: see DayProgression.MaxCustomers.</summary>
        public int MaxConcurrent = 1;

        readonly List<CustomerAgent> _active = new List<CustomerAgent>();
        readonly List<CustomerAgent> _queue = new List<CustomerAgent>();
        public const float QueueSpacing = 0.8f;
        Level _level;
        float _timer = 8f;
        int _nextId = 1;

        public int Count { get { return _active.Count; } }
        public IReadOnlyList<CustomerAgent> Active { get { return _active; } }

        public void Init(Level level) { _level = level; }

        /// <summary>The customer at the front of the counter queue, if they're ready to pay.</summary>
        public CustomerAgent WaitingAtCounter
        {
            get
            {
                _queue.RemoveAll(c => c == null);
                return _queue.Count > 0 && _queue[0].IsWaitingAtCounter ? _queue[0] : null;
            }
        }

        public int QueueLength { get { return _queue.Count; } }

        /// <summary>True if a customer has chosen this globe or is holding it for a closer look.</summary>
        public bool IsReservedByWaitingCustomer(int productId)
        {
            foreach (var c in _active)
            {
                if (c == null) continue;
                if (c.ChosenProduct != null && c.ChosenProduct.Id == productId) return true;
                if (c.Handled != null && c.Handled.P != null && c.Handled.P.Id == productId) return true;
            }
            return false;
        }

        public Vector3 JoinQueue(CustomerAgent c)
        {
            if (!_queue.Contains(c)) _queue.Add(c);
            return QueueSpot(c);
        }

        public void LeaveQueue(CustomerAgent c) { _queue.Remove(c); }

        public int QueueIndex(CustomerAgent c) { return _queue.IndexOf(c); }

        /// <summary>Queue forms back from the counter toward the shop floor.</summary>
        public Vector3 QueueSpot(CustomerAgent c)
        {
            int i = Mathf.Max(0, _queue.IndexOf(c));
            return _level.CounterSpot.position + new Vector3(0f, 0f, -QueueSpacing * i);
        }

        /// <summary>Director context: could any customer currently see a shelf?</summary>
        public bool AnyoneWatchingShelves
        {
            get
            {
                foreach (var c in _active)
                {
                    if (c == null) continue;
                    if (c.State == CustomerState.Browsing || c.State == CustomerState.Investigating || c.State == CustomerState.Deciding) return true;
                }
                return false;
            }
        }

        void Update()
        {
            var root = GameRoot.I;
            if (root == null || root.Session == null || Time.deltaTime <= 0f) return;
            if (!root.Session.Days.IsOpen || root.ClosingRequested || root.Session.Days.PastClosingTime) return;
            MaxConcurrent = DayProgression.MaxCustomers(root.Session.State.Day.Day);
            if (_active.Count >= MaxConcurrent) return;
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            var exposure = root.Session.State.Exposure;
            // Rumours keep people away; well-stocked shelves draw them in (store appeal).
            float rate = Mathf.Max(0.2f, exposure.ArrivalRateMultiplier) * root.Session.Store.AppealMultiplier()
                         * DayProgression.FootTrafficMultiplier(root.Session.State.Day.Day);
            _timer = GameBalance.BaseCustomerIntervalSeconds / rate * Random.Range(0.6f, 1.4f);
            Spawn(exposure.CustomerAttentiveness);
        }

        void Spawn(float attentiveness)
        {
            var go = new GameObject("Customer");
            go.transform.SetParent(transform, false);
            var agent = go.AddComponent<CustomerAgent>();
            agent.Init(_nextId++, this, _level, attentiveness);
            _active.Add(agent);
            GameRoot.I.Audio.Play(Sfx.Chime, _level.CustomerEntrance.position, 0.5f, 1.5f);
        }

        public void Remove(CustomerAgent agent)
        {
            _active.Remove(agent);
            _queue.Remove(agent);
        }

        public void BroadcastNoise(NoiseEvent n)
        {
            for (int i = _active.Count - 1; i >= 0; i--) if (_active[i] != null) _active[i].HearNoise(n);
        }

        public void DespawnAll()
        {
            foreach (var c in _active) if (c != null) c.DespawnSilently();
            _active.Clear();
            _queue.Clear();
            _timer = 8f;
        }
    }
}
