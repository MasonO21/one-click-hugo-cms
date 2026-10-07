import type { ProfessionDef, TraitDef } from './schema';

export const PROFESSIONS: ProfessionDef[] = [
  { id: 'gatherer', name: 'Gatherer', icon: '🧺', color: '#c9a86b', description: 'Collects wood, stone and fiber around the colony.' },
  { id: 'farmer', name: 'Farmer', icon: '🧑‍🌾', color: '#7cc36b', description: 'Tends crops, greenhouses and hydroponics.' },
  { id: 'engineer', name: 'Engineer', icon: '🛠️', color: '#f0a64b', description: 'Builds faster and repairs structures.' },
  { id: 'electrician', name: 'Electrician', icon: '⚡', color: '#ffd84a', description: 'Keeps generators and the power grid humming.' },
  { id: 'scientist', name: 'Scientist', icon: '🔬', color: '#8fa8ff', description: 'Generates research points in labs.' },
  { id: 'doctor', name: 'Doctor', icon: '🩺', color: '#ff8fa3', description: 'Runs medical rooms, keeping everyone healthy and happy.' },
  { id: 'cook', name: 'Cook', icon: '🍳', color: '#ff9e5e', description: 'Turns crops into delicious meals.' },
  { id: 'miner', name: 'Miner', icon: '⛏️', color: '#a39588', description: 'Works quarries, mines and drills.' },
  { id: 'guard', name: 'Guard', icon: '🛡️', color: '#e05a5a', description: 'Mans towers and boosts defenses.' },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', color: '#9fb4c7', description: 'Runs factories, garages and machines.' },
  { id: 'water_tech', name: 'Water Technician', icon: '🚰', color: '#4fb3f6', description: 'Operates pumps and purifiers.' },
  { id: 'drone_tech', name: 'Drone Technician', icon: '🛸', color: '#5ef2ff', description: 'Maintains drone hubs and robots.' },
  { id: 'logistics', name: 'Logistics Worker', icon: '📦', color: '#c7a0e8', description: 'Optimizes storage and hauling.' },
];

export const TRAITS: TraitDef[] = [
  { id: 'cheerful', name: 'Cheerful', description: 'Always looks on the bright side.', happiness: 10 },
  { id: 'hardworking', name: 'Hard-working', description: 'Puts in the extra hour.', productivity: 0.15 },
  { id: 'speedy', name: 'Speedy', description: 'Gets from A to B in a hurry.', speed: 0.25 },
  { id: 'genius', name: 'Genius', description: 'Brilliant at everything technical.', productivity: 0.25 },
  { id: 'cozy', name: 'Homebody', description: 'Loves a comfy bedroom.', happiness: 6 },
  { id: 'optimist', name: 'Optimist', description: 'Believes in the colony.', happiness: 5, productivity: 0.05 },
  { id: 'night_owl', name: 'Night Owl', description: 'Productive at odd hours.', productivity: 0.1 },
  { id: 'storyteller', name: 'Storyteller', description: 'Keeps spirits high around the campfire.', happiness: 8 },
];
