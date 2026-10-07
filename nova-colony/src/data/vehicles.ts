import type { VehicleDef } from './schema';

export const VEHICLES: VehicleDef[] = [
  { id: 'atv', name: 'ATV', icon: '🏍️', model: 'atv', description: 'A rugged four-wheeler. Zippy and fun.', speed: 1.8, storage: 60, unlockTier: 1, cost: { wood: 80, stone: 60, fiber: 40 } },
];
