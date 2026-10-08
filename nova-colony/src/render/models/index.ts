/**
 * Model library entry point. Importing this module registers every procedural building model.
 */
import './homestead';
import './industry';
import './defense';
import './commandCenter';
import './decorCosmetic';

export { buildModel, retainModel, releaseModel, pruneModels, modelCacheStats, registeredModelKeys, hasModel, type ModelSpec, type PartSpec, type PartAnim, type EmitterSpec } from './spec';
export { pieceGeometry, pieceFullKey, WALL_H, FLOOR_TOP, ROOF_Y, type PieceGeoKey } from './pieces';
export { nodeGeometry, nodeGeometryFar, propGeometry, nodeHeight, nodeChipColor, nodeVariant, baseModel, KNOWN_NODE_MODELS, KNOWN_PROP_MODELS, NODE_FAR_MODELS } from './nature';
export { poiGeometry, poiHeight, markerGeometry, eventMarkerGeometry, KNOWN_POI_MODELS } from './pois';
export { partGeometry, toolGeometry, gunGeometry, vehicleGeometry, vehicleSeatY, vehicleHovers, KNOWN_VEHICLE_MODELS, LEG_TOP, BODY_H, SHOULDER_Y, NECK_Y, type PartKey } from './characters';
export { alienGeometry, KNOWN_ALIEN_MODELS, type AlienGeo } from './aliens';
export { TURRET_KEYS } from './defense';
