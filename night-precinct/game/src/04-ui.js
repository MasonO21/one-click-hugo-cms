/* ====================== UI CORE ====================== */
const panel=$('#panel'),navEl=$('#nav'),mroot=$('#modal-root'),tickerEl=$('#ticker');
let cur='roster',mH={},mClose=null,mSticky=false;
const built={};const dirtyTabs={};const mq=[];
function dirty(t){ dirtyTabs[t]=true; }
function toast(msg,kind=''){
  const box=$('#toasts'),el=document.createElement('div'); el.className='toast '+kind; el.textContent=msg; box.appendChild(el);
  while(box.children.length>3) box.firstChild.remove();
  setTimeout(()=>el.remove(),2800);
}
function openShopHint(){ try{ $('#badgeBtn').animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:450}); }catch(e){} }
function modal(html,h={},opts={}){
  mroot.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${opts.sticky?'':'<button class="x" data-x="close" aria-label="Close">&times;</button>'}${html}</div>`;
  mH=h; mClose=opts.onClose||null; mSticky=!!opts.sticky; mroot.classList.add('on');
}
function closeModal(){
  mroot.classList.remove('on'); mroot.innerHTML=''; mH={}; mSticky=false;
  const f=mClose; mClose=null; if(f) f();
  if(!mroot.classList.contains('on')&&mq.length) setTimeout(()=>{ if(!mroot.classList.contains('on')&&mq.length) mq.shift()(); },250);
}
function queueModal(fn){ if(mroot.classList.contains('on')) mq.push(fn); else fn(); }
mroot.addEventListener('click',e=>{
  if(e.target===mroot){ if(!mSticky) closeModal(); return; }
  const b=e.target.closest('[data-x]'); if(!b) return;
  const k=b.dataset.x;
  if(k==='close'){ closeModal(); return; }
  const f=mH[k]; if(f&&f(b)!==false) closeModal();
});
let lastPatron=patronTier();
function patronCheck(){ const t=patronTier(); if(t>lastPatron){ toast(`${PATRON[t][1]} unlocked: +${Math.round(PATRON[t][2]*100)}% income forever`,'gold'); } lastPatron=t; }

/* ====================== TABS ====================== */
navEl.innerHTML=TABS.map(([id,label,path])=>`<button class="tab" role="tab" data-act="tab" data-t="${id}" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span>${label}</span><i class="dot" data-dot="${id}"></i></button>`).join('');
function showTab(t){
  cur=t; $$('.tab',navEl).forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));
  BUILD[t](); panel.scrollTop=0; REFRESH[t]();
}
function rebuildKeep(t){ const st=panel.scrollTop; BUILD[t](); panel.scrollTop=st; REFRESH[t](); }
const sec=(t,s='')=>`<div class="sec-h">${t}${s?` <small>${s}</small>`:''}</div>`;
const set=(root,f,v)=>{ const e=root.querySelector(`[data-f="${f}"]`); if(e&&e.textContent!==v) e.textContent=v; };
const badgeBtn=(price,act,attrs='',off=false,pre='')=>`<button class="btn sm${off?' off':''}" data-act="${act}" ${attrs}>${pre?`<span>${pre}</span>`:''}${bico}${fmt(price)}</button>`;

/* ---- HQ ---- */
function buildHQ(){
  let h=sec('Free Rewards','no ads, just cooldowns');
  h+=`<div class="list">
   <div class="card row sp"><div><b>Rally Boost</b><div class="fine">All income x2 for 15 minutes. Ready every 3 hours.</div></div><button class="btn sm blue" data-act="rally" data-f="rb"><span data-f="cd1"></span></button></div>
   <div class="card row sp"><div><b>Supply Drop</b><div class="fine">A free ${crateName('std')}. Ready every 6 hours.</div></div><button class="btn sm blue" data-act="supply" data-f="sb"><span data-f="cd2"></span></button></div>
   <div class="card row sp"><div><b>Daily Roll Call</b><div class="fine" data-f="dl">Streak rewards, 7-day cycle</div></div><button class="btn sm" data-act="daily">Open</button></div>
   <div class="card row sp"><div><b>Settings and Legal</b><div class="fine">Sound, haptics, restore purchases, privacy, terms</div></div><button class="btn sm ghost" data-act="settings">Open</button></div>
  </div>`;
  h+=sec('Next Goal');
  h+=`<div class="card"><div class="row sp"><b data-f="goal">-</b><span class="mono fine" data-f="goalc"></span></div><div class="bar"><em data-f="goalb"></em></div>
   <div class="row sp" style="margin-top:10px"><b data-f="ptitle">Promotion</b><span class="mono fine" data-f="prom"></span></div><div class="bar gold"><em data-f="promb"></em></div></div>`;
  h+=sec(W.L.ledger,W.L.ledgerSub);
  h+=`<div class="card ledger"><div><span><b>${W.L.total}</b></span><span class="gold" data-f="tot">0</span></div>${GENS.map((g,i)=>`<div data-l="${i}" hidden><span>${g.crime}</span><span data-f="c${i}">0</span></div>`).join('')}</div>`;
  panel.innerHTML=h;
}
function refreshHQ(){
  const t=now();
  set(panel,'cd1',rallyReady()?'Claim':clock((S.rallyAt+RALLY_CD-t)/1000));
  set(panel,'cd2',supplyReady()?'Claim':clock((S.supplyAt+SUPPLY_CD-t)/1000));
  const rb=panel.querySelector('[data-f="rb"]'),sb=panel.querySelector('[data-f="sb"]'); if(rb) rb.classList.toggle('off',!rallyReady()); if(sb) sb.classList.toggle('off',!supplyReady());
  const st=dailyState(); set(panel,'dl',st.claimed?`Claimed today. Streak ${S.daily.streak}`:st.broken?'Streak broken. Restore it or restart':`Day ${st.day+1} reward is waiting`);
  let ni=GENS.findIndex((g,i)=>S.owned[i]===0&&(i===0||S.owned[i-1]>0)); if(ni<0) ni=GENS.length-1;
  const g=GENS[ni],c=unitCost(ni,1);
  set(panel,'goal',`${W.L.hire} a ${g.n}`); set(panel,'goalc',`${money(Math.min(S.funds,c))} / ${money(c)}`);
  const gb=panel.querySelector('[data-f="goalb"]'); if(gb) gb.style.width=clamp(S.funds/c*100,0,100)+'%';
  const rq=promoReq();
  set(panel,'ptitle',isTop()?'Re-enlist (Medals)':`Promotion to ${W.ranks[Math.min(S.promos+1,W.ranks.length-1)]}`);
  set(panel,'prom',canPromote()?'Ready!':`${money(Math.min(S.run,rq))} / ${money(rq)}`);
  const pb=panel.querySelector('[data-f="promb"]'); if(pb) pb.style.width=clamp(S.run/rq*100,0,100)+'%';
  let tot=0; GENS.forEach((gg,i)=>{ tot+=S.crimes[i]; const row=panel.querySelector(`[data-l="${i}"]`); if(!row) return; const show=S.crimes[i]>=1||S.owned[i]>0; if(row.hidden===show) row.hidden=!show; set(row,'c'+i,fmt(Math.floor(S.crimes[i]))); });
  set(panel,'tot',fmt(Math.floor(tot)));
}

/* ---- Roster ---- */
function visGens(){ let v=0; GENS.forEach((g,i)=>{ if(S.owned[i]>0||S.run>=g.cost*0.4) v=i; }); return Math.min(GENS.length-1,v+1); }
function buildRoster(){
  const vis=visGens(); built.roster=vis+'|'+S.amt+'|'+W.id;
  let h=sec(W.L.roster,W.L.rosterSub);
  h+=`<div class="row sp" style="margin-bottom:10px"><span class="fine">Buy amount</span><div class="seg" role="group" aria-label="Buy amount">${[1,10,100,'max'].map(a=>`<button data-act="amt" data-a="${a}" aria-pressed="${S.amt===a}">${a==='max'?'MAX':'x'+a}</button>`).join('')}</div></div><div class="list">`;
  for(let i=vis;i>=0;i--){
    const g=GENS[i],lk=i>0&&!(S.owned[i]>0||S.run>=g.cost*0.4);
    h+=`<div class="card gen${lk?' locked':''}" data-i="${i}">${lk?`<div style="filter:brightness(0) opacity(.55)">${portrait(i)}</div>`:portrait(i)}
      <div style="min-width:0"><div class="nm">${lk?'???':esc(g.n)} <em data-f="own"></em></div><div class="role">${lk?`Unlocks near ${money(g.cost)}`:esc(g.role)}</div><div class="stat" data-f="stat"></div><div class="bar"><em data-f="mile"></em></div></div>
      <button class="btn buy" data-act="hire" data-i="${i}" ${lk?'disabled':''}><span data-f="lbl">${lk?'Locked':W.L.hire}</span><small data-f="cost"></small></button></div>`;
  }
  panel.innerHTML=h+'</div>';
}
function refreshRoster(){
  if(built.roster!==visGens()+'|'+S.amt+'|'+W.id){ rebuildKeep('roster'); return; }
  $$('.gen',panel).forEach(card=>{
    const i=+card.dataset.i; if(card.classList.contains('locked')) return;
    const n=buyCount(i),c=unitCost(i,n);
    set(card,'own','x'+S.owned[i]);
    set(card,'stat',S.owned[i]?`${money(D.gen[i])}/s  (${money(D.unit[i])} ea)`:`${money(D.unit[i])}/s each`);
    const nx=MILE_T.find(t=>t>S.owned[i]); const bar=card.querySelector('[data-f="mile"]');
    const pr=nx?S.owned[i]/nx*100:100; if(bar) bar.style.width=pr+'%';
    set(card,'lbl',W.L.hire+' x'+n); set(card,'cost',money(c));
    card.querySelector('.buy').classList.toggle('off',S.funds<c);
  });
}

/* ---- Upgrades ---- */
const availUps=()=>UPS.filter(u=>!S.ups[u.id]&&u.ok()).sort((a,b)=>a.cost-b.cost).slice(0,30);
function buildUps(){
  const l=availUps(); built.ups=W.id+l.map(u=>u.id).join(',');
  let h=sec('Gear-Up','permanent boosts');
  if(!l.length) h+=`<div class="card fine">Nothing to buy yet. Grow your team and new equipment shows up here.</div>`;
  else h+='<div class="list">'+l.map(u=>`<div class="card up" data-id="${u.id}"><div class="glyph">${glyph(u.glyph,u.kind==='gen'?GENS[u.gen].col:'#ffc53d')}</div><div style="min-width:0"><b>${esc(u.name)}</b><span>${esc(u.desc)}</span></div><button class="btn sm" data-act="up" data-id="${u.id}">${money(u.cost)}</button></div>`).join('')+'</div>';
  panel.innerHTML=h;
}
function refreshUps(){
  if(built.ups!==W.id+availUps().map(u=>u.id).join(',')){ rebuildKeep('upgrades'); return; }
  $$('.up',panel).forEach(c=>{ const u=UPS.find(x=>x.id===c.dataset.id); c.querySelector('.btn').classList.toggle('off',S.funds<u.cost); });
}

/* ---- Cases ---- */
function buildOps(){
  const slots=opSlots(); let h=sec(W.L.ops,W.L.opsSub);
  h+='<div class="list">';
  for(let i=0;i<slots;i++){
    const s=S.ops[i];
    if(!s) h+=`<div class="card slot empty"><div class="ttl"><b>${W.L.squad} ${i+1}: idle</b><span class="fine">assign a job below</span></div></div>`;
    else h+=`<div class="card slot" data-s="${i}"><div class="ttl"><b>${opName(s.id)}</b><span class="mono" data-f="t"></span></div><div class="bar gold"><em data-f="b"></em></div><div class="row"><button class="btn sm green" data-act="claim" data-s="${i}" data-f="claim" hidden>Collect</button><button class="btn sm" data-act="speed" data-s="${i}" data-f="speed">Rush ${bico}<span data-f="sc"></span></button></div></div>`;
  }
  if(slots<5) h+=`<div class="card slot empty"><div class="ttl"><b>${5-slots} more ${W.L.squad.toLowerCase()} slot${5-slots>1?'s':''}</b><span class="fine">Chief's Club VIP, or buy in the Store</span></div></div>`;
  h+='</div>'+sec(W.L.cases);
  h+='<div class="list">'+OPS.map(o=>`<div class="card opcard"><div><b>${opName(o.id)}</b><span>${dur(o.dur)}  |  <span data-f="r_${o.id}"></span>${o.badge[1]?`  |  ${o.badge[0]}-${o.badge[1]} Badges`:''}${o.crate?`  |  ${Math.round(o.crate*100)}% crate`:''}</span></div><button class="btn sm blue" data-act="startOp" data-id="${o.id}">Assign</button></div>`).join('')+'</div>';
  h+=sec(W.L.locker,'open for loot and permanent gear');
  h+='<div class="crates">'+['std','elite','legend'].map(k=>`<div class="card crate">${crateSVG(k)}<b>${crateName(k)}</b><div class="n">You own <span data-f="n_${k}">0</span></div><button class="btn sm" data-act="openCrate" data-k="${k}" data-f="o_${k}">Open</button>${crateBuyAllowed()?`<div class="row">${badgeBtn(CRATES[k].price,'buyCrate',`data-k="${k}" data-n="1"`,false,'x1')}${badgeBtn(Math.round(CRATES[k].price*4.5),'buyCrate',`data-k="${k}" data-n="5"`,false,'x5')}</div>`:''}</div>`).join('')+'</div>';
  h+=`<div class="row sp" style="margin-top:8px"><span class="fine">Pity: the top two crates guarantee Epic+ gear within 10 opens.</span><button class="btn sm ghost" data-act="odds">Drop rates</button></div>`;
  h+=sec('Gear Locker',`<span data-f="gb"></span>`);
  h+='<div class="gear">'+GEARS.map(g=>`<div class="gtile" data-g="${g.id}" style="border-color:${RAR[g.r].c}55"><div class="glyph" style="color:${RAR[g.r].c}">${glyph(g.g)}</div><b>${g.n}</b><i data-f="gl_${g.id}"></i></div>`).join('')+'</div>';
  panel.innerHTML=h;
}
function refreshOps(){
  const key=W.id+opSlots()+'|'+S.ops.map(o=>o?o.id:'-').join();
  if(built.ops!==key){ built.ops=key; rebuildKeep('ops'); return; }
  $$('.slot[data-s]',panel).forEach(c=>{
    const i=+c.dataset.s,s=S.ops[i]; if(!s) return; const o=OPS.find(x=>x.id===s.id),left=opLeft(i),done=left<=0;
    set(c,'t',done?'READY':clock(left)); const b=c.querySelector('[data-f="b"]'); b.style.width=(100-left/o.dur*100)+'%';
    c.querySelector('[data-f="claim"]').hidden=!done; c.querySelector('[data-f="speed"]').hidden=done;
    set(c,'sc',String(speedCost(i)));
  });
  const free=S.ops.slice(0,opSlots()).some(x=>!x);
  $$('[data-act="startOp"]',panel).forEach(b=>b.classList.toggle('off',!free));
  OPS.forEach(o=>set(panel,'r_'+o.id,money(cashFor(o.k)*(W.opMul||1))));
  ['std','elite','legend'].forEach(k=>{ set(panel,'n_'+k,String(S.crates[k]||0)); const b=panel.querySelector(`[data-f="o_${k}"]`); if(b) b.classList.toggle('off',!S.crates[k]); });
  GEARS.forEach(g=>{ const lv=S.gear[g.id]||0; const t=panel.querySelector(`[data-g="${g.id}"]`); if(!t) return; t.classList.toggle('none',!lv); set(t,'gl_'+g.id,lv?`Lv ${lv}  +${(lv*RAR[g.r].b*100).toFixed(0)}%`:RAR[g.r].n); });
  set(panel,'gb',`+${(gearBonus()*100).toFixed(0)}% income`);
}
const ODDS_NAME={cash:'Cash payout',badge:'Gold Badges',g0:'Common gear',g1:'Rare gear',g2:'Epic gear',g3:'Legendary gear'};
/* Odds for one crate tier, shown inline wherever a purchase includes crates. */
function oddsHTML(k){ return `<div><b>${esc(crateName(k))} odds</b><div class="ledger">${CRATES[k].odds.map(([a,p])=>`<div><span>${ODDS_NAME[a]}</span><span>${(p*100).toFixed(0)}%</span></div>`).join('')}</div></div>`; }
function showOdds(){
  modal(`<h3>Drop rates</h3>${['std','elite','legend'].map(k=>`<div><b>${crateName(k)}</b><div class="ledger">${CRATES[k].odds.map(([a,p])=>`<div><span>${ODDS_NAME[a]}</span><span>${(p*100).toFixed(0)}%</span></div>`).join('')}</div></div>`).join('')}<p class="fine">Gear levels up on duplicates (max Lv 10). Maxed duplicates pay 3 Badges. The top two crates guarantee Epic+ every 10th open.</p><button class="btn" data-x="close">Got it</button>`);
}
function openCrateUI(type){
  const r=openCrate(type); if(!r){ sfx('no'); return; }
  const rar=r.g&&r.g.r!==undefined?RAR[r.g.r]:null;
  const col=rar?rar.c:r.kind==='badge'?'#ffc53d':'#39d98a';
  const gl=rar?r.g.g:r.g;
  sfx(rar&&r.g.r>=2?'siren':'coin'); if(rar&&r.g.r>=2){ Scene.flash(rar.c); Native.haptic('medium'); }
  const left=S.crates[type]||0;
  modal(`<div class="reveal"><div class="glyph spin" style="color:${col};border-color:${col}">${glyph(typeof gl==='string'?gl:'star')}</div>${rar?`<div class="mono" style="color:${col}">${rar.n.toUpperCase()}</div>`:''}<h4>${esc(r.t)}</h4></div>${left?`<button class="btn" data-x="again">Open another (${left} left)</button>`:''}<button class="btn ghost" data-x="close">Nice</button>`,{again(){ openCrateUI(type); return false; }});
}

