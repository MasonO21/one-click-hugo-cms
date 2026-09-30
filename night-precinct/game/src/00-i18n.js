'use strict';
/* =====================================================================
   Languages. The English text is the key: calling the underscore function
   with an English string looks it up in the active catalog and falls back
   to English when a translation is missing. Placeholders use {name}.
   Catalogs live in game/i18n/<code>.json and are embedded by build.py.
   ===================================================================== */
const LANGS=[['en','English'],['es','Español'],['fr','Français'],['de','Deutsch'],['it','Italiano'],['pt-BR','Português (Brasil)'],['ja','日本語'],['ko','한국어'],['zh-Hans','简体中文'],['zh-Hant','繁體中文']];
const I18N_RAW=/*I18N_DATA*/{};
const COMMA_DEC=['es','fr','de','it','pt-BR'];
/* Languages the game can actually show: English plus every catalog embedded by build.py. */
const availLangs=()=>LANGS.filter(x=>x[0]==='en'||I18N_RAW[x[0]]);
let LANG='en',CAT=null,DEC='.';

function matchLang(tag){
  const l=String(tag||'').replace(/_/g,'-').toLowerCase(); if(!l) return null;
  const has=c=>availLangs().some(x=>x[0]===c)?c:null;
  if(l.startsWith('zh')) return has(/hant|-tw|-hk|-mo/.test(l)?'zh-Hant':'zh-Hans');
  if(l.startsWith('pt')) return has('pt-BR');
  const base=l.split('-')[0];
  return availLangs().some(x=>x[0]===base)?base:null;
}
function deviceLang(){
  const b=(typeof window!=='undefined'&&window.NP_BOOT)||{},list=[];
  if(Array.isArray(b.languages)) list.push(...b.languages);
  if(b.locale) list.push(b.locale);
  if(typeof navigator!=='undefined'){ if(navigator.languages) list.push(...navigator.languages); else if(navigator.language) list.push(navigator.language); }
  for(const t of list){ const m=matchLang(t); if(m) return m; }
  return 'en';
}
/* Set the active language. 'auto' (or anything unknown) follows the device. */
function setLang(pref){
  let code=pref&&pref!=='auto'&&availLangs().some(x=>x[0]===pref)?pref:deviceLang();
  CAT=null;
  if(code!=='en'){ try{ CAT=JSON.parse(I18N_RAW[code]||'null'); }catch(e){ CAT=null; } if(!CAT) code='en'; }
  LANG=code; DEC=COMMA_DEC.includes(code)?',':'.';
  if(typeof document!=='undefined') document.documentElement.lang=code;
  return code;
}
function _(s,v){
  let r=(CAT&&CAT[s])||s;
  if(v) r=r.replace(/\{(\w+)\}/g,(m,k)=>(k in v)?String(v[k]):m);
  return r;
}
/* Marks a literal for translation without translating it here (it is translated where it is shown). */
const N_=s=>s;
/* English adds an s to a unit name for "25 Detectives"; other catalogs phrase around the plural. */
const plu=n=>LANG==='en'?n+'s':n;
const langName=c=>(LANGS.find(x=>x[0]===c)||LANGS[0])[1];

/* Translate string fields of the game data in place. The English original is kept in a hidden
   property so switching language again always starts from English. */
const I18N_SEEN=new Map();   /* English string -> where it is used (for the translation catalog) */
function trData(o,k,ctx){
  const hk='__en_'+k;
  if(!Object.prototype.hasOwnProperty.call(o,hk)) Object.defineProperty(o,hk,{value:o[k],enumerable:false});
  const tr=x=>{ if(Array.isArray(x)) return x.map(tr); if(typeof x==='string'){ if(!I18N_SEEN.has(x)) I18N_SEEN.set(x,ctx||k); return _(x); } return x; };
  o[k]=tr(o[hk]);
}
