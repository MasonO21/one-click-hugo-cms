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
  reduceMotion:!!((BOOT&&BOOT.reduceMotion)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)),
};
/* Regions where buying randomized crates with Gold Badges is switched off (paid loot-box restrictions). */
const LOOT_BLOCKED_REGIONS=['BE'];
const crateBuyAllowed=()=>!LOOT_BLOCKED_REGIONS.includes(APP.region);

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
  open(url){
    if(APP.native) return Native.call({cmd:'openUrl',url});
    try{ window.open(url,'_blank','noopener'); }catch(e){}
    return Promise.resolve({ok:true});
  },
};
