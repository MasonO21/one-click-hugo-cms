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
  async loadProducts(){
    if(!APP.native) return;
    const r=await Native.call({cmd:'products',ids:Object.keys(PRODUCTS).map(Pay.id)});
    if(r.ok&&Array.isArray(r.products)){ r.products.forEach(p=>{ const s=Pay.suffix(p.id); if(s) Pay.info[s]=p; }); Pay.loaded=true; dirty('shop'); dirty('career'); }
  },
};

/* Give the player what a product promises. Called exactly once per transaction (see processTx). */
function grantSku(s,tx){
  const p=PRODUCTS[s]; if(!p) return;
  /* A weekly renewal of Chief's Club only extends the subscription. It does not count again toward the Patron rank. */
  if(s==='vip_weekly'&&tx&&tx.originalId&&tx.originalId!==tx.id){
    S.vip=Math.max(S.vip,tx.expirationDate||0); recalc(); dirty('shop'); save(); toast("Chief's Club renewed",'gold'); return;
  }
  let label=s;
  if(s.indexOf('badges_')===0){
    const pk=PACKS.find(x=>x.sku===s); const tot=packTotal(pk); S.badges+=tot; S.packs[pk.id]=1; label=fmt(tot)+' Gold Badges';
  } else switch(s){
    case 'starter': S.starter=true; S.badges+=300; S.crates.std+=3; S.owned[0]+=25; addBoost('dbl',7200); label='Rookie Starter Pack'; break;
    case 'piggy': { const n=piggyBadges(); S.badges+=n; S.piggy=0; label=n+' Gold Badges from the Evidence Safe'; } break;
    case 'deal_crates': case 'deal_cash': case 'deal_recruit': { const d=DEALS.find(x=>x.sku===s); S.deals[dayKey()+d.id]=1; d.give(); label=d.n; } break;
    case 'pass_premium': S.pass.premium=true; label='Career Pass Premium'; break;
    case 'auto_basic': S.perm.auto=Math.max(S.perm.auto||0,1); S.autoOn=true; label='Auto-Clicker'; break;
    case 'auto_combo': case 'auto_upgrade': S.perm.auto=2; S.autoOn=true; label='Combo Auto-Clicker'; break;
    case 'vip_weekly': S.vip=Math.max(S.vip,(tx&&tx.expirationDate)||now()+7*864e5); label="Chief's Club"; break;
  }
  S.spent=Math.round((S.spent+p.usd)*100)/100;
  recalc(); patronCheck(); sfx('level'); Native.haptic('success'); toast('Purchased: '+label,'gold');
  dirty('shop'); dirty('career'); dirty('roster'); save();
}

/* Grant once (de-duplicated by transaction id), then tell StoreKit the transaction is finished.
   A refund arrives as the same transaction again with revoked=true: unlocks are taken back, spent currency is not. */
async function processTx(tx){
  if(!tx||!tx.id) return;
  const s=Pay.suffix(tx.productId);
  if(s&&PRODUCTS[s]){
    if(tx.revoked){ if(PRODUCTS[s].k==='n') await revokeUnlock(s); }
    else if(S.txs.indexOf(tx.id)<0){
      S.txs.push(tx.id); if(S.txs.length>300) S.txs.shift();
      grantSku(s,tx);
    }
  }
  await Native.call({cmd:'finish',txId:tx.id});
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
  if(changed){ recalc(); dirty('shop'); dirty('career'); dirty('roster'); save(); toast('A purchase was refunded, so its unlock was removed','bad'); }
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
  if(!APP.native){ toast('Restore is available in the App Store version'); return; }
  toast('Checking with the App Store...');
  const r=await Native.call({cmd:'restore'});
  if(!r.ok||!Array.isArray(r.entitlements)){ toast('Could not reach the App Store. Try again later.','bad'); return; }
  Pay.entitlementsOk=true;
  toast(applyEntitlements(r.entitlements)?'Purchases restored':'Nothing new to restore','good');
}
function manageSubscription(){
  if(APP.native) Native.call({cmd:'manageSubscriptions'}).then(r=>{ if(!r.ok) Native.open(APP.urls.subscriptions); });
  else Native.open(APP.urls.subscriptions);
}

/* Started once when the app launches. */
async function bootPurchases(){
  window.NPNative={
    onTransaction(tx){ processTx(tx); },
    onBackground(){ save(); },
    onForeground(){},
  };
  if(!APP.native) return;
  await Pay.loadProducts();
  const u=await Native.call({cmd:'unfinished'});
  if(u.ok&&Array.isArray(u.transactions)) for(const tx of u.transactions) await processTx(tx);
  await syncEntitlements();
}

/* The purchase sheet: shows what you get and the real price, with the disclosures Apple requires for subscriptions. */
let sheetBusy=false;
function purchaseSheet(s,spec){
  const p=PRODUCTS[s],price=Pay.price(s),sub=p.k==='s',ok=Pay.available(s);
  const btn=APP.native?(ok?'Buy for '+price+(sub?' / week':''):'Price unavailable'):'Confirm (preview)';
  modal(`<div class="co"><h3>Confirm purchase</h3><p><b>${esc(spec.title)}</b></p><div class="price">${esc(price||'...')}${sub?' <small>per week</small>':''}</div><ul>${spec.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`+
   (spec.crates&&spec.crates.length?`<div class="co"><p class="fine">Crates hold random rewards. The odds:</p>${spec.crates.map(oddsHTML).join('')}<p class="fine">Elite and Legend crates guarantee Epic or better gear within every 10 opens.</p></div>`:'')+
   (sub?`<p class="fine">Chief's Club renews automatically every week until you cancel. Payment is charged to your Apple Account when you confirm. Cancel at least 24 hours before the end of the current week in Settings, then your name, then Subscriptions. Deleting the app does not cancel it.</p>`:'')+
   (APP.native?'':`<div class="co"><div class="note">Web preview: nothing is charged. Confirming only hands you the items.</div></div>`)+
   `<button class="btn green" data-x="ok" id="buyBtn" ${ok?'':'disabled'}>${esc(btn)}</button><button class="btn ghost" data-x="close">Cancel</button>`+
   `<p class="fine">By buying you agree to the <button class="linkbtn" data-x="terms">Terms of Use</button>, <button class="linkbtn" data-x="privacy">Privacy Policy</button> and <button class="linkbtn" data-x="purch">Purchase Terms</button>.</p>`,
   {ok(){ runPurchase(s); return false; },
    terms(){ Native.open(APP.urls.terms); return false; },privacy(){ Native.open(APP.urls.privacy); return false; },purch(){ Native.open(APP.urls.purchases); return false; }});
}
async function runPurchase(s){
  if(sheetBusy) return; sheetBusy=true;
  const b=$('#buyBtn'); if(b){ b.disabled=true; b.textContent='Processing...'; }
  try{
    if(!APP.native){ grantSku(s,{id:'preview-'+Date.now(),expirationDate:null}); closeModal(); return; }
    const r=await Native.call({cmd:'purchase',id:Pay.id(s)});
    if(!r.ok){ toast('Purchase failed. You were not charged.','bad'); closeModal(); }
    else if(r.status==='success'&&r.tx){ closeModal(); await processTx(r.tx); }
    else if(r.status==='pending'){ toast('Purchase pending approval. It will arrive when approved.','gold'); closeModal(); }
    else closeModal();
  } finally { sheetBusy=false; }
}