/* ---- Store ---- */
const DEALS=[
 {id:'d0',sku:'deal_crates',n:'Crate Trio',lines:['3 Elite crates','+50 Gold Badges'],crates:['elite'],give(){ S.crates.elite+=3; S.badges+=50; }},
 {id:'d1',sku:'deal_cash',n:'Cash Crate',lines:['24 hours of income, instantly','+200 Gold Badges'],give(){ addFunds(cashFor(86400)); S.badges+=200; }},
 {id:'d2',sku:'deal_recruit',n:'Recruit Rush',lines:['+15 each of your first six unit types','+100 Gold Badges'],give(){ for(let i=0;i<6;i++) S.owned[i]+=15; S.badges+=100; }},
];
const dealsToday=()=>DEALS.filter(d=>d.sku!=='deal_crates'||crateBuyAllowed());
const ITEMS={
 dbl1:{n:'Double Time: 1 hour',d:'All income x2 for one hour',price:25,give(){ addBoost('dbl',3600); }},
 dbl24:{n:'Double Time: 24 hours',d:'All income x2 for a full day',price:300,give(){ addBoost('dbl',86400); }},
 warp1:{n:'Time Warp: 1 hour',d:'Get one hour of income right now',price:60,give(){ addFunds(D.ips*3600); },need:()=>D.ips>0},
 warp8:{n:'Time Warp: 8 hours',d:'Get eight hours of income right now',price:400,give(){ addFunds(D.ips*28800); },need:()=>D.ips>0},
 warp24:{n:'Time Warp: 24 hours',d:'Get a full day of income right now',price:1000,give(){ addFunds(D.ips*86400); },need:()=>D.ips>0},
 off1:{n:'Overtime Pay I',d:'Offline earnings cap: 4 hours',price:50,once:()=>S.perm.off>=1,give(){ S.perm.off=Math.max(S.perm.off,1); }},
 off2:{n:'Overtime Pay II',d:'Offline earnings cap: 8 hours',price:150,once:()=>S.perm.off>=2,need:()=>S.perm.off>=1,give(){ S.perm.off=Math.max(S.perm.off,2); }},
 off3:{n:'Overtime Pay III',d:'Offline earnings cap: 24 hours',price:400,once:()=>S.perm.off>=3,need:()=>S.perm.off>=2,give(){ S.perm.off=3; }},
 slot1:{n:'Extra Job Slot',d:'One more crew for timed jobs',price:150,once:()=>S.perm.slots>=1,give(){ S.perm.slots=Math.max(S.perm.slots,1); }},
 slot2:{n:'Second Extra Job Slot',d:'Another crew for timed jobs',price:400,once:()=>S.perm.slots>=2,need:()=>S.perm.slots>=1,give(){ S.perm.slots=2; }},
};
function buyItem(id){
  const it=ITEMS[id]; if(!it||(it.once&&it.once())) return;
  if(it.need&&!it.need()){ toast('Not available yet','bad'); sfx('no'); return; }
  if(!spend(it.price)) return; it.give(); recalc(); sfx('buy'); toast(it.n+' activated','good'); dirty('shop');
}
function buyCrate(k,n){ if(!crateBuyAllowed()){ toast('Not available in your region','bad'); return; } const price=n===5?Math.round(CRATES[k].price*4.5):CRATES[k].price; if(!spend(price)) return; S.crates[k]+=n; sfx('buy'); toast(`${n} x ${crateName(k)}`,'good'); dirty('ops'); }
function buyAgent(id){ const a=AGENTS.find(x=>x.id===id); if(S.agents[id]||!spend(a.price)) return; S.agents[id]=1; recalc(); sfx('level'); toast(`${a.n} joined your team`,'gold'); dirty('shop'); }
function skinAct(id){ const s=skinById(id); if(skinOwned(id)){ S.skin=id; sfx('buy'); dirty('shop'); return; } if(!spend(s.price)) return; S.skins[W.id+':'+id]=1; S.skin=id; sfx('level'); toast(`${s.n} unlocked`,'gold'); dirty('shop'); }
function themeAct(id){ const s=THEMES.find(x=>x.id===id); if(S.themes[id]){ S.theme=id; Scene.setTheme(); sfx('buy'); dirty('shop'); return; } if(!spend(s.price)) return; S.themes[id]=1; S.theme=id; Scene.setTheme(); sfx('level'); toast(`${s.n} unlocked`,'gold'); dirty('shop'); }
function packTotal(p){ return p.b+p.bonus+(S.packs[p.id]?0:p.b); }
function buyPack(id){ const p=PACKS.find(x=>x.id===id); const tot=packTotal(p); purchaseSheet(p.sku,{title:`${p.n}: ${fmt(tot)} Gold Badges`,lines:[`${fmt(p.b)} Gold Badges`,p.bonus?`+${fmt(p.bonus)} bonus`:null,!S.packs[p.id]?`+${fmt(p.b)} first-time bonus`:null,'Gold Badges have no cash value'].filter(Boolean)}); }
function buyStarter(){ purchaseSheet('starter',{title:'Rookie Starter Pack',lines:['300 Gold Badges','3 Standard crates','25 free '+GENS[0].n+'s','Double Time for 2 hours','One-time purchase'],crates:['std']}); }
function buyVIP(){ purchaseSheet('vip_weekly',{title:"Chief's Club (weekly subscription)",lines:['All income x1.5','Offline earnings at 100%, 8 hour minimum cap','+1 crew slot for timed jobs','Bounties auto-collect','25 Gold Badges every day']}); }
function buyPass(){ purchaseSheet('pass_premium',{title:'Career Pass: Premium',lines:['30 premium reward tiers','A cruiser skin and the Neon Rain skyline','Elite and Legend crates and 250 bonus Gold Badges','Unlocks every tier you already reached','One-time purchase'],crates:['elite','legend']}); }
function buyAuto(level){
  const lvl=S.perm.auto||0; if(lvl>=level){ toast('You already own that'); return; }
  if(level===1) purchaseSheet('auto_basic',{title:'Auto-Clicker',lines:[`Taps for you ${AUTO_RATE} times a second`,'Works in every world','Switch it on or off any time','One-time purchase']});
  else purchaseSheet(lvl?'auto_upgrade':'auto_combo',{title:lvl?'Combo Auto-Clicker (upgrade)':'Combo Auto-Clicker',lines:[`Taps for you ${AUTO_RATE} times a second`,'Every auto-tap builds your combo up to x3.0','Your own taps ride the max combo too','Twice the tapping power of the Auto-Clicker','Works in every world','One-time purchase']});
}
function buyPiggy(){ const n=piggyBadges(); purchaseSheet('piggy',{title:`Evidence Safe: ${n} Gold Badges`,lines:[`Break open for ${n} Gold Badges`,'Gold Badges have no cash value']}); }
function buyDeal(id){ const d=DEALS.find(x=>x.id===id); if(!d||S.deals[dayKey()+d.id]||(d.sku==='deal_crates'&&!crateBuyAllowed())) return; purchaseSheet(d.sku,{title:d.n,lines:d.lines,crates:d.crates}); }
function vipClaim(){ if(!D.vip||S.vipDay===dayKey()) return; S.vipDay=dayKey(); S.badges+=25; toast('Chief\'s Club: +25 Gold Badges','gold'); sfx('coin'); dirty('shop'); }
function skinSVG(s){ return `<svg viewBox="0 0 40 20" style="width:64px;height:32px"><rect x="2" y="9" width="36" height="7" rx="3" fill="${s.body}" stroke="#4a5480"/><path d="M9 9l4-6h13l5 6z" fill="${s.roof}" stroke="#4a5480"/><rect x="2" y="12" width="36" height="1.6" fill="${s.stripe}"/><circle cx="11" cy="17" r="2.5" fill="#07091a"/><circle cx="29" cy="17" r="2.5" fill="#07091a"/></svg>`; }

