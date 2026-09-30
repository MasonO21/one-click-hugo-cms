/* ====================== PURCHASES (StoreKit through the native bridge) ====================== */
/* k: c = consumable, n = non-consumable, s = auto-renewable subscription. usd is the intended value used only for the Patron rank. */
const PRODUCTS={
 badges_80:{k:'c',usd:.99},badges_500:{k:'c',usd:4.99},badges_1200:{k:'c',usd:9.99},badges_2600:{k:'c',usd:19.99},badges_7000:{k:'c',usd:49.99},badges_15000:{k:'c',usd:99.99},
 piggy:{k:'c',usd:2.99},deal_crates:{k:'c',usd:2.99},deal_cash:{k:'c',usd:4.99},deal_recruit:{k:'c',usd:7.99},
 starter:{k:'n',usd:1.99},pass_premium:{k:'n',usd:9.99},auto_basic:{k:'n',usd:4.79},auto_combo:{k:'n',usd:9.59},auto_upgrade:{k:'n',usd:4.79},
 vip_weekly:{k:'s',usd:4.99},
};
const Pay={
  info:{},loaded:false,entitlementsOk:false,
  id:s=>APP.bundle+'.'+s,
  suffix:id=>(typeof id==='string'&&id.indexOf(APP.bundle+'.')===0)?id.slice(APP.bundle.length+1):null,
  /* In the app the price is always what StoreKit returns for the player's storefront. The preview uses a plain USD label. */
  price(s){ const i=Pay.info[s]; if(i&&i.displayPrice) return i.displayPrice; return APP.native?'':'$'+PRODUCTS[s].usd.toFixed(2); },
  available(s){ return APP.native?!!Pay.info[s]:true; },
  tries:0,busy:false,
  /* Loads prices from the App Store. A failure retries with backoff, and again when the app comes back to the foreground or a purchase sheet opens,
     so one bad connection at launch never leaves purchases dead for the whole session. */
  async loadProducts(){
    if(!APP.native||Pay.loaded||Pay.busy) return;
    Pay.busy=true;
    const r=await Native.call({cmd:'products',ids:Object.keys(PRODUCTS).map(Pay.id)});
    Pay.busy=false;
    if(r.ok&&Array.isArray(r.products)&&r.products.length){
      r.products.forEach(p=>{ const s=Pay.suffix(p.id); if(s) Pay.info[s]=p; }); Pay.loaded=true; dirty('shop'); dirty('career');
      if(openSheet&&mroot.querySelector('#buyBtn')&&!sheetBusy) purchaseSheet(openSheet.s,openSheet.spec);
    } else { Pay.tries++; setTimeout(()=>Pay.loadProducts(),Math.min(60000,2000*Math.pow(2,Pay.tries))); }
  },
};

