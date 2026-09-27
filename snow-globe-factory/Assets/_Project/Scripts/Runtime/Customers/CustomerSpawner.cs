using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Walk-in customers while the shop is open. The prototype allows one customer at a time.</summary>
    public sealed class CustomerSpawner : MonoBehaviour
    {
        /// <summary>Prototype scope: one at a time. The rest of the code supports more.</summary>
        public int MaxConcurrent = 1;

        readonly List<CustomerAgent> _active = new List<CustomerAgent>();
        Level _level;
        float _timer = 8f;
        int _nextId = 1;

        public int Count { get { return _active.Count; } }
        public IReadOnlyList<CustomerAgent> Active { get { return _active; } }

        public void Init(Level level) { _level = level; }

        public CustomerAgent WaitingAtCounter
        {
            get
            {
                foreach (var c in _active) if (c != null && c.IsWaitingAtCounter) return c;
                return null;
            }
        }

        public bool IsReservedByWaitingCustomer(int productId)
        {
            foreach (var c in _active) if (c != null && c.ChosenProduct != null && c.ChosenProduct.Id == productId) return true;
            return false;
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
            if (_active.Count >= MaxConcurrent) return;
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            var exposure = root.Session.State.Exposure;
            _timer = GameBalance.BaseCustomerIntervalSeconds / Mathf.Max(0.2f, exposure.ArrivalRateMultiplier) * Random.Range(0.6f, 1.4f);
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

        public void Remove(CustomerAgent agent) { _active.Remove(agent); }

        public void BroadcastNoise(NoiseEvent n)
        {
            for (int i = _active.Count - 1; i >= 0; i--) if (_active[i] != null) _active[i].HearNoise(n);
        }

        public void DespawnAll()
        {
            foreach (var c in _active) if (c != null) c.DespawnSilently();
            _active.Clear();
            _timer = 8f;
        }
    }
}
