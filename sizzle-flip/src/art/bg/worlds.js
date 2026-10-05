// Per-world background painters (kitchen lives in kitchen.js).
import { drawLivingBG } from './living.js';
import { drawBackyardBG } from './backyard.js';
import { drawBathroomBG } from './bathroom.js';
import { drawOfficeBG } from './office.js';
import { drawToyroomBG } from './toyroom.js';
import { drawMarketBG } from './market.js';
import { drawBeachBG } from './beach.js';
import { drawSpaceBG } from './space.js';
import { drawHeavenBG } from './heaven.js';

export const BG_WORLDS = {
  living: drawLivingBG, backyard: drawBackyardBG, bathroom: drawBathroomBG, office: drawOfficeBG,
  toyroom: drawToyroomBG, market: drawMarketBG, beach: drawBeachBG, space: drawSpaceBG, heaven: drawHeavenBG,
};