/* Give the player what a product promises. Called exactly once per transaction (see processTx). */
function grantSku(s,tx){
  const p=PRODUCTS[s]; if(!p) return;
  const b0=S.badges;
  /* A weekly renewal of Chief's Club only extends the subscription. It does not count again toward the Patron rank. */
  if(s==='vip_weekly'&&tx&&tx.originalId&&tx.originalId!==tx.id){
    S.vip=Math.max(S.vip,tx.expirationDate||0); recalc(); dirty('shop'); save(); toast(_("Chief's Club renewed"),'gold'); return;
  }
  let label=s;
  if(s.indexOf('badges_')===0){
    const pk=PACKS.find(x=>x.sku===s); const tot=packTotal(pk); S.badges+=tot; S.packs[pk.id]=1; label=_('{n} Gold Badges',{n:fmt(tot)});
  } else switch(s){
    case 'starter': S.starter=true; S.badges+=STARTER_BADGES; if(crateBuyAllowed()) S.crates.std+=STARTER_CRATES; else S.badges+=STARTER_CRATES*30; S.owned[0]+=25; addBoost('dbl',7200); label=_('Rookie Starter Pack'); break;
    case 'piggy': { const n=piggyBadges(); S.badges+=n; S.piggy=0; label=_('{n} Gold Badges from the Evidence Safe',{n}); } break;
    case 'deal_crates': case 'deal_cash': case 'deal_recruit': { const d=DEALS.find(x=>x.sku===s); S.deals[dayKey()+d.id]=1; d.give(); label=d.n; } break;
    case 'pass_premium': S.pass.premium=true; label=_('Career Pass Premium'); break;
    case 'auto_basic': S.perm.auto=Math.max(S.perm.auto||0,1); S.autoOn=true; label=_('Auto-Clicker'); break;
    case 'auto_combo': case 'auto_upgrade': S.perm.auto=2; S.autoOn=true; label=_('Combo Auto-Clicker'); break;
    case 'vip_weekly': S.vip=Math.max(S.vip,(tx&&tx.expirationDate)||now()+7*864e5); label=_("Chief's Club"); break;
  }
  S.spent=Math.round((S.spent+p.usd)*100)/100;
  /* Remember how many Gold Badges this transaction gave, in case Apple refunds it later. */
  if(tx&&tx.id&&S.badges>b0){ S.txb[tx.id]=S.badges-b0; const ks=Object.keys(S.txb); if(ks.length>300) delete S.txb[ks[0]]; }
  recalc(); patronCheck(); sfx('level'); Native.haptic('success'); toast(_('Purchased: {item}',{item:label}),'gold');
  dirty('shop'); dirty('career'); dirty('roster'); save();
}

/* Grant once (de-duplicated by transaction id), save, then tell StoreKit the transaction is finished.
   A refund arrives as the same transaction again with revoked=true: unlocks are taken back, the Patron total goes down,
   and Gold Badges the purchase gave are removed from the balance as far as they have not been spent. */
async function processTx(tx){
  if(!tx||!tx.id) return;
  const s=Pay.suffix(tx.productId);
  if(s&&PRODUCTS[s]){
    if(tx.revoked) await refundTx(s,tx);
    else if(S.txs.indexOf(tx.id)<0){
      S.txs.push(tx.id); if(S.txs.length>300) S.txs.shift();
      grantSku(s,tx);
    }
  }
  await saveNow();
  await Native.call({cmd:'finish',txId:tx.id});
}
async function refundTx(s,tx){
  const mark='r:'+tx.id;
  if(S.txs.indexOf(tx.id)>=0&&S.txs.indexOf(mark)<0){
    S.txs.push(mark); if(S.txs.length>300) S.txs.shift();
    const renewal=s==='vip_weekly'&&tx.originalId&&tx.originalId!==tx.id;   /* renewals never counted toward the Patron total */
    if(!renewal) S.spent=Math.max(0,Math.round((S.spent-PRODUCTS[s].usd)*100)/100);
    const b=S.txb[tx.id]||0; delete S.txb[tx.id];
    if(b>0){ S.badges=Math.max(0,S.badges-b); toast(_('A purchase was refunded, so its Gold Badges were removed'),'bad'); }
    lastPatron=patronTier(); recalc(); dirty('shop'); dirty('career'); save();
  }
  if(PRODUCTS[s].k==='n') await revokeUnlock(s);
}
/* After Apple refunds a one-time unlock, re-read what the player still owns and drop the rest. */
async function revokeUnlock(s){
  const r=await Native.call({cmd:'entitlements'});
  if(!r.ok||!Array.isArray(r.entitlements)) return;
  const own={}; r.entitlements.forEach(t=>{ const k=Pay.suffix(t.productId); if(k&&!t.revoked) own[k]=1; });
  const lvl=(own.auto_combo||own.auto_upgrade)?2:own.auto_basic?1:0;
  let changed=false;
  if(s.indexOf('auto_')===0&&(S.perm.auto||0)>lvl){ S.perm.auto=lvl; changed=true; }
  if(s==='pass_premium'&&!own.pass_premium&&S.pass.premium){ S.pass.premium=false; changed=true; }
  if(changed){ recalc(); dirty('shop'); dirty('career'); dirty('roster'); save(); toast(_('A purchase was refunded, so its unlock was removed'),'bad'); }
}

