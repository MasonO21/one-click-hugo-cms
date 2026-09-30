'use strict';
/* =====================================================================
   {{APP_NAME}}  -  idle first-responder incremental (3 worlds)
   Platform layer: talks to the iOS shell through one WKWebView message
   handler ("np"). When the page runs outside the app (web preview, tests)
   every call resolves to {ok:false} and the game falls back gracefully.
   ===================================================================== */
const BOOT=(typeof window!=='undefined'&&window.NP_BOOT)||null;
const APP={
  name:'{{APP_NAME}}',version:'{{VERSION}}',build:'{{BUILD}}',bundle:'{{BUNDLE_ID}}',
  urls:{privacy:'{{PRIVACY_URL}}',terms:'{{TERMS_URL}}',support:'{{SUPPORT_URL}}',purchases:'{{PURCHASE_TERMS_URL}}',odds:'{{ODDS_URL}}',notices:'{{NOTICES_URL}}',subscriptions:'https://apps.apple.com/account/subscriptions'},
  native:!!(BOOT&&window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.np),
  region:String((BOOT&&BOOT.region)||'').toUpperCase(),
  storefront:'',
  reduceMotion:!!((BOOT&&BOOT.reduceMotion)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)),
};
/* Paid random items: buying crates with Gold Badges, the Crate Trio deal, crates in the Starter Pack and on the paid
   Career Pass track. ON. The app is not offered in countries that ban them (see appstore/COMPLIANCE_BY_COUNTRY.md);
   as a safety net they are also switched off when the App Store country or the device region is one of these.
   BE: Belgian gambling law. BR: Law 15.211/2025 (ECA Digital). */
const PAID_RANDOM=true;
const LOOT_BLOCKED_REGIONS=['BE','BR'];
const ISO3={BEL:'BE',BRA:'BR',USA:'US',GBR:'GB',DEU:'DE',FRA:'FR',NLD:'NL',ESP:'ES',ITA:'IT',JPN:'JP',KOR:'KR',CHN:'CN',TWN:'TW',HKG:'HK',CAN:'CA',AUS:'AU',MEX:'MX'};
const crateBuyAllowed=()=>PAID_RANDOM&&!LOOT_BLOCKED_REGIONS.includes(APP.region)&&!LOOT_BLOCKED_REGIONS.includes(APP.storefront);
/* Legal pages are hosted per language: https://host/path/privacy.html (English) and https://host/path/fr/privacy.html. */
function legalURL(k){
  const u=APP.urls[k]; if(!u||k==='subscriptions'||LANG==='en') return u;
  return u.replace(/\/([^\/?#]+)$/,'/'+LANG.toLowerCase()+'/$1');
}

const Native={
  call(msg){
    if(!APP.native) return Promise.resolve({ok:false,error:'unavailable'});
    try{
      return window.webkit.messageHandlers.np.postMessage(msg)
        .then(r=>(r&&typeof r==='object')?r:{ok:false,error:'bad reply'})
        .catch(e=>({ok:false,error:String((e&&e.message)||e)}));
    }catch(e){ return Promise.resolve({ok:false,error:String(e)}); }
  },
  save(json){ if(APP.native) Native.call({cmd:'save',data:json}); },
  wipe(){ return Native.call({cmd:'wipe'}); },
  haptic(style){ if(APP.native&&S.haptics!==false) Native.call({cmd:'haptic',style}); },
  openLegal(k){ return Native.open(legalURL(k)); },
  open(url){
    if(APP.native) return Native.call({cmd:'openUrl',url});
    try{ window.open(url,'_blank','noopener'); }catch(e){}
    return Promise.resolve({ok:true});
  },
};