const pbtn=(s,act,attrs='',cls='btn')=>`<button class="${cls}${Pay.available(s)?'':' off'}" data-act="${act}" ${attrs}>${esc(Pay.price(s)||'...')}</button>`;
function buildShop(){
  const t=now(); let h=sec('Store',APP.native?'purchases use your Apple Account':'web preview: purchases are simulated');
  const feat=[];
  const al=S.perm.auto||0;
  if(al>=1) feat.push(`<div class="card row sp"><div><b>${al>=2?'Combo Auto-Clicker':'Auto-Clicker'}</b><div class="fine">${S.autoOn?(al>=2?`Tapping ${AUTO_RATE} times a second and holding your combo at max.`:`Tapping ${AUTO_RATE} times a second for you.`):'Switched off.'}</div></div><button class="btn sm ${S.autoOn?'green':'ghost'}" data-act="autoToggle">${S.autoOn?'On':'Off'}</button></div>`);
  if(al<2) feat.unshift(`<div class="hero-offer" style="background:linear-gradient(135deg,#0d2a4a,#123a5a 55%,#1a1250)"><span class="tag">${al?'Upgrade':'Popular'}</span><h4>${al?'Combo Auto-Clicker':'Auto-Clickers'}</h4>${al?'':`<div class="opt"><div><b>Auto-Clicker</b><span>Taps for you ${AUTO_RATE} times a second, at 1.5x power. Works in every world.</span></div>${pbtn('auto_basic','autoBuy','data-l="1"')}</div>`}<div class="opt best"><div><b>Combo Auto-Clicker</b><span>Same speed, but every tap builds your combo up to <strong>x3.0</strong>. Twice the tapping power, and your own taps ride the max combo too.</span></div>${pbtn(al?'auto_upgrade':'auto_combo','autoBuy','data-l="2"')}</div></div>`);
  if(!S.starter&&t<S.t0+48*36e5) feat.push(`<div class="hero-offer"><span class="tag">One time</span><h4>Rookie Starter Pack</h4><ul><li><b>300</b> Gold Badges</li><li>3 Standard crates</li><li>25 free ${GENS[0].n}s</li><li>Double Time for 2 hours</li></ul><div class="row sp"><span class="mono" style="color:var(--red)">Ends in <span data-f="st"></span></span>${pbtn('starter','starter')}</div></div>`);
  const managed=D.vip&&APP.native;
  feat.push(`<div class="hero-offer" style="background:linear-gradient(135deg,#3a2a06,#5a3a10 60%,#2a1250)"><span class="tag">${D.vip?'Active':'Best perks'}</span><h4>Chief's Club</h4><ul><li>All income <b>x1.5</b></li><li>Offline pay at <b>100%</b>, 8h cap</li><li>+1 crew slot, bounties auto-collect</li><li>25 Gold Badges every day</li></ul><div class="row sp"><span class="mono" data-f="vt">${D.vip?'':'Weekly subscription'}</span><div class="row">${D.vip?`<button class="btn sm green ${S.vipDay===dayKey()?'off':''}" data-act="vipClaim">Claim 25 ${bico}</button>`:''}${managed?'<button class="btn" data-act="manageSub">Manage</button>':`<button class="btn${Pay.available('vip_weekly')?'':' off'}" data-act="vip">${esc(Pay.price('vip_weekly')||'...')} / week</button>`}</div></div><p class="fine" style="margin:6px 0 0">Renews weekly until cancelled. Cancel any time in your Apple Account settings, at least 24 hours before renewal.</p></div>`);
  if(!S.pass.premium) feat.push(`<div class="hero-offer" style="background:linear-gradient(135deg,#0e2a5a,#2a1160 60%,#5a1250)"><span class="tag">Season 1</span><h4>Career Pass Premium</h4><ul><li>30 premium tiers, retroactive</li><li>A cruiser skin + Neon Rain skyline</li><li>Elite and Legend crates and 250 bonus Gold Badges</li></ul><div class="row sp"><span class="fine">Tier <span data-f="pl">0</span> of 30</span>${pbtn('pass_premium','pass')}</div></div>`);
  feat.push(`<div class="card row sp"><div><b>Evidence Safe</b><div class="fine">Fills as you play. Holds <b class="gold" data-f="pg">20</b> Gold Badges (20 to 500).</div></div>${pbtn('piggy','piggy','','btn sm')}</div>`);
  h+='<div class="list">'+feat.join('')+'</div>';
  h+=sec('Daily Deals','each can be bought once a day');
  h+='<div class="list">'+dealsToday().map(d=>{ const got=S.deals[dayKey()+d.id]; return `<div class="card row sp"><div><b>${d.n}</b><div class="fine">${d.lines.join('  |  ')}</div></div>${got?'<span class="btn sm off">Bought today</span>':pbtn(d.sku,'deal',`data-id="${d.id}"`,'btn sm')}</div>`; }).join('')+'</div>';
  h+=sec('Gold Badges','the premium currency');
  h+='<div class="grid2">'+PACKS.map(p=>`<div class="card pack">${p.tag?`<span class="tag">${p.tag}</span>`:''}<svg viewBox="0 0 24 24"><use href="#i-badge"/></svg><b>${fmt(packTotal(p))}</b><span class="bn">${S.packs[p.id]?`+${fmt(p.bonus)} bonus`:'First-time 2x'}</span><span class="nm">${p.n}</span>${pbtn(p.sku,'pack',`data-id="${p.id}"`,'btn sm')}</div>`).join('')+'</div>';
  h+=sec('Boosts and Upgrades','spend Gold Badges');
  h+='<div class="list">'+Object.entries(ITEMS).map(([id,it])=>{ const owned=it.once&&it.once(),lock=it.need&&!it.need()&&!id.startsWith('warp'); return `<div class="card up" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><b>${it.n}</b><span>${it.d}</span></div>${owned?'<span class="btn sm off">Owned</span>':badgeBtn(it.price,'item',`data-id="${id}"`,lock||S.badges<it.price)}</div>`; }).join('')+'</div>';
  h+=sec('Elite Recruits','permanent income multipliers');
  h+='<div class="list">'+AGENTS.map(a=>`<div class="card agent">${agentPortrait(a)}<div style="min-width:0"><b style="font-family:var(--f-display);font-size:18px;font-weight:800">${a.n}</b><div class="fine">${a.role}</div><div class="good mono" style="font-size:12px">${a.desc}</div></div>${S.agents[a.id]?'<span class="btn sm off">On duty</span>':badgeBtn(a.price,'agent',`data-id="${a.id}"`,S.badges<a.price)}</div>`).join('')+'</div>';
  h+=sec('Garage and Skyline','cosmetics');
  h+='<div class="grid2">'+W.skins.map(s=>`<div class="card pack">${skinSVG(s)}<span class="nm">${s.n}</span>${S.skin===s.id?'<span class="btn sm off">Equipped</span>':skinOwned(s.id)?`<button class="btn sm blue" data-act="skin" data-id="${s.id}">Equip</button>`:badgeBtn(s.price,'skin',`data-id="${s.id}"`,S.badges<s.price)}</div>`).join('')+THEMES.map(s=>`<div class="card pack"><svg viewBox="0 0 40 20" style="width:64px;height:32px"><rect width="40" height="20" rx="3" fill="${s.id==='dusk'?'#a4326a':s.id==='rain'?'#0a2846':'#111a4b'}"/><path d="M4 20V10h5v10M12 20V6h6v14M21 20V9h6v11M30 20v-7h6v7" fill="${s.id==='dusk'?'#3a1a4b':s.id==='rain'?'#7ce8ff':'#0b1134'}" fill-opacity=".8"/></svg><span class="nm">${s.n}</span>${S.theme===s.id?'<span class="btn sm off">Active</span>':S.themes[s.id]?`<button class="btn sm blue" data-act="theme" data-id="${s.id}">Set</button>`:badgeBtn(s.price,'theme',`data-id="${s.id}"`,S.badges<s.price)}</div>`).join('')+'</div>';
  h+=`<div class="card" style="margin-top:14px"><div class="row"><button class="btn sm ghost" data-act="restore">Restore Purchases</button><button class="btn sm ghost" data-act="manageSub">Manage Subscription</button><button class="btn sm ghost" data-act="settings">Settings</button></div><p class="fine" style="margin:8px 0 0">Purchases are charged to your Apple Account. Gold Badges have no cash value. Restore brings back one-time unlocks and Chief's Club; consumables such as Gold Badge packs cannot be restored. Crate odds are in the Cases tab. <button class="linkbtn" data-act="link" data-u="terms">Terms of Use</button> <button class="linkbtn" data-act="link" data-u="privacy">Privacy Policy</button> <button class="linkbtn" data-act="link" data-u="purchases">Purchase Terms</button> <button class="linkbtn" data-act="link" data-u="odds">Crate odds</button></p></div>`;
  panel.innerHTML=h;
}
function refreshShop(){
  const t=now();
  set(panel,'st',clock((S.t0+48*36e5-t)/1000));
  set(panel,'vt',D.vip?`${dur((S.vip-t)/1000)} left`:'7 days');
  set(panel,'pl',String(passLevel())); set(panel,'pg',String(piggyBadges()));
  if(!S.starter&&t>=S.t0+48*36e5&&panel.querySelector('[data-act="starter"]')) rebuildKeep('shop');
  const k=W.id+D.vip+Pay.loaded;
  if(built.shopVip!==k){ built.shopVip=k; rebuildKeep('shop'); }
}