/* Non-consumables and the subscription are mirrored from Apple's own record of what the player owns. */
function applyEntitlements(list){
  let changed=false;
  const own={}; list.forEach(t=>{ const s=Pay.suffix(t.productId); if(s&&!t.revoked) own[s]=t; });
  if(own.pass_premium&&!S.pass.premium){ S.pass.premium=true; changed=true; }
  if(own.starter&&!S.starter){ S.starter=true; changed=true; }
  const lvl=(own.auto_combo||own.auto_upgrade)?2:own.auto_basic?1:0;
  if(lvl>(S.perm.auto||0)){ S.perm.auto=lvl; S.autoOn=true; changed=true; }
  const sub=own.vip_weekly&&own.vip_weekly.expirationDate?own.vip_weekly.expirationDate:0;
  if(S.vip!==sub){ S.vip=sub; changed=true; }
  if(changed){ recalc(); dirty('shop'); dirty('career'); dirty('roster'); save(); }
  return changed;
}
async function syncEntitlements(){
  const r=await Native.call({cmd:'entitlements'});
  if(r.ok&&Array.isArray(r.entitlements)){ Pay.entitlementsOk=true; applyEntitlements(r.entitlements); }
}
async function restorePurchases(){
  if(!APP.native){ toast(_('Restore is available in the App Store version')); return; }
  toast(_('Checking with the App Store...'));
  const r=await Native.call({cmd:'restore'});
  if(!r.ok||!Array.isArray(r.entitlements)){ toast(_('Could not reach the App Store. Try again later.'),'bad'); return; }
  Pay.entitlementsOk=true;
  toast(applyEntitlements(r.entitlements)?_('Purchases restored'):_('Nothing new to restore'),'good');
}
function manageSubscription(){
  if(APP.native) Native.call({cmd:'manageSubscriptions'}).then(r=>{ if(!r.ok) Native.open(APP.urls.subscriptions); });
  else Native.open(APP.urls.subscriptions);
}

/* The App Store country decides the regional rules (see LOOT_BLOCKED_REGIONS). Re-read when the app comes back. */
async function readStorefront(){
  const sf=await Native.call({cmd:'storefront'});
  if(sf.ok&&typeof sf.countryCode==='string'&&sf.countryCode){ const c=sf.countryCode.toUpperCase(),v=ISO3[c]||c; if(v!==APP.storefront){ APP.storefront=v; dirty('ops'); dirty('shop'); dirty('career'); } }
}
/* Save to both copies and wait for the app's file to be written. */
function saveNow(){ save(); return APP.native?Native.call({cmd:'save',data:JSON.stringify(S)}):Promise.resolve({ok:true}); }
/* Approximate real-money value of a Gold Badge price, at the rate of the smallest Gold Badge pack (the highest price per badge),
   in the player's App Store currency. Shown next to Gold Badge prices so the real cost is never hidden. */
function badgeValue(n){
  const pk=PACKS[0],ref=Pay.info[pk.sku]; let price,cur;
  if(ref&&ref.price&&ref.currency){ price=parseFloat(ref.price); cur=ref.currency; }
  else if(!APP.native){ price=PRODUCTS[pk.sku].usd; cur='USD'; }
  if(!(price>0)||!cur) return '';
  try{ return new Intl.NumberFormat(LANG,{style:'currency',currency:cur,minimumFractionDigits:2,maximumFractionDigits:2}).format(price*n/(pk.b+pk.bonus)); }catch(e){ return ''; }
}
const bvHTML=n=>{ const v=badgeValue(n); return v?`<span class="val">${eT('about {price}',{price:v})}</span>`:''; };
/* Started once when the app launches. */
async function bootPurchases(){
  window.NPNative={
    onTransaction(tx){ processTx(tx); },
    onBackground(){ save(); },
    onForeground(){ if(!Pay.loaded) Pay.loadProducts(); readStorefront(); },
  };
  if(!APP.native) return;
  await readStorefront();
  await Pay.loadProducts();
  const u=await Native.call({cmd:'unfinished'});
  if(u.ok&&Array.isArray(u.transactions)) for(const tx of u.transactions) await processTx(tx);
  await syncEntitlements();
}

