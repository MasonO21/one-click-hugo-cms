using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public interface IGameStateSerializer
    {
        string Serialize(GameState state);
        GameState Deserialize(string json);
    }

    /// <summary>
    /// Makes a loaded (or about-to-be-saved) state self-consistent. Never deletes a product:
    /// anything in an impossible place is moved somewhere safe instead.
    /// </summary>
    public static class SaveValidator
    {
        public const int SafeHoldingRoom = 0;

        public static List<string> Repair(GameState s)
        {
            var log = new List<string>();
            if (s.Products == null) s.Products = new List<Product>();
            if (s.OwnedUpgrades == null) s.OwnedUpgrades = new List<UpgradeId>();
            if (s.UnlockedThemes == null) s.UnlockedThemes = new List<ThemeId>();
            if (s.Deliveries == null) s.Deliveries = new List<PendingDelivery>();
            if (s.Store == null) s.Store = new StoreState();
            if (s.Director == null) s.Director = new EventDirectorState();
            if (s.Automation == null) s.Automation = new AutomationState();
            if (s.Orders == null) s.Orders = new List<SpecialOrder>();
            if (!s.UnlockedThemes.Contains(s.ActiveTheme)) s.ActiveTheme = ThemeId.WinterVillage;
            foreach (var o in s.Orders) if (o.Id >= s.NextOrderId) s.NextOrderId = o.Id + 1;
            var pinned = s.PinnedOrderId == 0 ? null : s.Orders.Find(o => o.Id == s.PinnedOrderId);
            if (pinned == null || pinned.State != OrderState.Open) s.PinnedOrderId = 0;
            if (s.Automation.Machines == null) s.Automation.Machines = new List<MachineState>();
            if (s.Day == null) s.Day = new DayState();
            if (s.Day.Stats == null) s.Day.Stats = new DailyStats();
            if (s.Rng == null) s.Rng = new DeterministicRandom(12345);
            if (!s.UnlockedThemes.Contains(ThemeId.WinterVillage)) s.UnlockedThemes.Add(ThemeId.WinterVillage);
            s.InvalidateModifiers();

            // Duplicate upgrades.
            var seenUpgrades = new HashSet<UpgradeId>();
            for (int i = s.OwnedUpgrades.Count - 1; i >= 0; i--)
            {
                if (!seenUpgrades.Add(s.OwnedUpgrades[i])) { s.OwnedUpgrades.RemoveAt(i); log.Add("Removed duplicate upgrade."); }
            }

            // Duplicate product ids: re-id the later copy rather than deleting it.
            var seen = new HashSet<int>();
            int maxId = 0;
            foreach (var p in s.Products) if (p.Id > maxId) maxId = p.Id;
            if (s.NextId <= maxId) s.NextId = maxId + 1;
            foreach (var p in s.Products)
            {
                if (seen.Add(p.Id)) continue;
                int old = p.Id;
                p.Id = s.NextId++;
                seen.Add(p.Id);
                log.Add("Product id " + old + " was duplicated; reassigned to " + p.Id + ".");
            }

            // Shelf slots must point at displayed products, each at most once.
            s.Store.EnsureCapacity(s.ShelfCapacity);
            var onShelf = new HashSet<int>();
            for (int i = 0; i < s.Store.Slots.Count; i++)
            {
                int id = s.Store.Slots[i];
                if (id == 0) continue;
                var p = s.Find(id);
                if (p == null || p.Stage != ProductStage.Displayed || !onShelf.Add(id))
                {
                    s.Store.Slots[i] = 0;
                    log.Add("Cleared invalid shelf slot " + i + ".");
                    continue;
                }
                p.Location = ProductLocation.Shelf(i);
            }

            foreach (var p in s.Products)
            {
                if (p.Stage == ProductStage.Displayed && !onShelf.Contains(p.Id))
                {
                    int slot = s.Store.FirstEmptySlot();
                    if (slot >= 0)
                    {
                        s.Store.Slots[slot] = p.Id;
                        onShelf.Add(p.Id);
                        p.Location = ProductLocation.Shelf(slot);
                    }
                    else
                    {
                        p.Stage = ProductStage.Packaged;
                        p.Location = ProductLocation.At(StationId.Counter);
                    }
                    log.Add("Re-homed displayed globe " + p.Id + ".");
                }

                if (p.Stage == ProductStage.Sold)
                {
                    p.Location = ProductLocation.Gone();
                    continue;
                }
                if (p.Location.Kind == LocationKind.Gone)
                {
                    // Unsold product marked as gone: it must exist somewhere.
                    p.Location = p.Stage == ProductStage.Unprepared ? ProductLocation.Holding(SafeHoldingRoom) : ProductLocation.At(StationId.Counter);
                    log.Add("Product " + p.Id + " was missing; restored.");
                }
                if (p.Location.Kind == LocationKind.Carried)
                {
                    // Nothing is carried across a load. Drop at a safe place for its stage.
                    p.Location = SafeLocationFor(p);
                    log.Add("Product " + p.Id + " was being carried; placed safely.");
                }
                if (p.Stage == ProductStage.Unprepared && p.Location.Kind == LocationKind.Loose)
                {
                    // Checkpoint rule: escaped characters are recaptured on load.
                    p.Location = ProductLocation.Holding(SafeHoldingRoom);
                    log.Add("Recaptured " + p.CharacterName + " on load.");
                }
                if (p.IsSerumActive && p.SerumRemaining <= 0f) p.SerumRemaining = 1f;
            }

            // Automation locations: clamp belt progress, keep output-rack slots unique, keep hopper order ahead of the counter.
            var usedSlots = new HashSet<int>();
            foreach (var p in s.Products)
            {
                if (p.Location.Kind == LocationKind.Conveyor) p.Location.X = MathUtil.Clamp01(p.Location.X);
                if (p.Location.Kind == LocationKind.Hopper && p.Location.Index >= s.Automation.NextHopperOrder) s.Automation.NextHopperOrder = p.Location.Index + 1;
                if (p.Location.Kind != LocationKind.OutputShelf) continue;
                if (p.Location.Index >= 0 && p.Location.Index < AutomationService.OutputShelfCapacity && usedSlots.Add(p.Location.Index)) continue;
                int free = -1;
                for (int i = 0; i < AutomationService.OutputShelfCapacity; i++) if (!usedSlots.Contains(i)) { free = i; break; }
                if (free >= 0)
                {
                    usedSlots.Add(free);
                    p.Location = ProductLocation.OnOutputShelf(free);
                }
                else p.Location = ProductLocation.At(StationId.Counter);
                log.Add("Re-slotted output rack item " + p.Id + ".");
            }
            return log;
        }

        static ProductLocation SafeLocationFor(Product p)
        {
            switch (p.Stage)
            {
                case ProductStage.Unprepared: return ProductLocation.Holding(SafeHoldingRoom);
                case ProductStage.Prepared: return ProductLocation.At(StationId.PrepCradle);
                case ProductStage.Mounted:
                case ProductStage.Decorated: return ProductLocation.At(StationId.Assembly);
                case ProductStage.Domed: return ProductLocation.At(StationId.Sealer);
                case ProductStage.Sealed:
                case ProductStage.Inspected: return ProductLocation.At(StationId.Inspection);
                default: return ProductLocation.At(StationId.Packaging);
            }
        }
    }
}
