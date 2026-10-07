import type { VehicleDef } from './schema';

/**
 * Six vehicles from a zippy ATV to the Titanium Hovercraft. `speed` is a multiplier over walking (7 u/s),
 * `storage` is extra backpack capacity while riding. Built at the garage (T1) or hangar (T4) via recipes
 * `r_vehicle_<id>` whose inputs mirror `cost`.
 */
export const VEHICLES: VehicleDef[] = [
  { id: 'atv', name: 'ATV', icon: '🏍️', model: 'atv', description: 'A rugged four-wheeler. Zippy and fun.', speed: 1.8, storage: 60, unlockTier: 1, research: 'engine_basics', cost: { wood: 80, stone: 60, fiber: 40 } },
  { id: 'buggy', name: 'Dune Buggy', icon: '🚙', model: 'buggy', description: 'A roll-caged buggy that eats rough terrain for breakfast. Bouncy and adorable.', speed: 2.3, storage: 110, unlockTier: 2, research: 'off_road', cost: { wood: 120, iron: 80, copper: 20 } },
  { id: 'mining_truck', name: 'Mining Truck', icon: '🚚', model: 'mining_truck', description: 'A hulking hauler with a huge bed. Not the fastest, but it carries a mountain of ore.', speed: 1.6, storage: 450, unlockTier: 3, research: 'heavy_haulers', cost: { steel: 100, iron: 120, copper: 40 } },
  { id: 'hover_bike', name: 'Hover Bike', icon: '🛵', model: 'hover_bike', description: 'Skims over water, ridges and ruins on a cushion of humming air. Wheee!', speed: 3.2, storage: 150, hover: true, unlockTier: 4, research: 'hover_tech', cost: { alloy: 40, steel: 60, electronics: 30 } },
  { id: 'armored_rover', name: 'Armored Rover', icon: '🛻', model: 'armored_rover', description: 'A plated six-wheeler with a roomy cargo bay. Nothing on this planet can stop it.', speed: 2.7, storage: 650, unlockTier: 5, research: 'hover_tech', cost: { alloy: 80, steel: 160, electronics: 40, nano: 6 } },
  { id: 'titanium_hovercraft', name: 'Titanium Hovercraft', icon: '🛸', model: 'titanium_hovercraft', description: 'The pinnacle of travel: a gleaming titanium hovercraft with a glowing core and a cargo bay for days.', speed: 4.4, storage: 1500, hover: true, unlockTier: 6, research: 'titan_hover', cost: { titanium: 60, nano: 30, energy_cell: 30, alloy: 60 } },
];