/* The purchase sheet: shows what you get and the real price, with the disclosures Apple requires for subscriptions. */
let sheetBusy=false,openSheet=null;
function purchaseSheet(s,spec){
  if(sheetBusy){ toast(_('A purchase is already in progress')); return; }
  if(APP.native&&!Pay.loaded) Pay.loadProducts();
  openSheet={s,spec};
  const p=PRODUCTS[s],price=Pay.price(s),sub=p.k==='s',ok=Pay.available(s);
  const btn=APP.native?(ok?(sub?_('Buy for {price} / week',{price}):_('Buy for {price}',{price})):_('Price unavailable')):_('Confirm (preview)');
  const link=(x,label)=>`<button class="linkbtn" data-x="${x}">${esc(label)}</button>`;
  modal(`<div class="co"><h3>${esc(_('Confirm purchase'))}</h3><p><b>${esc(spec.title)}</b></p><div class="price">${esc(price||'...')}${sub?` <small>${esc(_('per week'))}</small>`:''}</div><ul>${spec.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`+
   (spec.crates&&spec.crates.length?`<div class="co"><p class="fine">${esc(_('Crates hold random rewards. The odds:'))}</p>${spec.crates.map(oddsHTML).join('')}<p class="fine">${esc(_('Elite and Legend crates guarantee Epic or better gear within every 10 opens.'))}</p></div>`:'')+
   (sub?`<p class="fine">${esc(_("Chief's Club renews automatically every week until you cancel. Payment is charged to your Apple Account when you confirm. Cancel at least 24 hours before the end of the current week in Settings, then your name, then Subscriptions. Deleting the app does not cancel it."))}</p>`:'')+
   (APP.native?'':`<div class="co"><div class="note">${esc(_('Web preview: nothing is charged. Confirming only hands you the items.'))}</div></div>`)+
   `<button class="btn green" data-x="ok" id="buyBtn" ${ok?'':'disabled'}>${esc(btn)}</button><button class="btn neutral" data-x="close" id="cancelBtn">${esc(_('Cancel'))}</button>`+
   `<p class="fine">${esc(_('By buying you agree to the {terms}, {privacy} and {purchase}.')).replace('{terms}',link('terms',_('Terms of Use'))).replace('{privacy}',link('privacy',_('Privacy Policy'))).replace('{purchase}',link('purch',_('Purchase Terms')))}</p>`,
   {ok(){ runPurchase(s); return false; },
    terms(){ Native.openLegal('terms'); return false; },privacy(){ Native.openLegal('privacy'); return false; },purch(){ Native.openLegal('purchases'); return false; }});
}
async function runPurchase(s){
  if(sheetBusy) return; sheetBusy=true;
  /* While Apple's sheet is up, this sheet cannot be closed or replaced, and only this sheet is closed afterwards. */
  const own=mroot.firstElementChild; mSticky=true;
  const b=$('#buyBtn'); if(b){ b.disabled=true; b.textContent=_('Processing...'); }
  mroot.querySelectorAll('.x,#cancelBtn').forEach(e=>{ e.hidden=true; });
  const done=()=>{ if(mroot.firstElementChild===own){ mSticky=false; closeModal(); } };
  try{
    if(!APP.native){ grantSku(s,{id:'preview-'+Date.now(),expirationDate:null}); done(); return; }
    const r=await Native.call({cmd:'purchase',id:Pay.id(s)});
    if(!r.ok){ toast(_('Purchase failed. You were not charged.'),'bad'); done(); }
    else if(r.status==='success'&&r.tx){ done(); await processTx(r.tx); }
    else if(r.status==='pending'){ toast(_('Purchase pending approval. It will arrive when approved.'),'gold'); done(); }
    else done();
  } finally { sheetBusy=false; openSheet=null; if(mroot.firstElementChild===own) mSticky=false; }
}