/* ---- Career ---- */
function passCell(t,prem){
  const r=passReward(t,prem),key=prem?'p':'f',got=S.pass[key][t],reach=passLevel()>=t,can=reach&&(!prem||S.pass.premium)&&!got;
  return `<div class="cell${prem?' prem':''}${got?' claimed':''}"><div class="ic" style="color:${prem?'var(--gold)':'var(--cyan)'}">${glyph(rewardGlyph(r))}</div><span>${rewardLabel(r)}</span>${got?'<span class="good">claimed</span>':can?`<button class="btn sm" data-act="pclaim" data-t="${t}" data-p="${prem?1:0}">Claim</button>`:(prem&&!S.pass.premium?`<span class="dim" style="display:flex;gap:3px;align-items:center"><span style="width:12px;height:12px;display:inline-block">${glyph('lock')}</span>Premium</span>`:'')}</div>`;
}
function worldRank(w){ const st=w.id===S.world?S:(S.ws[w.id]||{promos:0}); return w.ranks[Math.min(st.promos||0,w.ranks.length-1)]; }
function buildCareer(){
  const top=isTop(),nx=W.ranks[Math.min(S.promos+1,W.ranks.length-1)];
  let h=sec('Promotion',`${W.dept}`);
  h+=`<div class="card"><div class="row"><svg class="por" viewBox="0 0 24 24"><use href="#i-shield"/></svg><div><b style="font-family:var(--f-display);font-size:24px;font-weight:900;text-transform:uppercase">${rankName()}</b><div class="fine">Rank ${Math.min(S.promos+1,W.ranks.length)} of ${W.ranks.length}  |  ${fmt(S.medals)} Medals: <b class="good">+${fmt(S.medals*MEDAL.bonus*100)}%</b> income</div></div></div>
   <div class="ladder">${W.ranks.map((r,i)=>`<i class="${i<=S.promos?'on':''}" title="${esc(r)}"></i>`).join('')}</div>
   <p class="fine" style="margin:8px 0">${top?'Top rank reached. Re-enlist to bank more Medals and keep growing.':`Each promotion needs a big run of earnings. Promoting resets crews, upgrades and cash. You keep Medals, Badges, gear, recruits, cosmetics and purchases.`}</p>
   <div class="row sp"><div>${top?'Re-enlist':`Promote to <b>${nx}</b>`}<div class="gold mono" data-f="mg"></div></div><button class="btn" data-act="promote" data-f="pb">${top?'Re-enlist':'Promote'}</button></div>
   <div class="bar gold" style="margin-top:8px"><em data-f="rqb"></em></div><div class="fine mono" data-f="rq" style="margin-top:4px"></div></div>`;
  h+=sec('Worlds','clear a world to unlock the next');
  h+=`<div class="list">${WORLDS.map((w,i)=>{
    const un=worldUnlocked(w.id),act=w.id===S.world,prev=WORLDS[i-1];
    return `<div class="card world${act?' on':''}${un?'':' lock'}">${worldArt(w.id)}<div style="min-width:0"><b>${w.name}</b>${w.hard?'<span class="tagh">HARD</span>':''}<div class="fine">${w.dept}${un?`  |  ${S.done[w.id]?'Cleared':'Rank: '+esc(worldRank(w))}`:''}</div><div class="fine">${un?w.blurb:`Locked. Reach ${prev.ranks[prev.ranks.length-1]} in ${prev.name}.`}</div></div>${act?'<span class="btn sm off">Here now</span>':un?`<button class="btn sm blue" data-act="travel" data-w="${w.id}">Travel</button>`:'<span class="btn sm off">Locked</span>'}</div>`;
  }).join('')}</div><p class="fine">Each world keeps its own progress. Cleared worlds add +50% income to every world (now +${Math.round(legacyBonus()*100)}%).</p>`;
  const pt=patronTier(),np=PATRON[pt+1];
  h+=sec('Precinct Patron','lifetime purchases');
  h+=`<div class="card"><div class="row sp"><b>${pt>=0?PATRON[pt][1]:'No patron rank yet'}</b><span class="good mono">${pt>=0?`+${Math.round(PATRON[pt][2]*100)}% income`:''}</span></div><div class="bar gold"><em style="width:${np?clamp((S.spent-(pt>=0?PATRON[pt][0]:0))/(np[0]-(pt>=0?PATRON[pt][0]:0))*100,0,100):100}%"></em></div><div class="fine" style="margin-top:6px">Purchases so far, counted in US dollars: US$${S.spent.toFixed(2)}${np?`. Reach US$${np[0].toFixed(2)} for ${np[1]} (+${Math.round(np[2]*100)}%).`:'. Top rank reached.'}</div></div>`;
  const st=dailyState(),idx=st.claimed?st.day:st.broken?0:st.day;
  h+=sec('Daily Roll Call',`streak ${S.daily.streak}`);
  h+=`<div class="card"><div class="dayrow">${DAILY.map((d,k)=>`<div class="day${k===idx&&!st.claimed?' now':''}${(st.claimed?k<=idx:k<idx)?' got':''}"><b>D${k+1}</b>${glyph(d.k==='jack'?'star':rewardGlyph(d),'#ffc53d')}<span>${d.k==='jack'?'Jackpot':rewardLabel(d).replace(' of pay',' pay')}</span></div>`).join('')}</div><div class="row sp" style="margin-top:8px"><span class="fine">${st.claimed?'Come back tomorrow to keep your streak.':'Reward ready'}</span><button class="btn sm ${st.claimed?'off':''}" data-act="daily">${st.claimed?'Claimed':'Claim'}</button></div></div>`;
  h+=sec('Career Pass','30 tiers  |  earn XP by playing');
  h+=`<div class="card"><div class="row sp"><b>Tier <span data-f="ptier">0</span> / 30</b><span class="mono fine" data-f="pxp"></span></div><div class="bar"><em data-f="pbar"></em></div><div class="row" style="margin-top:8px"><button class="btn sm green" data-act="pclaimall">Claim all</button><button class="btn sm blue" data-act="ptier">Skip tier ${bico}20</button>${S.pass.premium?'<span class="chip gold">Premium active</span>':`<button class="btn sm" data-act="pass">Go Premium ${esc(Pay.price('pass_premium')||'')}</button>`}</div></div>`;
  h+='<div class="scroller" style="margin-top:8px">'+Array.from({length:PASS_N},(_,k)=>k+1).map(t=>`<div class="tier${passLevel()>=t?' reached':''}"><div class="th">${t}</div>${passCell(t,false)}${passCell(t,true)}</div>`).join('')+'</div>';
  h+=sec('Service Record',`${ACH.filter(a=>S.ach[a.id]).length} / ${ACH.length} here  |  ${achCount()} total = +${achCount()}% income`);
  h+='<div class="ach">'+ACH.map(a=>`<div class="${S.ach[a.id]?'on':''}"><b>${esc(a.n)}</b>${esc(a.d)}${S.ach[a.id]?'':` <span class="gold">+${a.r} badges</span>`}</div>`).join('')+'</div>';
  h+=sec('Settings and Legal');
  h+=`<div class="row"><button class="btn sm ghost" data-act="settings">Open Settings</button><button class="btn sm ghost" data-act="restore">Restore Purchases</button></div><p class="fine">Your progress is saved on this device.</p>`;
  panel.innerHTML=h;
}
function refreshCareer(){
  const mg=medalGain(),rq=promoReq();
  set(panel,'mg',canPromote()?`+${fmt(mg)} Medals (+${fmt(mg*MEDAL.bonus*100)}% income)`:S.run<rq?`Earn ${money(rq)} in one run`:'Earn a little more for the next Medal');
  set(panel,'rq',`This run: ${money(Math.min(S.run,rq))} / ${money(rq)}`);
  const rb=panel.querySelector('[data-f="rqb"]'); if(rb) rb.style.width=clamp(S.run/rq*100,0,100)+'%';
  const pb=panel.querySelector('[data-f="pb"]'); if(pb) pb.classList.toggle('off',!canPromote());
  set(panel,'ptier',String(passLevel())); set(panel,'pxp',`${Math.floor(S.pass.xp%PASS_XP)} / ${PASS_XP} XP`);
  const bar=panel.querySelector('[data-f="pbar"]'); if(bar) bar.style.width=(passLevel()>=PASS_N?100:S.pass.xp%PASS_XP)+'%';
}
function promoteModal(){
  if(!canPromote()){ toast(S.run<promoReq()?`Earn ${money(promoReq())} in one run to promote`:'Earn a little more first','bad'); sfx('no'); return; }
  const g=medalGain(),top=isTop(),next=W.ranks[Math.min(S.promos+1,W.ranks.length-1)];
  modal(`<h3>${top?'Re-enlist?':`Promote to ${next}?`}</h3><p>You will gain <b class="gold">${fmt(g)} Medals</b>, which is <b class="good">+${fmt(g*MEDAL.bonus*100)}% income</b> forever.</p><p class="fine">Crews, upgrades and cash reset. Badges, gear, recruits, cosmetics and purchases stay. You restart with ${Math.min(50,(S.promos+(top?0:1))*5)} ${GENS[0].n}s and 25 Badges.</p>${!top&&S.promos+1===W.ranks.length-1?`<p class="gold"><b>This is the final rank of ${W.name}. Clearing it unlocks the next world.</b></p>`:''}<button class="btn" data-x="go">${top?'Re-enlist now':'Promote now'}</button><button class="btn ghost" data-x="close">Not yet</button>`,
   {go(){ const r=promote(); if(r&&r.cleared) setTimeout(clearedModal,350); }});
}
function clearedModal(){
  const i=WORLDS.findIndex(w=>w.id===W.id),nx=WORLDS[i+1];
  modal(`<h3>${W.ranks[W.ranks.length-1]}!</h3><p>You reached the top rank of the ${W.dept}. Your legacy grants <b class="good">+50% income</b> in every world, forever.</p>${nx?`<div class="row">${worldArt(nx.id)}<p><b>${nx.name}</b> is now open. ${nx.blurb}</p></div>`:'<p>You have cleared every world. Keep re-enlisting to grow your legend.</p>'}${nx?`<button class="btn" data-x="go">Transfer to ${nx.name}</button>`:''}<button class="btn ghost" data-x="close">Stay here</button>`,
   {go(){ doTravel(nx.id); }},{sticky:true});
}
function doTravel(id){
  const r=travel(id); if(!r) return;
  applyWorldUI();
  const w=WORLDS.find(x=>x.id===id);
  if(r.first) setTimeout(()=>modal(`<h3>Welcome to ${w.name}</h3><div class="row">${worldArt(id)}<p>${w.blurb}</p></div><p class="fine">A fresh start with 10 free ${GENS[0].n}s and ${w.startBonus} Gold Badges. Your legacy bonus, Badges, gear and purchases came with you.</p>${w.hard?'<p class="gold"><b>Hard world.</b> Costs climb faster and crews pay less. Expect a long shift.</p>':''}<button class="btn" data-x="close">Let's go</button>`),350);
  else toast(`Back in ${w.name}`,'good');
}
function applyWorldUI(){
  Scene.reset(); hintCache=''; tickerEl.innerHTML=''; $('#fugLayer').innerHTML='';
  Object.keys(built).forEach(k=>delete built[k]);
  lastPatron=patronTier(); showTab(cur); hud(); dots();
}
function pclaimAll(){ let n=0; for(let t=1;t<=PASS_N;t++){ if(claimPass(t,false,true)) n++; if(claimPass(t,true,true)) n++; } if(n){ toast(`Claimed ${n} pass rewards`,'gold'); sfx('coin'); dirty('career'); } else toast('Nothing to claim yet'); }
function claimPass(t,prem,quiet){
  const key=prem?'p':'f'; if(S.pass[key][t]||passLevel()<t||(prem&&!S.pass.premium)) return false;
  const r=passReward(t,prem); S.pass[key][t]=1; const g=grant(r); recalc();
  if(!quiet){ toast(`Tier ${t}: ${g.t}`,'gold'); sfx('coin'); dirty('career'); } return true;
}

const BUILD={hq:buildHQ,roster:buildRoster,upgrades:buildUps,ops:buildOps,shop:buildShop,career:buildCareer};
const REFRESH={hq:refreshHQ,roster:refreshRoster,upgrades:refreshUps,ops:refreshOps,shop:refreshShop,career:refreshCareer};

/* ====================== ACTIONS (click delegation) ====================== */
function dailyModal(){
  const st=dailyState(); if(st.claimed){ toast('Already claimed today. Come back tomorrow'); return; }
  const idx=st.broken?0:st.day;
  modal(`<h3>Roll Call</h3><p>${st.broken?`Your ${st.lost}-day streak broke. Restore it or start over.`:`Day ${idx+1} of 7. Keep the streak alive.`}</p><div class="dayrow">${DAILY.map((d,k)=>`<div class="day${k===idx?' now':''}${k<idx?' got':''}"><b>D${k+1}</b>${glyph(d.k==='jack'?'star':rewardGlyph(d),'#ffc53d')}<span>${d.k==='jack'?'Jackpot':rewardLabel(d).replace(' of pay',' pay')}</span></div>`).join('')}</div><button class="btn" data-x="claim">Claim day ${idx+1}</button>${st.broken?`<button class="btn blue" data-x="restore">Restore streak: ${bico}15</button>`:''}`,
   {claim(){ const r=claimDaily(); if(r){ toast('Roll call: '+r,'gold'); sfx('level'); } },
    restore(){ if(restoreStreak()){ setTimeout(dailyModal,50); } else return false; }});
}
function offlineModal(){
  const p=S.pending; if(!p) return;
  modal(`<h3>Off-duty earnings</h3><p>Your team kept working for <b>${dur(p.secs)}</b>${p.capped?'. The cap was reached, so Overtime Pay would have paid for more.':'.'}</p><div class="reveal"><div class="funds-num gold">+${money(p.amount)}</div><div class="fine">Offline rate ${D.vip?"100% (Chief's Club)":'50%'}</div></div><button class="btn blue" data-x="dbl">Double it: ${bico}${OFFLINE_X2}</button><button class="btn blue" data-x="tri">Triple it: ${bico}${OFFLINE_X3}</button><button class="btn" data-x="take">Collect ${money(p.amount)}</button>`,
   {take(){ collectPending(1); },
    dbl(){ if(!spend(OFFLINE_X2)) return false; collectPending(2); },
    tri(){ if(!spend(OFFLINE_X3)) return false; collectPending(3); }},{sticky:true});
}
function collectPending(m){ const p=S.pending; if(!p) return; S.pending=null; addFunds(p.amount*m); sfx('coin'); toast(`Collected ${money(p.amount*m)}`,'gold'); }
function applyCalm(){ document.documentElement.classList.toggle('calm',!!S.calm); }
function creditsModal(){
  modal(`<h3>Credits</h3><p>${esc(APP.name)} is a work of fiction. It is not affiliated with any real police, fire or EMS agency.</p><p class="fine">All artwork and sounds are original and generated in code. The fonts Big Shoulders Display, Barlow Semi Condensed and Share Tech Mono are used under the SIL Open Font License 1.1.</p><button class="btn ghost" data-x="notices">Full notices</button><button class="btn" data-x="close">Close</button>`,{notices(){ Native.open(APP.urls.notices); return false; }});
}
function settingsModal(){
  const tog=(k,label,on)=>`<div class="card row sp"><span>${label}</span><button class="btn sm ${on?'green':'ghost'}" data-x="${k}">${on?'On':'Off'}</button></div>`;
  modal(`<h3>Settings</h3><div class="list">${tog('sound','Sound',S.sound)}${tog('haptics','Haptics',S.haptics!==false)}${tog('calm','Reduce flashing',!!S.calm)}</div>
   <div class="list"><button class="btn ghost" data-x="restore">Restore Purchases</button><button class="btn ghost" data-x="manage">Manage Subscription</button></div>
   <div class="list"><button class="btn ghost" data-x="privacy">Privacy Policy</button><button class="btn ghost" data-x="terms">Terms of Use</button><button class="btn ghost" data-x="purch">Purchase Terms</button><button class="btn ghost" data-x="odds">Crate odds</button><button class="btn ghost" data-x="support">Support</button><button class="btn ghost" data-x="credits">Credits</button></div>
   <button class="btn red" data-x="erase">Erase save</button>
   <p class="fine">${esc(APP.name)} ${esc(APP.version)} (${esc(APP.build)}). Your progress is stored on this device.</p>`,
   {sound(){ S.sound=!S.sound; if(S.sound) sfx('buy'); save(); settingsModal(); return false; },
    haptics(){ S.haptics=S.haptics===false; if(S.haptics) Native.haptic('light'); save(); settingsModal(); return false; },
    calm(){ S.calm=!S.calm; applyCalm(); save(); settingsModal(); return false; },
    restore(){ restorePurchases(); return false; },manage(){ manageSubscription(); return false; },
    privacy(){ Native.open(APP.urls.privacy); return false; },terms(){ Native.open(APP.urls.terms); return false; },purch(){ Native.open(APP.urls.purchases); return false; },
    odds(){ showOdds(); return false; },support(){ Native.open(APP.urls.support); return false; },credits(){ creditsModal(); return false; },
    erase(b){ if(b.dataset.arm){ wipe(); return false; } b.dataset.arm='1'; b.textContent='Tap again to erase everything'; setTimeout(()=>{ if(b.isConnected){ b.dataset.arm=''; b.textContent='Erase save'; } },3500); return false; }});
}
const ACT={
 tab(b){ showTab(b.dataset.t); },
 amt(b){ S.amt=b.dataset.a==='max'?'max':+b.dataset.a; rebuildKeep('roster'); },
 hire(b){ if(buyGen(+b.dataset.i)===false) return; refreshRoster(); hud(); },
 up(b){ buyUp(b.dataset.id); },
 rally(){ claimRally(); },
 supply(){ claimSupply(); },
 settings(){ settingsModal(); },
 restore(){ restorePurchases(); },
 manageSub(){ manageSubscription(); },
 link(b){ Native.open(APP.urls[b.dataset.u]); },
 daily(){ dailyModal(); },
 startOp(b){ startOp(b.dataset.id); },
 claim(b){ claimOp(+b.dataset.s); },
 speed(b){ speedOp(+b.dataset.s); },
 openCrate(b){ openCrateUI(b.dataset.k); },
 buyCrate(b){ buyCrate(b.dataset.k,+b.dataset.n); },
 odds(){ showOdds(); },
 starter(){ buyStarter(); }, vip(){ buyVIP(); }, pass(){ buyPass(); }, piggy(){ buyPiggy(); }, deal(b){ buyDeal(b.dataset.id); },
 autoBuy(b){ buyAuto(+b.dataset.l||1); },
 autoToggle(){ S.autoOn=!S.autoOn; sfx('buy'); toast(S.autoOn?'Auto-Clicker on':'Auto-Clicker off'); dirty('shop'); },
 vipClaim(){ vipClaim(); },
 pack(b){ buyPack(b.dataset.id); },
 item(b){ buyItem(b.dataset.id); },
 agent(b){ buyAgent(b.dataset.id); },
 skin(b){ skinAct(b.dataset.id); },
 theme(b){ themeAct(b.dataset.id); },
 promote(){ promoteModal(); },
 travel(b){ doTravel(b.dataset.w); },
 pclaim(b){ claimPass(+b.dataset.t,b.dataset.p==='1'); },
 pclaimall(){ pclaimAll(); },
 ptier(){ if(passLevel()>=PASS_N) return; if(!spend(20)) return; addXP((passLevel()+1)*PASS_XP-S.pass.xp); dirty('career'); },
 goShop(){ showTab('shop'); },
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const f=ACT[b.dataset.act]; if(f) f(b);
});
$('#badgeBtn').addEventListener('click',()=>showTab('shop'));
const arrestBtn=$('#arrestBtn');
arrestBtn.addEventListener('pointerdown',e=>{ e.preventDefault(); arrestBtn.classList.add('down'); doTap(rnd(70,290)); });
['pointerup','pointerleave','pointercancel'].forEach(ev=>arrestBtn.addEventListener(ev,()=>arrestBtn.classList.remove('down')));
arrestBtn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); doTap(rnd(70,290)); } });

/* ====================== HUD + CHIPS ====================== */
const chipsEl=$('#chips');
chipsEl.innerHTML=[
 ['dbl','chip gold','2x INCOME'],['spree','chip hot','SPREE x7'],['vip','chip blue',"CHIEF'S CLUB"],
 ['starter','chip hot btnlike','STARTER DEAL'],['rally','chip blue btnlike','RALLY BOOST'],['daily','chip hot btnlike','DAILY REWARD'],
 ['auto','chip blue btnlike','AUTO'],['buyauto','chip gold btnlike','AUTO-CLICK'],
].map(([k,c,l])=>`<span class="${c}" data-chip="${k}" hidden><b>${l}</b> <span data-t></span></span>`).join('');
const chip=k=>chipsEl.querySelector(`[data-chip="${k}"]`);
chip('starter').dataset.act='goShop'; chip('rally').dataset.act='rally'; chip('daily').dataset.act='daily'; chip('auto').dataset.act='autoToggle'; chip('buyauto').dataset.act='goShop';
function setChip(k,show,txt){ const c=chip(k); if(c.hidden===show) c.hidden=!show; if(show&&txt!==undefined){ const t=c.querySelector('[data-t]'); if(t.textContent!==txt) t.textContent=txt; } }
let hintCache='';
function hud(){
  const t=now();
  $('#funds').textContent=money(S.funds); $('#ips').textContent='+'+money(D.ips)+'/s';
  $('#badges').textContent=fmt(S.badges);
  $('#rankName').textContent=rankName(); $('#rankSub').textContent=`${W.short}${W.hard?' HARD':''}  |  +${Math.round((D.gm-1)*100)}%`;
  const ab=arrestBtn.firstElementChild; if(ab.textContent!==W.L.tap) ab.textContent=W.L.tap;
  const cm=comboMult(); $('#arrestVal').textContent=`+${money(D.tap*cm)} per tap`;
  $('#comboX').textContent='x'+cm.toFixed(1);
  $('#comboBar').style.width=combo.n?clamp(1-(performance.now()-combo.t)/1400,0,1)*100+'%':'0';
  $('#sceneRate').textContent=`${fmt(D.crimeRate)} ${W.L.rate}`;
  const d=new Date(); $('#sceneTag').textContent=`${W.districts[Math.min(S.promos,W.districts.length-1)]}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  setChip('dbl',S.boosts.dbl>t,clock((S.boosts.dbl-t)/1000));
  chip('spree').firstElementChild.textContent=W.L.spree+' x7';
  setChip('spree',S.boosts.spree>t,clock((S.boosts.spree-t)/1000));
  setChip('vip',D.vip,dur((S.vip-t)/1000));
  const so=!S.starter&&t<S.t0+48*36e5; setChip('starter',so,clock((S.t0+48*36e5-t)/1000));
  setChip('rally',rallyReady(),'claim');
  setChip('daily',!dailyState().claimed,'claim');
  const al=S.perm.auto||0;
  chip('auto').firstElementChild.textContent=al>=2?'COMBO AUTO':'AUTO';
  setChip('auto',al>0,S.autoOn?'ON':'OFF');
  chip('buyauto').firstElementChild.textContent=al?'COMBO AUTO '+(Pay.price('auto_upgrade')||''):'AUTO-CLICK '+(Pay.price('auto_basic')||'');
  setChip('buyauto',al<2,'');
  let hint='';
  if(S.owned[0]===0&&S.funds<15) hint=`Tap ${W.L.tapWord} or the street to earn your first $15`;
  else if(S.owned[0]===0) hint=`You can afford your first ${GENS[0].n}. Open the Roster tab`;
  else { const ni=GENS.findIndex((g,i)=>S.owned[i]===0&&(i===0||S.owned[i-1]>0)); hint=canPromote()?`Promotion ready in Career: +${fmt(medalGain())} Medals`:ni>=0?`Next ${W.L.unit}: ${GENS[ni].n} at ${money(unitCost(ni,1))}`:`Promotion at ${money(promoReq())} this run`; }
  if(hint!==hintCache){ hintCache=hint; $('#hint').textContent=hint; }
}
function dots(){
  const on=(k,v)=>{ const e=navEl.querySelector(`[data-dot="${k}"]`); if(e&&e.classList.contains('on')!==!!v) e.classList.toggle('on',!!v); };
  on('roster',GENS.some((g,i)=>(S.owned[i]>0||S.run>=g.cost*.4)&&S.funds>=unitCost(i,1)));
  on('upgrades',availUps().some(u=>S.funds>=u.cost));
  on('ops',S.ops.some((o,i)=>o&&opLeft(i)<=0)||(S.crates.std+S.crates.elite+S.crates.legend>0));
  on('shop',(!S.starter&&now()<S.t0+48*36e5)||(D.vip&&S.vipDay!==dayKey()));
  on('career',!dailyState().claimed||canPromote()||(()=>{ for(let t=1;t<=passLevel();t++){ if(!S.pass.f[t]||(S.pass.premium&&!S.pass.p[t])) return true; } return false; })());
}
let msgIn=3;
function feed(){
  const owned=GENS.map((g,i)=>i).filter(i=>S.owned[i]>0); if(!owned.length) return;
  const i=owned[Math.floor(Math.pow(Math.random(),.7)*owned.length)],g=GENS[i];
  const p=document.createElement('p'); p.innerHTML=`<b>${esc(g.s)}</b> ${esc(pick(W.msg[i]))} <u>+${money(D.unit[i]*10)}</u>`;
  tickerEl.insertBefore(p,tickerEl.firstChild); while(tickerEl.children.length>8) tickerEl.lastChild.remove();
}
function spawnFugitive(){
  const layer=$('#fugLayer'); if(layer.children.length) return;
  const el=document.createElement('div'); el.className='fugitive'; el.dataset.label=W.L.bounty; el.setAttribute('role','button'); el.setAttribute('aria-label','Catch the bounty target'); el.innerHTML=fugitiveSVG(); el.style.setProperty('--dur',(D.vip?7:9)+'s');
  const grab=ev=>{ if(ev) ev.stopPropagation(); if(!el.isConnected) return; el.remove(); catchFugitive(); Scene.flash('#ffd21f'); Scene.pop(180,70,W.L.done,'#ffd21f'); };
  el.addEventListener('pointerdown',grab); el.addEventListener('animationend',()=>el.remove());
  layer.appendChild(el); sfx('siren');
  if(D.vip) setTimeout(grab,1600);
}

/* ====================== LOOP ====================== */
let bountyT=60,slowAcc=0,achAcc=0,saveAcc=0;
function tickGame(){
  const t=now(); const dt=(t-S.last)/1000; S.last=t; if(dt<=0) return;
  if(dt>90){ recalc(); const o=offlineFor(dt); if(o.amount>0&&!S.pending){ S.pending={amount:o.amount,secs:o.secs,capped:o.capped}; queueModal(offlineModal); } return; }
  recalc();
  addFunds(D.ips*dt);
  GENS.forEach((g,i)=>{ S.crimes[i]+=D.gen[i]*dt/(g.inc*10); });
  autoTick(dt);
  if(!document.hidden){ addXP(dt/6); addPiggy(dt/25); }
  bountyT-=dt; if(bountyT<=0){ bountyT=rnd(100,200)*(D.vip?.6:1)*(W.bountyMul||1); if(!document.hidden) spawnFugitive(); }
  msgIn-=dt; if(msgIn<=0){ msgIn=rnd(3.5,6); feed(); }
}
setInterval(()=>{
  tickGame(); slowAcc+=.1; achAcc+=.1; saveAcc+=.1;
  hud();
  if(slowAcc>=.25){ slowAcc=0; if(dirtyTabs[cur]){ dirtyTabs[cur]=false; rebuildKeep(cur); } else REFRESH[cur](); dots(); }
  if(achAcc>=1.5){ achAcc=0; checkAch(); }
  if(saveAcc>=4){ saveAcc=0; save(); }
},100);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(); });
window.addEventListener('pagehide',save);

/* ====================== BOOT ====================== */
(function boot(){
  recalc();
  const t=now(),el=(t-S.last)/1000; S.sessions++;
  if(el>90&&D.ips>0&&!S.pending){ const o=offlineFor(el); if(o.amount>0) S.pending={amount:o.amount,secs:o.secs,capped:o.capped}; }
  S.last=t;
  applyCalm();
  bootPurchases();
  showTab('roster');
  hud();
  if(S.pending) queueModal(offlineModal);
  if(S.sessions>1&&!dailyState().claimed) queueModal(dailyModal);
  /*DEBUG_HOOK_START*/
  window.__np={APP,Pay,PRODUCTS,processTx,applyEntitlements,grantSku,purchaseSheet,settingsModal,claimRally,claimSupply,rallyReady,supplyReady,syncEntitlements,restorePurchases,S:()=>S,D,tickGame,recalc,buyGen,buyUp,availUps,doTap,ACT,showTab,GENS:()=>GENS,W:()=>W,WORLDS,promote,canPromote,promoReq,travel,doTravel,applyWorldUI,worldUnlocked,checkAch,addBoost,Scene,
    offlineFor,openCrate,startOp,claimOp,opLeft,opSlots,claimDaily,claimPass,passLevel,catchFugitive,buyItem,buyAgent,ITEMS,AGENTS:()=>AGENTS,addFunds,dailyState,isTop,OPS,unitCost,MILE_T,save,merge,fresh,worlds:()=>WORLDS};
  /*DEBUG_HOOK_END*/
})();
