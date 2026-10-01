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
  /* A sticky modal (offline earnings, world cleared) is never replaced: the new one waits its turn. */
  if(mSticky&&mroot.classList.contains('on')){ mq.push(()=>modal(html,h,opts)); return; }
  mroot.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${opts.sticky?'':`<button class="x" data-x="close" aria-label="${esc(_('Close'))}">&times;</button>`}${html}</div>`;
  mH=h; mClose=opts.onClose||null; mSticky=!!opts.sticky; mroot.classList.add('on');
  $('#app').inert=true;
  const f=mroot.querySelector('.modal button:not(.x),.modal .btn'); if(f) try{ f.focus({preventScroll:true}); }catch(e){}
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&mroot.classList.contains('on')&&!mSticky) closeModal(); });
function closeModal(){
  mroot.classList.remove('on'); mroot.innerHTML=''; mH={}; mSticky=false; $('#app').inert=false;
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
function patronCheck(){ const t=patronTier(); if(t>lastPatron){ toast(_('{name} unlocked: +{p}% income forever',{name:PATRON[t][1],p:Math.round(PATRON[t][2]*100)}),'gold'); } lastPatron=t; }

/* ====================== TABS ====================== */
function renderNav(){ navEl.innerHTML=TABS.map(([id,label,path])=>`<button class="tab" role="tab" data-act="tab" data-t="${id}" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span>${esc(_(label))}</span><i class="dot" data-dot="${id}"></i></button>`).join(''); }
renderNav();
function showTab(t){
  cur=t; $$('.tab',navEl).forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));
  BUILD[t](); panel.scrollTop=0; REFRESH[t]();
}
function rebuildKeep(t){
  const st=panel.scrollTop,sc=panel.querySelector('.scroller'),sl=sc?sc.scrollLeft:0;
  BUILD[t](); panel.scrollTop=st; const sc2=panel.querySelector('.scroller'); if(sc2&&sl) sc2.scrollLeft=sl; REFRESH[t]();
}
const sec=(t,s='')=>`<div class="sec-h">${t}${s?` <small>${s}</small>`:''}</div>`;
/* Translated text with HTML placed into its {placeholders}: the template is escaped, the values are not. */
const hT=(k,v={})=>esc(_(k)).replace(/\{(\w+)\}/g,(m,x)=>(x in v)?String(v[x]):m);
const eT=(k,v)=>esc(_(k,v));
const set=(root,f,v)=>{ const e=root.querySelector(`[data-f="${f}"]`); if(e&&e.textContent!==v) e.textContent=v; };
const badgeBtn=(price,act,attrs='',off=false,pre='')=>`<button class="btn sm${off?' off':''}" data-act="${act}" ${attrs}>${pre?`<span>${pre}</span>`:''}${bico}${fmt(price)}</button>`;

/* ---- HQ ---- */
function buildHQ(){
  let h=sec(eT('Free Rewards'),eT('no ads, just cooldowns'));
  h+=`<div class="list">
   <div class="card row sp"><div><b>${eT('Rally Boost')}</b><div class="fine">${eT('All income x2 for 15 minutes. Ready every 3 hours.')}</div></div><button class="btn sm blue" data-act="rally" data-f="rb"><span data-f="cd1"></span></button></div>
   <div class="card row sp"><div><b>${eT('Supply Drop')}</b><div class="fine">${eT('A free {crate}. Ready every 6 hours.',{crate:crateName('std')})}</div></div><button class="btn sm blue" data-act="supply" data-f="sb"><span data-f="cd2"></span></button></div>
   <div class="card row sp"><div><b>${eT('Daily Roll Call')}</b><div class="fine" data-f="dl">${eT('Streak rewards, 7-day cycle')}</div></div><button class="btn sm" data-act="daily">${eT('Open')}</button></div>
   <div class="card row sp"><div><b>${eT('Settings and Legal')}</b><div class="fine">${eT('Sound, haptics, restore purchases, privacy, terms')}</div></div><button class="btn sm ghost" data-act="settings">${eT('Open')}</button></div>
  </div>`;
  h+=sec(eT('Next Goal'));
  h+=`<div class="card"><div class="row sp"><b data-f="goal">-</b><span class="mono fine" data-f="goalc"></span></div><div class="bar"><em data-f="goalb"></em></div>
   <div class="row sp" style="margin-top:10px"><b data-f="ptitle">${eT('Promotion')}</b><span class="mono fine" data-f="prom"></span></div><div class="bar gold"><em data-f="promb"></em></div></div>`;
  h+=sec(W.L.ledger,W.L.ledgerSub);
  h+=`<div class="card ledger"><div><span><b>${W.L.total}</b></span><span class="gold" data-f="tot">0</span></div>${GENS.map((g,i)=>`<div data-l="${i}" hidden><span>${g.crime}</span><span data-f="c${i}">0</span></div>`).join('')}</div>`;
  panel.innerHTML=h;
}
function refreshHQ(){
  const t=now();
  set(panel,'cd1',rallyReady()?_('Claim'):clock((S.rallyAt+RALLY_CD-t)/1000));
  set(panel,'cd2',supplyReady()?_('Claim'):clock((S.supplyAt+SUPPLY_CD-t)/1000));
  const rb=panel.querySelector('[data-f="rb"]'),sb=panel.querySelector('[data-f="sb"]'); if(rb) rb.classList.toggle('off',!rallyReady()); if(sb) sb.classList.toggle('off',!supplyReady());
  const st=dailyState(); set(panel,'dl',st.claimed?_('Claimed today. Streak {n}',{n:S.daily.streak}):st.broken?_('Streak broken. Restore it or restart'):_('Day {n} reward is waiting',{n:st.day+1}));
  let ni=GENS.findIndex((g,i)=>S.owned[i]===0&&(i===0||S.owned[i-1]>0)); if(ni<0) ni=GENS.length-1;
  const g=GENS[ni],c=unitCost(ni,1);
  set(panel,'goal',_('Hire a {unit}',{unit:g.n})); set(panel,'goalc',`${money(Math.min(S.funds,c))} / ${money(c)}`);
  const gb=panel.querySelector('[data-f="goalb"]'); if(gb) gb.style.width=clamp(S.funds/c*100,0,100)+'%';
  const rq=promoReq();
  set(panel,'ptitle',isTop()?_('Re-enlist (Medals)'):_('Promotion to {rank}',{rank:W.ranks[Math.min(S.promos+1,W.ranks.length-1)]}));
  set(panel,'prom',canPromote()?_('Ready!'):`${money(Math.min(S.run,rq))} / ${money(rq)}`);
  const pb=panel.querySelector('[data-f="promb"]'); if(pb) pb.style.width=clamp(S.run/rq*100,0,100)+'%';
  let tot=0; GENS.forEach((gg,i)=>{ tot+=S.crimes[i]; const row=panel.querySelector(`[data-l="${i}"]`); if(!row) return; const show=S.crimes[i]>=1||S.owned[i]>0; if(row.hidden===show) row.hidden=!show; set(row,'c'+i,fmt(Math.floor(S.crimes[i]))); });
  set(panel,'tot',fmt(Math.floor(tot)));
}

/* ---- Roster ---- */
function visGens(){ let v=0; GENS.forEach((g,i)=>{ if(S.owned[i]>0||S.run>=g.cost*0.4) v=i; }); return Math.min(GENS.length-1,v+1); }
function buildRoster(){
  const vis=visGens(); built.roster=vis+'|'+S.amt+'|'+W.id;
  let h=sec(W.L.roster,W.L.rosterSub);
  h+=`<div class="row sp" style="margin-bottom:10px"><span class="fine">${eT('Buy amount')}</span><div class="seg" role="group" aria-label="${eT('Buy amount')}">${[1,10,100,'max'].map(a=>`<button data-act="amt" data-a="${a}" aria-pressed="${S.amt===a}">${a==='max'?eT('MAX'):'x'+a}</button>`).join('')}</div></div><div class="list">`;
  for(let i=vis;i>=0;i--){
    const g=GENS[i],lk=i>0&&!(S.owned[i]>0||S.run>=g.cost*0.4);
    h+=`<div class="card gen${lk?' locked':''}" data-i="${i}">${lk?`<div style="filter:brightness(0) opacity(.55)">${portrait(i)}</div>`:portrait(i)}
      <div style="min-width:0"><div class="nm">${lk?'???':esc(g.n)} <em data-f="own"></em></div><div class="role">${lk?eT('Unlocks near {amount}',{amount:money(g.cost)}):esc(g.role)}</div><div class="stat" data-f="stat"></div><div class="bar"><em data-f="mile"></em></div></div>
      <button class="btn buy" data-act="hire" data-i="${i}" ${lk?'disabled':''}><span data-f="lbl">${lk?eT('Locked'):esc(W.L.hire)}</span><small data-f="cost"></small></button></div>`;
  }
  panel.innerHTML=h+'</div>';
}
function refreshRoster(){
  if(built.roster!==visGens()+'|'+S.amt+'|'+W.id){ rebuildKeep('roster'); return; }
  $$('.gen',panel).forEach(card=>{
    const i=+card.dataset.i; if(card.classList.contains('locked')) return;
    const n=buyCount(i),c=unitCost(i,n);
    set(card,'own','x'+S.owned[i]);
    set(card,'stat',S.owned[i]?_('{rate}/s  ({each} ea)',{rate:money(D.gen[i]),each:money(D.unit[i])}):_('{rate}/s each',{rate:money(D.unit[i])}));
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
  let h=sec(eT('Gear-Up'),eT('permanent boosts'));
  if(!l.length) h+=`<div class="card fine">${eT('Nothing to buy yet. Grow your team and new equipment shows up here.')}</div>`;
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
  /* A job that is still in a slot that has since gone (Chief's Club lapsed) stays visible so it can be collected. */
  const shown=Math.max(slots,S.ops.reduce((m,o,i)=>o?i+1:m,0));
  h+='<div class="list">';
  for(let i=0;i<shown;i++){
    const s=S.ops[i];
    if(!s) h+=`<div class="card slot empty"><div class="ttl"><b>${eT('{squad} {n}: idle',{squad:W.L.squad,n:i+1})}</b><span class="fine">${eT('assign a job below')}</span></div></div>`;
    else h+=`<div class="card slot" data-s="${i}"><div class="ttl"><b>${esc(opName(s.id))}</b><span class="mono" data-f="t"></span></div><div class="bar gold"><em data-f="b"></em></div><div class="row"><button class="btn sm green" data-act="claim" data-s="${i}" data-f="claim" hidden>${eT('Collect')}</button><button class="btn sm" data-act="speed" data-s="${i}" data-f="speed">${eT('Rush')} ${bico}<span data-f="sc"></span></button></div></div>`;
  }
  if(slots<5) h+=`<div class="card slot empty"><div class="ttl"><b>${5-slots>1?eT('{n} more slots',{n:5-slots}):eT('1 more slot')}</b><span class="fine">${eT("Chief's Club VIP, or buy in the Store")}</span></div></div>`;
  h+='</div>';
  if(S.ops.some(Boolean)&&badgeValue(1)) h+=`<p class="fine">${eT('Rush costs 1 Gold Badge for every 5 minutes left (about {price} each).',{price:badgeValue(1)})}</p>`;
  h+=sec(W.L.cases);
  h+='<div class="list">'+OPS.map(o=>`<div class="card opcard"><div><b>${esc(opName(o.id))}</b><span>${dur(o.dur)}  |  <span data-f="r_${o.id}"></span>${o.badge[1]?`  |  ${eT('{a}-{b} Badges',{a:o.badge[0],b:o.badge[1]})}`:''}${o.crate?`  |  ${eT('{p}% crate',{p:Math.round(o.crate*100)})}`:''}</span></div><button class="btn sm blue" data-act="startOp" data-id="${o.id}">${eT('Assign')}</button></div>`).join('')+'</div>';
  h+=sec(esc(W.L.locker),eT('open for loot and permanent gear'));
  h+='<div class="crates">'+['std','elite','legend'].map(k=>`<div class="card crate">${crateSVG(k)}<b>${esc(crateName(k))}</b><div class="n">${hT('You own {n}',{n:`<span data-f="n_${k}">0</span>`})}</div><button class="btn sm" data-act="openCrate" data-k="${k}" data-f="o_${k}">${eT('Open')}</button>${crateBuyAllowed()?`<div class="row">${badgeBtn(CRATES[k].price,'buyCrate',`data-k="${k}" data-n="1"`,false,'x1')}${badgeBtn(Math.round(CRATES[k].price*4.5),'buyCrate',`data-k="${k}" data-n="5"`,false,'x5')}</div>${bvHTML(CRATES[k].price)}`:''}</div>`).join('')+'</div>';
  h+=`<div class="row sp" style="margin-top:8px"><span class="fine">${eT('Pity: the top two crates guarantee Epic+ gear within 10 opens.')}</span><button class="btn sm ghost" data-act="odds">${eT('Drop rates')}</button></div>`;
  h+=sec(eT('Gear Locker'),`<span data-f="gb"></span>`);
  h+='<div class="gear">'+GEARS.map(g=>`<div class="gtile" data-g="${g.id}" style="border-color:${RAR[g.r].c}55"><div class="glyph" style="color:${RAR[g.r].c}">${glyph(g.g)}</div><b>${esc(g.n)}</b><i data-f="gl_${g.id}"></i></div>`).join('')+'</div>';
  panel.innerHTML=h;
}
function refreshOps(){
  const key=W.id+opSlots()+'|'+S.ops.map(o=>o?o.id:'-').join();
  if(built.ops!==key){ built.ops=key; rebuildKeep('ops'); return; }
  $$('.slot[data-s]',panel).forEach(c=>{
    const i=+c.dataset.s,s=S.ops[i]; if(!s) return; const o=OPS.find(x=>x.id===s.id),left=opLeft(i),done=left<=0;
    set(c,'t',done?_('READY'):clock(left)); const b=c.querySelector('[data-f="b"]'); b.style.width=(100-left/o.dur*100)+'%';
    c.querySelector('[data-f="claim"]').hidden=!done; c.querySelector('[data-f="speed"]').hidden=done;
    set(c,'sc',String(speedCost(i)));
  });
  const free=S.ops.slice(0,opSlots()).some(x=>!x);
  $$('[data-act="startOp"]',panel).forEach(b=>b.classList.toggle('off',!free));
  OPS.forEach(o=>set(panel,'r_'+o.id,money(cashFor(o.k)*(W.opMul||1))));
  ['std','elite','legend'].forEach(k=>{ set(panel,'n_'+k,String(S.crates[k]||0)); const b=panel.querySelector(`[data-f="o_${k}"]`); if(b) b.classList.toggle('off',!S.crates[k]); });
  GEARS.forEach(g=>{ const lv=S.gear[g.id]||0; const t=panel.querySelector(`[data-g="${g.id}"]`); if(!t) return; t.classList.toggle('none',!lv); set(t,'gl_'+g.id,lv?_('Lv {n}  +{p}%',{n:lv,p:(lv*RAR[g.r].b*100).toFixed(0)}):RAR[g.r].n); });
  set(panel,'gb',_('+{p}% income',{p:(gearBonus()*100).toFixed(0)}));
}
const ODDS_NAME={cash:N_('Cash payout'),badge:N_('Gold Badges'),g0:N_('Common gear'),g1:N_('Rare gear'),g2:N_('Epic gear'),g3:N_('Legendary gear')};
/* Odds for one crate tier, shown inline wherever a purchase includes crates. */
const oddsRows=k=>CRATES[k].odds.map(([a,p])=>`<div><span>${eT(ODDS_NAME[a])}</span><span>${(p*100).toFixed(0)}%</span></div>`).join('');
function oddsHTML(k){ return `<div><b>${eT('{crate} odds',{crate:crateName(k)})}</b><div class="ledger">${oddsRows(k)}</div></div>`; }
function showOdds(){
  modal(`<h3>${eT('Drop rates')}</h3>${['std','elite','legend'].map(k=>`<div><b>${esc(crateName(k))}</b><div class="ledger">${oddsRows(k)}</div></div>`).join('')}<p class="fine">${eT('Gear levels up on duplicates (max Lv 10). Maxed duplicates pay 3 Badges. The top two crates guarantee Epic+ every 10th open.')}</p><button class="btn" data-x="close">${eT('Got it')}</button>`);
}
function openCrateUI(type){
  const r=openCrate(type); if(!r){ sfx('no'); return; }
  const rar=r.g&&r.g.r!==undefined?RAR[r.g.r]:null;
  const col=rar?rar.c:r.kind==='badge'?'#ffc53d':'#39d98a';
  const gl=rar?r.g.g:r.g;
  sfx(rar&&r.g.r>=2?'siren':'coin'); if(rar&&r.g.r>=2){ Scene.flash(rar.c); Native.haptic('medium'); }
  const left=S.crates[type]||0;
  modal(`<div class="reveal"><div class="glyph spin" style="color:${col};border-color:${col}">${glyph(typeof gl==='string'?gl:'star')}</div>${rar?`<div class="mono" style="color:${col}">${esc(rar.n.toUpperCase())}</div>`:''}<h4>${esc(r.t)}</h4></div>${left?`<button class="btn" data-x="again">${eT('Open another ({n} left)',{n:left})}</button>`:''}<button class="btn ghost" data-x="close">${eT('Nice')}</button>`,{again(){ openCrateUI(type); return false; }});
}

/* ---- Store ---- */
const DEALS=[
 {id:'d0',sku:'deal_crates',n:'Crate Trio',lines:['3 Elite crates','+50 Gold Badges'],crates:['elite'],give(){ S.crates.elite+=3; S.badges+=50; }},
 {id:'d1',sku:'deal_cash',n:'Cash Crate',lines:['24 hours of income, instantly','+200 Gold Badges'],give(){ addFunds(cashFor(86400)); S.badges+=200; }},
 {id:'d2',sku:'deal_recruit',n:'Recruit Rush',lines:['+15 each of your first six unit types','+100 Gold Badges'],give(){ for(let i=0;i<6;i++) S.owned[i]+=15; S.badges+=100; }},
];
/* The Crate Trio (random crates for money) is only offered where paid random items are allowed. */
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
/* Shop tables are translated in place, like the world data. */
function localizeShopData(){ DEALS.forEach(d=>{ trData(d,'n','daily deal name'); trData(d,'lines','daily deal contents'); }); Object.values(ITEMS).forEach(it=>{ trData(it,'n','store item name'); trData(it,'d','store item description'); }); }
localizeShopData();
function buyItem(id){
  const it=ITEMS[id]; if(!it||(it.once&&it.once())) return;
  if(it.need&&!it.need()){ toast(_('Not available yet'),'bad'); sfx('no'); return; }
  if(!spend(it.price)) return; it.give(); recalc(); sfx('buy'); toast(_('{name} activated',{name:it.n}),'good'); dirty('shop');
}
/* Buying crates with Gold Badges always goes through a confirmation that shows the odds and the real-money value. */
function buyCrate(k,n){
  if(!crateBuyAllowed()){ toast(_('Not available in your region'),'bad'); return; }
  const price=n===5?Math.round(CRATES[k].price*4.5):CRATES[k].price,v=badgeValue(price);
  modal(`<div class="co"><h3>${eT('Buy crates')}</h3><p><b>${eT('{n} x {crate}',{n,crate:crateName(k)})}</b></p><div class="price">${bico} ${fmt(price)}</div>${v?`<p class="fine">${eT('about {price}',{price:v})}</p>`:''}</div><div class="co"><p class="fine">${eT('Crates hold random rewards. The odds:')}</p>${oddsHTML(k)}${k!=='std'?`<p class="fine">${eT('Elite and Legend crates guarantee Epic or better gear within every 10 opens.')}</p>`:''}</div><button class="btn green" data-x="ok">${eT('Buy for {n} Gold Badges',{n:fmt(price)})}</button><button class="btn neutral" data-x="close">${eT('Cancel')}</button>`,
   {ok(){ if(!spend(price)) return; S.crates[k]+=n; sfx('buy'); toast(_('{n} x {crate}',{n,crate:crateName(k)}),'good'); dirty('ops'); }});
}
function buyAgent(id){ const a=AGENTS.find(x=>x.id===id); if(S.agents[id]||!spend(a.price)) return; S.agents[id]=1; recalc(); sfx('level'); toast(_('{name} joined your team',{name:a.n}),'gold'); dirty('shop'); }
function skinAct(id){ const s=skinById(id); if(skinOwned(id)){ S.skin=id; sfx('buy'); dirty('shop'); return; } if(!spend(s.price)) return; S.skins[W.id+':'+id]=1; S.skin=id; sfx('level'); toast(_('{name} unlocked',{name:s.n}),'gold'); dirty('shop'); }
function themeAct(id){ const s=THEMES.find(x=>x.id===id); if(S.themes[id]){ S.theme=id; Scene.setTheme(); sfx('buy'); dirty('shop'); return; } if(!spend(s.price)) return; S.themes[id]=1; S.theme=id; Scene.setTheme(); sfx('level'); toast(_('{name} unlocked',{name:s.n}),'gold'); dirty('shop'); }
function packTotal(p){ return p.b+p.bonus+(S.packs[p.id]?0:p.b); }
function buyPack(id){ const p=PACKS.find(x=>x.id===id); const tot=packTotal(p); purchaseSheet(p.sku,{title:_('{pack}: {n} Gold Badges',{pack:p.n,n:fmt(tot)}),lines:[_('{n} Gold Badges',{n:fmt(p.b)}),p.bonus?_('+{n} bonus',{n:fmt(p.bonus)}):null,!S.packs[p.id]?_('+{n} first-time bonus',{n:fmt(p.b)}):null,_('Gold Badges have no cash value')].filter(Boolean)}); }
const starterLines=()=>crateBuyAllowed()?[_('{n} Gold Badges',{n:STARTER_BADGES}),_('3 Standard crates')]:[_('{n} Gold Badges',{n:STARTER_BADGES+STARTER_CRATES*30})];
function buyStarter(){ purchaseSheet('starter',{title:_('Rookie Starter Pack'),lines:[...starterLines(),_('25 free {units}',{units:plu(GENS[0].n)}),_('Double Time for 2 hours'),_('One-time purchase')],crates:crateBuyAllowed()?['std']:[]}); }
function buyVIP(){ purchaseSheet('vip_weekly',{title:_("Chief's Club (weekly subscription)"),lines:[_('All income x1.5'),_('Offline earnings at 100%, 8 hour minimum cap'),_('+1 crew slot for timed jobs'),_('Bounties auto-collect'),_('25 Gold Badges every day')]}); }
/* Where paid random rewards are not allowed the premium track pays fixed Gold Badges instead of crates (see passReward). */
const passCrateLine=()=>crateBuyAllowed()?_('Elite and Legend crates and 250 bonus Gold Badges'):_('Gold Badges on every fifth tier and 400 at tier 30');
function buyPass(){ purchaseSheet('pass_premium',{title:_('Career Pass: Premium'),lines:[_('30 premium reward tiers'),_('A cruiser skin and the {theme} skyline',{theme:THEMES[2].n}),passCrateLine(),_('Unlocks every tier you already reached'),_('One-time purchase')],crates:crateBuyAllowed()?['elite','legend']:[]}); }
function buyAuto(level){
  const lvl=S.perm.auto||0; if(lvl>=level){ toast(_('You already own that')); return; }
  if(level===1) purchaseSheet('auto_basic',{title:_('Auto-Clicker'),lines:[_('Taps for you {n} times a second',{n:AUTO_RATE}),_('Works in every world'),_('Switch it on or off any time'),_('One-time purchase')]});
  else purchaseSheet(lvl?'auto_upgrade':'auto_combo',{title:lvl?_('Combo Auto-Clicker (upgrade)'):_('Combo Auto-Clicker'),lines:[_('Taps for you {n} times a second',{n:AUTO_RATE}),_('Every auto-tap builds your combo up to x3.0'),_('Your own taps ride the max combo too'),_('Twice the tapping power of the Auto-Clicker'),_('Works in every world'),_('One-time purchase')]});
}
function buyPiggy(){ const n=piggyBadges(); purchaseSheet('piggy',{title:_('Evidence Safe: {n} Gold Badges',{n}),lines:[_('Break open for {n} Gold Badges',{n}),_('Gold Badges have no cash value')]}); }
function buyDeal(id){ const d=DEALS.find(x=>x.id===id); if(!d||S.deals[dayKey()+d.id]||!dealsToday().includes(d)) return; purchaseSheet(d.sku,{title:d.n,lines:d.lines,crates:d.crates}); }
function vipClaim(){ if(!D.vip||S.vipDay===dayKey()) return; S.vipDay=dayKey(); S.badges+=25; toast(_("Chief's Club: +25 Gold Badges"),'gold'); sfx('coin'); dirty('shop'); }
function skinSVG(s){ return `<svg viewBox="0 0 40 20" style="width:64px;height:32px"><rect x="2" y="9" width="36" height="7" rx="3" fill="${s.body}" stroke="#4a5480"/><path d="M9 9l4-6h13l5 6z" fill="${s.roof}" stroke="#4a5480"/><rect x="2" y="12" width="36" height="1.6" fill="${s.stripe}"/><circle cx="11" cy="17" r="2.5" fill="#07091a"/><circle cx="29" cy="17" r="2.5" fill="#07091a"/></svg>`; }

const pbtn=(s,act,attrs='',cls='btn')=>`<button class="${cls}${Pay.available(s)?'':' off'}" data-act="${act}" ${attrs}>${esc(Pay.price(s)||'...')}</button>`;
function buildShop(){
  const t=now(); let h=sec(eT('Store'),APP.native?eT('purchases use your Apple Account'):eT('web preview: purchases are simulated'));
  const feat=[];
  const al=S.perm.auto||0;
  if(al>=1) feat.push(`<div class="card row sp"><div><b>${al>=2?eT('Combo Auto-Clicker'):eT('Auto-Clicker')}</b><div class="fine">${S.autoOn?(al>=2?eT('Tapping {n} times a second and holding your combo at max.',{n:AUTO_RATE}):eT('Tapping {n} times a second for you.',{n:AUTO_RATE})):eT('Switched off.')}</div></div><button class="btn sm ${S.autoOn?'green':'ghost'}" data-act="autoToggle">${S.autoOn?eT('On'):eT('Off')}</button></div>`);
  if(al<2) feat.unshift(`<div class="hero-offer" style="background:linear-gradient(135deg,#0d2a4a,#123a5a 55%,#1a1250)"><span class="tag">${al?eT('Upgrade'):eT('Popular')}</span><h4>${al?eT('Combo Auto-Clicker'):eT('Auto-Clickers')}</h4>${al?'':`<div class="opt"><div><b>${eT('Auto-Clicker')}</b><span>${eT('Taps for you {n} times a second, at 1.5x power. Works in every world.',{n:AUTO_RATE})}</span></div>${pbtn('auto_basic','autoBuy','data-l="1"')}</div>`}<div class="opt best"><div><b>${eT('Combo Auto-Clicker')}</b><span>${hT('Same speed, but every tap builds your combo up to {x3}. Twice the tapping power, and your own taps ride the max combo too.',{x3:'<strong>x3.0</strong>'})}</span></div>${pbtn(al?'auto_upgrade':'auto_combo','autoBuy','data-l="2"')}</div></div>`);
  if(!S.starter&&t<S.t0+48*36e5) feat.push(`<div class="hero-offer"><span class="tag">${eT('One time')}</span><h4>${eT('Rookie Starter Pack')}</h4><ul>${starterLines().map(l=>`<li>${esc(l)}</li>`).join('')}<li>${eT('25 free {units}',{units:plu(GENS[0].n)})}</li><li>${eT('Double Time for 2 hours')}</li></ul><div class="row sp"><span class="mono" style="color:var(--red)">${hT('Ends in {time}',{time:'<span data-f="st"></span>'})}</span>${pbtn('starter','starter')}</div></div>`);
  const managed=D.vip&&APP.native;
  feat.push(`<div class="hero-offer" style="background:linear-gradient(135deg,#3a2a06,#5a3a10 60%,#2a1250)"><span class="tag">${D.vip?eT('Active'):eT('Best perks')}</span><h4>${eT("Chief's Club")}</h4><ul><li>${hT('All income {x}',{x:'<b>x1.5</b>'})}</li><li>${hT('Offline pay at {p}, 8h cap',{p:'<b>100%</b>'})}</li><li>${eT('+1 crew slot, bounties auto-collect')}</li><li>${eT('25 Gold Badges every day')}</li></ul><div class="row sp"><span class="mono" data-f="vt">${D.vip?'':eT('Weekly subscription')}</span><div class="row">${D.vip?`<button class="btn sm green ${S.vipDay===dayKey()?'off':''}" data-act="vipClaim">${eT('Claim 25')} ${bico}</button>`:''}${managed?`<button class="btn" data-act="manageSub">${eT('Manage')}</button>`:`<button class="btn${Pay.available('vip_weekly')?'':' off'}" data-act="vip">${eT('{price} / week',{price:Pay.price('vip_weekly')||'...'})}</button>`}</div></div><p class="fine" style="margin:6px 0 0">${eT('Renews weekly until cancelled. Cancel any time in your Apple Account settings, at least 24 hours before renewal.')}</p></div>`);
  if(!S.pass.premium) feat.push(`<div class="hero-offer" style="background:linear-gradient(135deg,#0e2a5a,#2a1160 60%,#5a1250)"><span class="tag">${eT('Season 1')}</span><h4>${eT('Career Pass Premium')}</h4><ul><li>${eT('30 premium tiers, retroactive')}</li><li>${eT('A cruiser skin + {theme} skyline',{theme:THEMES[2].n})}</li><li>${esc(passCrateLine())}</li></ul><div class="row sp"><span class="fine">${hT('Tier {n} of 30',{n:'<span data-f="pl">0</span>'})}</span>${pbtn('pass_premium','pass')}</div></div>`);
  feat.push(`<div class="card row sp"><div><b>${eT('Evidence Safe')}</b><div class="fine">${hT('Fills as you play. Holds {n} Gold Badges (20 to 500).',{n:'<b class="gold" data-f="pg">20</b>'})}</div></div>${pbtn('piggy','piggy','','btn sm')}</div>`);
  h+='<div class="list">'+feat.join('')+'</div>';
  h+=sec(eT('Daily Deals'),eT('each can be bought once a day'));
  h+='<div class="list">'+dealsToday().map(d=>{ const got=S.deals[dayKey()+d.id]; return `<div class="card row sp"><div><b>${esc(d.n)}</b><div class="fine">${esc(d.lines.join('  |  '))}</div></div>${got?`<span class="btn sm off">${eT('Bought today')}</span>`:pbtn(d.sku,'deal',`data-id="${d.id}"`,'btn sm')}</div>`; }).join('')+'</div>';
  h+=sec(eT('Gold Badges'),eT('the premium currency'));
  h+='<div class="grid2">'+PACKS.map(p=>`<div class="card pack">${p.tag?`<span class="tag">${esc(p.tag)}</span>`:''}<svg viewBox="0 0 24 24"><use href="#i-badge"/></svg><b>${fmt(packTotal(p))}</b><span class="bn">${S.packs[p.id]?eT('+{n} bonus',{n:fmt(p.bonus)}):eT('First-time 2x')}</span><span class="nm">${esc(p.n)}</span>${pbtn(p.sku,'pack',`data-id="${p.id}"`,'btn sm')}</div>`).join('')+'</div>';
  h+=sec(eT('Boosts and Upgrades'),eT('spend Gold Badges'));
  h+='<div class="list">'+Object.entries(ITEMS).map(([id,it])=>{ const owned=it.once&&it.once(),lock=it.need&&!it.need()&&!id.startsWith('warp'); return `<div class="card up" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><b>${esc(it.n)}</b><span>${esc(it.d)}</span>${bvHTML(it.price)}</div>${owned?`<span class="btn sm off">${eT('Owned')}</span>`:badgeBtn(it.price,'item',`data-id="${id}"`,lock||S.badges<it.price)}</div>`; }).join('')+'</div>';
  h+=sec(eT('Elite Recruits'),eT('permanent income multipliers'));
  h+='<div class="list">'+AGENTS.map(a=>`<div class="card agent">${agentPortrait(a)}<div style="min-width:0"><b style="font-family:var(--f-display);font-size:18px;font-weight:800">${esc(a.n)}</b><div class="fine">${esc(a.role)}</div><div class="good mono" style="font-size:12px">${esc(a.desc)}</div>${S.agents[a.id]?'':bvHTML(a.price)}</div>${S.agents[a.id]?`<span class="btn sm off">${eT('On duty')}</span>`:badgeBtn(a.price,'agent',`data-id="${a.id}"`,S.badges<a.price)}</div>`).join('')+'</div>';
  h+=sec(eT('Garage and Skyline'),eT('cosmetics'));
  h+='<div class="grid2">'+W.skins.map(s=>`<div class="card pack">${skinSVG(s)}<span class="nm">${esc(s.n)}</span>${skinOwned(s.id)?'':bvHTML(s.price)}${S.skin===s.id?`<span class="btn sm off">${eT('Equipped')}</span>`:skinOwned(s.id)?`<button class="btn sm blue" data-act="skin" data-id="${s.id}">${eT('Equip')}</button>`:badgeBtn(s.price,'skin',`data-id="${s.id}"`,S.badges<s.price)}</div>`).join('')+THEMES.map(s=>`<div class="card pack"><svg viewBox="0 0 40 20" style="width:64px;height:32px"><rect width="40" height="20" rx="3" fill="${s.id==='dusk'?'#a4326a':s.id==='rain'?'#0a2846':'#111a4b'}"/><path d="M4 20V10h5v10M12 20V6h6v14M21 20V9h6v11M30 20v-7h6v7" fill="${s.id==='dusk'?'#3a1a4b':s.id==='rain'?'#7ce8ff':'#0b1134'}" fill-opacity=".8"/></svg><span class="nm">${esc(s.n)}</span>${S.themes[s.id]?'':bvHTML(s.price)}${S.theme===s.id?`<span class="btn sm off">${eT('Active')}</span>`:S.themes[s.id]?`<button class="btn sm blue" data-act="theme" data-id="${s.id}">${eT('Set')}</button>`:badgeBtn(s.price,'theme',`data-id="${s.id}"`,S.badges<s.price)}</div>`).join('')+'</div>';
  h+=`<div class="card" style="margin-top:14px"><div class="row"><button class="btn sm ghost" data-act="restore">${eT('Restore Purchases')}</button><button class="btn sm ghost" data-act="manageSub">${eT('Manage Subscription')}</button><button class="btn sm ghost" data-act="settings">${eT('Settings')}</button></div><p class="fine" style="margin:8px 0 0">${eT("Purchases are charged to your Apple Account. Gold Badges have no cash value. Restore brings back one-time unlocks and Chief's Club; consumables such as Gold Badge packs cannot be restored. Crate odds are in the Cases tab. Money values next to Gold Badge prices are estimates at the price of the smallest Gold Badge pack.")} <button class="linkbtn" data-act="link" data-u="terms">${eT('Terms of Use')}</button> <button class="linkbtn" data-act="link" data-u="privacy">${eT('Privacy Policy')}</button> <button class="linkbtn" data-act="link" data-u="purchases">${eT('Purchase Terms')}</button> <button class="linkbtn" data-act="link" data-u="odds">${eT('Crate odds')}</button></p></div>`;
  panel.innerHTML=h;
}
function refreshShop(){
  const t=now();
  set(panel,'st',clock((S.t0+48*36e5-t)/1000));
  set(panel,'vt',D.vip?_('{time} left',{time:dur((S.vip-t)/1000)}):_('7 days'));
  set(panel,'pl',String(passLevel())); set(panel,'pg',String(piggyBadges()));
  if(!S.starter&&t>=S.t0+48*36e5&&panel.querySelector('[data-act="starter"]')) rebuildKeep('shop');
  const k=W.id+D.vip+Pay.loaded;
  if(built.shopVip!==k){ built.shopVip=k; rebuildKeep('shop'); }
}

/* ---- Career ---- */
function passCell(t,prem){
  const r=passReward(t,prem),key=prem?'p':'f',got=S.pass[key][t],reach=passLevel()>=t,can=reach&&(!prem||S.pass.premium)&&!got;
  return `<div class="cell${prem?' prem':''}${got?' claimed':''}"><div class="ic" style="color:${prem?'var(--gold)':'var(--cyan)'}">${glyph(rewardGlyph(r))}</div><span>${esc(rewardLabel(r))}</span>${got?`<span class="good">${eT('claimed')}</span>`:can?`<button class="btn sm" data-act="pclaim" data-t="${t}" data-p="${prem?1:0}">${eT('Claim')}</button>`:(prem&&!S.pass.premium?`<span class="dim" style="display:flex;gap:3px;align-items:center"><span style="width:12px;height:12px;display:inline-block">${glyph('lock')}</span>${eT('Premium')}</span>`:'')}</div>`;
}
function worldRank(w){ const st=w.id===S.world?S:(S.ws[w.id]||{promos:0}); return w.ranks[Math.min(st.promos||0,w.ranks.length-1)]; }
function buildCareer(){
  const top=isTop(),nx=W.ranks[Math.min(S.promos+1,W.ranks.length-1)];
  let h=sec(eT('Promotion'),esc(W.dept));
  h+=`<div class="card"><div class="row"><svg class="por" viewBox="0 0 24 24"><use href="${rankIcon()}"/></svg><div><b style="font-family:var(--f-display);font-size:24px;font-weight:900;text-transform:uppercase">${esc(rankName())}</b><div class="fine">${eT('Rank {n} of {m}',{n:Math.min(S.promos+1,W.ranks.length),m:W.ranks.length})}  |  ${hT('{n} Medals: {p} income',{n:fmt(S.medals),p:`<b class="good">+${fmt(S.medals*MEDAL.bonus*100)}%</b>`})}</div></div></div>
   <div class="ladder">${W.ranks.map((r,i)=>`<i class="${i<=S.promos?'on':''}" title="${esc(r)}"></i>`).join('')}</div>
   <p class="fine" style="margin:8px 0">${top?eT('Top rank reached. Re-enlist to bank more Medals and keep growing.'):eT('Each promotion needs a big run of earnings. Promoting resets crews, upgrades and cash. You keep Medals, Badges, gear, recruits, cosmetics and purchases.')}</p>
   <div class="row sp"><div>${top?eT('Re-enlist'):hT('Promote to {rank}',{rank:`<b>${esc(nx)}</b>`})}<div class="gold mono" data-f="mg"></div></div><button class="btn" data-act="promote" data-f="pb">${top?eT('Re-enlist'):eT('Promote')}</button></div>
   <div class="bar gold" style="margin-top:8px"><em data-f="rqb"></em></div><div class="fine mono" data-f="rq" style="margin-top:4px"></div></div>`;
  h+=sec(eT('Worlds'),eT('clear a world to unlock the next'));
  h+=`<div class="list">${WORLDS.map((w,i)=>{
    const un=worldUnlocked(w.id),act=w.id===S.world,prev=WORLDS[i-1];
    return `<div class="card world${act?' on':''}${un?'':' lock'}">${worldArt(w.id)}<div style="min-width:0"><b>${esc(w.name)}</b>${w.hard?`<span class="tagh">${eT('HARD')}</span>`:''}<div class="fine">${esc(w.dept)}${un?`  |  ${S.done[w.id]?eT('Cleared'):eT('Rank: {rank}',{rank:worldRank(w)})}`:''}</div><div class="fine">${un?esc(w.blurb):eT('Locked. Reach {rank} in {world}.',{rank:prev.ranks[prev.ranks.length-1],world:prev.name})}</div></div>${act?`<span class="btn sm off">${eT('Here now')}</span>`:un?`<button class="btn sm blue" data-act="travel" data-w="${w.id}">${eT('Travel')}</button>`:`<span class="btn sm off">${eT('Locked')}</span>`}</div>`;
  }).join('')}</div><p class="fine">${eT('Each world keeps its own progress. Cleared worlds add +50% income to every world (now +{p}%).',{p:Math.round(legacyBonus()*100)})}</p>`;
  const pt=patronTier(),np=PATRON[pt+1];
  h+=sec(eT('Precinct Patron'),eT('lifetime purchases'));
  h+=`<div class="card"><div class="row sp"><b>${pt>=0?esc(PATRON[pt][1]):eT('No patron rank yet')}</b><span class="good mono">${pt>=0?eT('+{p}% income',{p:Math.round(PATRON[pt][2]*100)}):''}</span></div><div class="bar gold"><em style="width:${np?clamp((S.spent-(pt>=0?PATRON[pt][0]:0))/(np[0]-(pt>=0?PATRON[pt][0]:0))*100,0,100):100}%"></em></div><div class="fine" style="margin-top:6px">${np?eT('Purchases so far, counted in US dollars: {spent}. Reach {next} for {name} (+{p}%).',{spent:'US$'+S.spent.toFixed(2),next:'US$'+np[0].toFixed(2),name:np[1],p:Math.round(np[2]*100)}):eT('Purchases so far, counted in US dollars: {spent}. Top rank reached.',{spent:'US$'+S.spent.toFixed(2)})}</div></div>`;
  const st=dailyState(),idx=st.claimed?st.day:st.broken?0:st.day;
  h+=sec(eT('Daily Roll Call'),eT('streak {n}',{n:S.daily.streak}));
  h+=`<div class="card"><div class="dayrow">${dayCells(idx,st.claimed)}</div><div class="row sp" style="margin-top:8px"><span class="fine">${st.claimed?eT('Come back tomorrow to keep your streak.'):eT('Reward ready')}</span><button class="btn sm ${st.claimed?'off':''}" data-act="daily">${st.claimed?eT('Claimed'):eT('Claim')}</button></div></div>`;
  h+=sec(eT('Career Pass'),eT('30 tiers  |  earn XP by playing'));
  h+=`<div class="card"><div class="row sp"><b>${hT('Tier {n} / 30',{n:'<span data-f="ptier">0</span>'})}</b><span class="mono fine" data-f="pxp"></span></div><div class="bar"><em data-f="pbar"></em></div><div class="row" style="margin-top:8px"><button class="btn sm green" data-act="pclaimall">${eT('Claim all')}</button><button class="btn sm blue" data-act="ptier">${eT('Skip tier')} ${bico}20</button>${S.pass.premium?`<span class="chip gold">${eT('Premium active')}</span>`:`<button class="btn sm" data-act="pass">${eT('Go Premium {price}',{price:Pay.price('pass_premium')||''})}</button>`}</div>${badgeValue(20)?`<p class="fine">${eT('Skipping a tier costs 20 Gold Badges (about {price}).',{price:badgeValue(20)})}</p>`:''}</div>`;
  h+='<div class="scroller" style="margin-top:8px">'+Array.from({length:PASS_N},(_,k)=>k+1).map(t=>`<div class="tier${passLevel()>=t?' reached':''}"><div class="th">${t}</div>${passCell(t,false)}${passCell(t,true)}</div>`).join('')+'</div>';
  h+=sec(eT('Service Record'),eT('{got} / {all} here  |  {total} total = +{total}% income',{got:ACH.filter(a=>S.ach[a.id]).length,all:ACH.length,total:achCount()}));
  h+='<div class="ach">'+ACH.map(a=>`<div class="${S.ach[a.id]?'on':''}"><b>${esc(a.n)}</b>${esc(a.d)}${S.ach[a.id]?'':` <span class="gold">${eT('+{n} badges',{n:a.r})}</span>`}</div>`).join('')+'</div>';
  h+=sec(eT('Settings and Legal'));
  h+=`<div class="row"><button class="btn sm ghost" data-act="settings">${eT('Open Settings')}</button><button class="btn sm ghost" data-act="restore">${eT('Restore Purchases')}</button></div><p class="fine">${eT('Your progress is saved on this device.')}</p>`;
  panel.innerHTML=h;
}
function refreshCareer(){
  const mg=medalGain(),rq=promoReq();
  set(panel,'mg',canPromote()?_('+{n} Medals (+{p}% income)',{n:fmt(mg),p:fmt(mg*MEDAL.bonus*100)}):S.run<rq?_('Earn {amount} in one run',{amount:money(rq)}):_('Earn a little more for the next Medal'));
  set(panel,'rq',_('This run: {a} / {b}',{a:money(Math.min(S.run,rq)),b:money(rq)}));
  const rb=panel.querySelector('[data-f="rqb"]'); if(rb) rb.style.width=clamp(S.run/rq*100,0,100)+'%';
  const pb=panel.querySelector('[data-f="pb"]'); if(pb) pb.classList.toggle('off',!canPromote());
  set(panel,'ptier',String(passLevel())); set(panel,'pxp',_('{a} / {b} XP',{a:Math.floor(S.pass.xp%PASS_XP),b:PASS_XP}));
  const bar=panel.querySelector('[data-f="pbar"]'); if(bar) bar.style.width=(passLevel()>=PASS_N?100:S.pass.xp%PASS_XP)+'%';
}
function promoteModal(){
  if(!canPromote()){ toast(S.run<promoReq()?_('Earn {amount} in one run to promote',{amount:money(promoReq())}):_('Earn a little more first'),'bad'); sfx('no'); return; }
  const g=medalGain(),top=isTop(),next=W.ranks[Math.min(S.promos+1,W.ranks.length-1)];
  modal(`<h3>${top?eT('Re-enlist?'):eT('Promote to {rank}?',{rank:next})}</h3><p>${hT('You will gain {medals}, which is {income} forever.',{medals:`<b class="gold">${eT('{n} Medals',{n:fmt(g)})}</b>`,income:`<b class="good">${eT('+{p}% income',{p:fmt(g*MEDAL.bonus*100)})}</b>`})}</p><p class="fine">${eT('Crews, upgrades and cash reset. Badges, gear, recruits, cosmetics and purchases stay. You restart with {n} {units} and 25 Badges.',{n:Math.min(50,(S.promos+(top?0:1))*5),units:plu(GENS[0].n)})}</p>${!top&&S.promos+1===W.ranks.length-1?`<p class="gold"><b>${eT('This is the final rank of {world}. Clearing it unlocks the next world.',{world:W.name})}</b></p>`:''}<button class="btn" data-x="go">${top?eT('Re-enlist now'):eT('Promote now')}</button><button class="btn ghost" data-x="close">${eT('Not yet')}</button>`,
   {go(){ const r=promote(); if(r&&r.cleared) setTimeout(clearedModal,350); }});
}
function clearedModal(){
  const i=WORLDS.findIndex(w=>w.id===W.id),nx=WORLDS[i+1];
  modal(`<h3>${esc(W.ranks[W.ranks.length-1])}!</h3><p>${hT('You reached the top rank of the {dept}. Your legacy grants {bonus} in every world, forever.',{dept:esc(W.dept),bonus:`<b class="good">${eT('+{p}% income',{p:50})}</b>`})}</p>${nx?`<div class="row">${worldArt(nx.id)}<p>${hT('{world} is now open.',{world:`<b>${esc(nx.name)}</b>`})} ${esc(nx.blurb)}</p></div>`:`<p>${eT('You have cleared every world. Keep re-enlisting to grow your legend.')}</p>`}${nx?`<button class="btn" data-x="go">${eT('Transfer to {world}',{world:nx.name})}</button>`:''}<button class="btn ghost" data-x="close">${eT('Stay here')}</button>`,
   {go(){ doTravel(nx.id); }},{sticky:true});
}
function doTravel(id){
  const r=travel(id); if(!r) return;
  applyWorldUI();
  const w=WORLDS.find(x=>x.id===id);
  if(r.first) setTimeout(()=>modal(`<h3>${eT('Welcome to {world}',{world:w.name})}</h3><div class="row">${worldArt(id)}<p>${esc(w.blurb)}</p></div><p class="fine">${eT('A fresh start with 10 free {units} and {n} Gold Badges. Your legacy bonus, Badges, gear and purchases came with you.',{units:plu(GENS[0].n),n:w.startBonus})}</p>${w.hard?`<p class="gold"><b>${eT('Hard world.')}</b> ${eT('Costs climb faster and crews pay less. Expect a long shift.')}</p>`:''}<button class="btn" data-x="close">${eT("Let's go")}</button>`),350);
  else toast(_('Back in {world}',{world:w.name}),'good');
}
function applyWorldUI(){
  Scene.reset(); hintCache=''; tickerEl.innerHTML=''; $('#fugLayer').innerHTML='';
  Object.keys(built).forEach(k=>delete built[k]);
  lastPatron=patronTier(); showTab(cur); hud(); dots();
  $('.rank use').setAttribute('href',rankIcon());
  Music.world();
}
function pclaimAll(){ let n=0; for(let t=1;t<=PASS_N;t++){ if(claimPass(t,false,true)) n++; if(claimPass(t,true,true)) n++; } if(n){ toast(_('Claimed {n} pass rewards',{n}),'gold'); sfx('coin'); dirty('career'); } else toast(_('Nothing to claim yet')); }
function claimPass(t,prem,quiet){
  const key=prem?'p':'f'; if(S.pass[key][t]||passLevel()<t||(prem&&!S.pass.premium)) return false;
  const r=passReward(t,prem); S.pass[key][t]=1; const g=grant(r); recalc();
  if(!quiet){ toast(_('Tier {n}: {reward}',{n:t,reward:g.t}),'gold'); sfx('coin'); dirty('career'); } return true;
}

const BUILD={hq:buildHQ,roster:buildRoster,upgrades:buildUps,ops:buildOps,shop:buildShop,career:buildCareer};
const REFRESH={hq:refreshHQ,roster:refreshRoster,upgrades:refreshUps,ops:refreshOps,shop:refreshShop,career:refreshCareer};

/* ====================== ACTIONS (click delegation) ====================== */
/* The 7-day roll call calendar, shared by the Career tab and the daily modal. */
function dayCells(idx,claimed){
  return DAILY.map((d,k)=>`<div class="day${k===idx&&!claimed?' now':''}${(claimed?k<=idx:k<idx)?' got':''}"><b>${eT('D{n}',{n:k+1})}</b>${glyph(d.k==='jack'?'star':rewardGlyph(d),'#ffc53d')}<span>${d.k==='jack'?eT('Jackpot'):esc(rewardLabel(d,true))}</span></div>`).join('');
}
function dailyModal(){
  const st=dailyState(); if(st.claimed){ toast(_('Already claimed today. Come back tomorrow')); return; }
  const idx=st.broken?0:st.day;
  modal(`<h3>${eT('Roll Call')}</h3><p>${st.broken?eT('Your {n}-day streak broke. Restore it or start over.',{n:st.lost}):eT('Day {n} of 7. Keep the streak alive.',{n:idx+1})}</p><div class="dayrow">${dayCells(idx,false)}</div><button class="btn" data-x="claim">${eT('Claim day {n}',{n:idx+1})}</button>${st.broken?`<button class="btn blue" data-x="restore">${eT('Restore streak:')} ${bico}15${bvHTML(15)}</button>`:''}`,
   {claim(){ const r=claimDaily(); if(r){ toast(_('Roll call: {reward}',{reward:r}),'gold'); sfx('level'); } },
    restore(){ if(restoreStreak()){ setTimeout(dailyModal,50); } else return false; }});
}
function offlineModal(){
  const p=S.pending; if(!p) return;
  const tm={time:`<b>${esc(dur(p.secs))}</b>`};
  modal(`<h3 data-offline>${eT('Off-duty earnings')}</h3><p>${p.capped?hT('Your team kept working for {time}. The cap was reached, so Overtime Pay would have paid for more.',tm):hT('Your team kept working for {time}.',tm)}</p><div class="reveal"><div class="funds-num gold">+${money(p.amount)}</div><div class="fine">${D.vip?eT("Offline rate 100% (Chief's Club)"):eT('Offline rate 50%')}</div></div><button class="btn blue" data-x="dbl">${eT('Double it:')} ${bico}${OFFLINE_X2}${bvHTML(OFFLINE_X2)}</button><button class="btn blue" data-x="tri">${eT('Triple it:')} ${bico}${OFFLINE_X3}${bvHTML(OFFLINE_X3)}</button><button class="btn" data-x="take">${eT('Collect {amount}',{amount:money(p.amount)})}</button>`,
   {take(){ collectPending(1); },
    dbl(){ if(!spend(OFFLINE_X2)) return false; collectPending(2); },
    tri(){ if(!spend(OFFLINE_X3)) return false; collectPending(3); }},{sticky:true});
}
/* Offline pay is added to anything not collected yet, and the open modal is refreshed. */
function addPending(o){
  if(!(o&&o.amount>0)) return;
  const p=S.pending;
  if(p){ p.amount+=o.amount; p.secs+=o.secs; p.capped=p.capped||o.capped; if(mroot.querySelector('[data-offline]')){ mSticky=false; offlineModal(); } }
  else { S.pending={amount:o.amount,secs:o.secs,capped:o.capped}; queueModal(offlineModal); }
}
/* Work out offline pay only after Chief's Club has been re-checked with the App Store (a renewal while away counts). */
function settleOffline(secs,waitFor){
  let done=false; const go=()=>{ if(done) return; done=true; recalc(); if(D.ips>0) addPending(offlineFor(secs)); };
  if(!APP.native){ go(); return; }
  Promise.race([waitFor||syncEntitlements(),new Promise(r=>setTimeout(r,3000))]).then(go,go);
}
function collectPending(m){ const p=S.pending; if(!p) return; S.pending=null; addFunds(p.amount*m); sfx('coin'); toast(_('Collected {amount}',{amount:money(p.amount*m)}),'gold'); }
function applyCalm(){ document.documentElement.classList.toggle('calm',!!S.calm); }
function creditsModal(){
  modal(`<h3>${eT('Credits')}</h3><p>${eT('{app} is a work of fiction. It is not affiliated with any real police, fire or EMS agency.',{app:APP.name})}</p><p class="fine">${eT('All artwork and sounds are original and generated in code. The fonts Big Shoulders Display, Barlow Semi Condensed and Share Tech Mono are used under the SIL Open Font License 1.1.')}</p><button class="btn ghost" data-x="notices">${eT('Full notices')}</button><button class="btn" data-x="close">${eT('Close')}</button>`,{notices(){ Native.openLegal('notices'); return false; }});
}
/* Switch language: re-translate the data, rebuild names that were built from it, redraw everything. */
function applyLanguage(pref){
  S.lang=pref; setLang(pref); localizeData(); localizeShopData(); setWorld(S.world);
  renderNav(); renderChips(); applyLangUI(); applyWorldUI(); save();
}
function languageModal(){
  const opt=(code,label,on)=>`<button class="btn ${on?'green':'ghost'}" data-x="lang" data-l="${code}" lang="${code==='auto'?LANG:code}">${esc(label)}</button>`;
  modal(`<h3>${eT('Language')}</h3><div class="list">${opt('auto',_('Automatic ({language})',{language:langName(deviceLang())}),S.lang==='auto')}${availLangs().map(([c,n])=>opt(c,n,S.lang===c)).join('')}</div>`,
   {lang(b){ applyLanguage(b.dataset.l); settingsModal(); return false; }});
}
function settingsModal(){
  const tog=(k,label,on)=>`<div class="card row sp"><span>${esc(label)}</span><button class="btn sm ${on?'green':'ghost'}" data-x="${k}">${on?eT('On'):eT('Off')}</button></div>`;
  modal(`<h3>${eT('Settings')}</h3><div class="list">${tog('sound',_('Sound effects'),S.sound)}${tog('music',_('Music'),S.music!==false)}${tog('haptics',_('Haptics'),S.haptics!==false)}${tog('calm',_('Reduce flashing'),!!S.calm)}${availLangs().length>1?`<div class="card row sp"><span>${eT('Language')}</span><button class="btn sm ghost" data-x="language">${esc(S.lang==='auto'?_('Automatic ({language})',{language:langName(LANG)}):langName(LANG))}</button></div>`:''}</div>
   <div class="list"><button class="btn ghost" data-x="restore">${eT('Restore Purchases')}</button><button class="btn ghost" data-x="manage">${eT('Manage Subscription')}</button></div>
   <div class="list"><button class="btn ghost" data-x="privacy">${eT('Privacy Policy')}</button><button class="btn ghost" data-x="terms">${eT('Terms of Use')}</button><button class="btn ghost" data-x="purch">${eT('Purchase Terms')}</button><button class="btn ghost" data-x="odds">${eT('Crate odds')}</button><button class="btn ghost" data-x="support">${eT('Support')}</button><button class="btn ghost" data-x="credits">${eT('Credits')}</button></div>
   <button class="btn red" data-x="erase">${eT('Erase save')}</button>
   <p class="fine">${esc(APP.name)} ${esc(APP.version)} (${esc(APP.build)}). ${eT('Your progress is stored on this device.')}</p>`,
   {sound(){ S.sound=!S.sound; if(S.sound) sfx('buy'); save(); settingsModal(); return false; },
    music(){ S.music=S.music===false; Music.toggle(); save(); settingsModal(); return false; },
    haptics(){ S.haptics=S.haptics===false; if(S.haptics) Native.haptic('light'); save(); settingsModal(); return false; },
    calm(){ S.calm=!S.calm; applyCalm(); save(); settingsModal(); return false; },
    language(){ languageModal(); return false; },
    restore(){ restorePurchases(); return false; },manage(){ manageSubscription(); return false; },
    privacy(){ Native.openLegal('privacy'); return false; },terms(){ Native.openLegal('terms'); return false; },purch(){ Native.openLegal('purchases'); return false; },
    odds(){ showOdds(); return false; },support(){ Native.openLegal('support'); return false; },credits(){ creditsModal(); return false; },
    erase(b){ if(b.dataset.arm){ wipe(); return false; } b.dataset.arm='1'; b.textContent=_('Tap again to erase everything'); setTimeout(()=>{ if(b.isConnected){ b.dataset.arm=''; b.textContent=_('Erase save'); } },3500); return false; }});
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
 link(b){ Native.openLegal(b.dataset.u); },
 daily(){ dailyModal(); },
 startOp(b){ startOp(b.dataset.id); },
 claim(b){ claimOp(+b.dataset.s); },
 speed(b){ speedOp(+b.dataset.s); },
 openCrate(b){ openCrateUI(b.dataset.k); },
 buyCrate(b){ buyCrate(b.dataset.k,+b.dataset.n); },
 odds(){ showOdds(); },
 starter(){ buyStarter(); }, vip(){ buyVIP(); }, pass(){ buyPass(); }, piggy(){ buyPiggy(); }, deal(b){ buyDeal(b.dataset.id); },
 autoBuy(b){ buyAuto(+b.dataset.l||1); },
 autoToggle(){ S.autoOn=!S.autoOn; sfx('buy'); toast(S.autoOn?_('Auto-Clicker on'):_('Auto-Clicker off')); dirty('shop'); },
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
arrestBtn.addEventListener('pointerdown',e=>{ e.preventDefault(); arrestBtn.classList.add('down'); doTap(Scene.randX()); });
['pointerup','pointerleave','pointercancel'].forEach(ev=>arrestBtn.addEventListener(ev,()=>arrestBtn.classList.remove('down')));
arrestBtn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); if(!e.repeat) doTap(Scene.randX()); } });

/* ====================== HUD + CHIPS ====================== */
const chipsEl=$('#chips');
const CHIPS=[
 ['dbl','chip gold',N_('2x INCOME')],['spree','chip hot','SPREE x7'],['vip','chip blue',N_("CHIEF'S CLUB")],
 ['starter','chip hot btnlike',N_('STARTER DEAL'),'goShop'],['rally','chip blue btnlike',N_('RALLY BOOST'),'rally'],['daily','chip hot btnlike',N_('DAILY REWARD'),'daily'],
 ['auto','chip blue btnlike',N_('AUTO'),'autoToggle'],['buyauto','chip gold btnlike',N_('AUTO-CLICK'),'goShop'],
];
function renderChips(){ chipsEl.innerHTML=CHIPS.map(([k,c,l,a])=>`<span class="${c}" data-chip="${k}"${a?` data-act="${a}"`:''} hidden><b>${eT(l)}</b> <span data-t></span></span>`).join(''); }
renderChips();
const chip=k=>chipsEl.querySelector(`[data-chip="${k}"]`);
/* Phones: the street view can be enlarged (setting kept in the save). */
const zoomBtn=$('#sceneZoom');
function applySceneSize(){
  const big=!!S.bigScene; $('#app').classList.toggle('big-scene',big);
  zoomBtn.setAttribute('aria-pressed',String(big)); zoomBtn.setAttribute('aria-label',big?_('Shrink street view'):_('Enlarge street view'));
  zoomBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${big?'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5':'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}"/></svg>`;
}
zoomBtn.addEventListener('click',()=>{ S.bigScene=!S.bigScene; applySceneSize(); sfx('tap'); save(); });
/* Static page text that is not rebuilt by the tabs. */
function applyLangUI(){
  applySceneSize();
  $('#comboLbl').textContent=_('Combo');
  $('#badgeBtn').setAttribute('aria-label',_('Get Gold Badges'));
  $('#scene').setAttribute('aria-label',_('Street scene with your team at work'));
  hintCache=''; hud();
}
function setChip(k,show,txt){ const c=chip(k); if(c.hidden===show) c.hidden=!show; if(show&&txt!==undefined){ const t=c.querySelector('[data-t]'); if(t.textContent!==txt) t.textContent=txt; } }
let hintCache='';
function hud(){
  const t=now();
  $('#funds').textContent=money(S.funds); $('#ips').textContent='+'+money(D.ips)+'/s';
  $('#badges').textContent=fmt(S.badges);
  $('#rankName').textContent=rankName(); $('#rankSub').textContent=`${W.short}${W.hard?' '+_('HARD'):''}  |  +${Math.round((D.gm-1)*100)}%`;
  const ab=arrestBtn.firstElementChild; if(ab.textContent!==W.L.tap) ab.textContent=W.L.tap;
  const cm=comboMult(); $('#arrestVal').textContent=_('+{amount} per tap',{amount:money(D.tap*cm)});
  $('#comboX').textContent='x'+dec(cm.toFixed(1));
  $('#comboBar').style.width=combo.n?clamp(1-(performance.now()-combo.t)/1400,0,1)*100+'%':'0';
  $('#sceneRate').textContent=`${fmt(D.crimeRate)} ${W.L.rate}`;
  const d=new Date(); $('#sceneTag').textContent=`${W.districts[Math.min(S.promos,W.districts.length-1)]}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  setChip('dbl',S.boosts.dbl>t,clock((S.boosts.dbl-t)/1000));
  chip('spree').firstElementChild.textContent=W.L.spree+' x7';
  setChip('spree',S.boosts.spree>t,clock((S.boosts.spree-t)/1000));
  setChip('vip',D.vip,dur((S.vip-t)/1000));
  const so=!S.starter&&t<S.t0+48*36e5; setChip('starter',so,clock((S.t0+48*36e5-t)/1000));
  setChip('rally',rallyReady(),_('claim'));
  setChip('daily',!dailyState().claimed,_('claim'));
  const al=S.perm.auto||0;
  chip('auto').firstElementChild.textContent=al>=2?_('COMBO AUTO'):_('AUTO');
  setChip('auto',al>0,S.autoOn?_('ON'):_('OFF'));
  chip('buyauto').firstElementChild.textContent=(al?_('COMBO AUTO'):_('AUTO-CLICK'))+' '+(Pay.price(al?'auto_upgrade':'auto_basic')||'');
  setChip('buyauto',al<2,'');
  let hint='';
  if(S.owned[0]===0&&S.funds<15) hint=_('Tap {button} or the street to earn your first {amount}',{button:W.L.tapWord,amount:money(15)});
  else if(S.owned[0]===0) hint=_('You can afford your first {unit}. Open the {tab} tab',{unit:GENS[0].n,tab:_('Roster')});
  else { const ni=GENS.findIndex((g,i)=>S.owned[i]===0&&(i===0||S.owned[i-1]>0)); hint=canPromote()?_('Promotion ready in {tab}: +{n} Medals',{tab:_('Career'),n:fmt(medalGain())}):ni>=0?_('Next hire: {name} at {amount}',{name:GENS[ni].n,amount:money(unitCost(ni,1))}):_('Promotion at {amount} this run',{amount:money(promoReq())}); }
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
  const el=document.createElement('div'); el.className='fugitive'; el.dataset.label=W.L.bounty; el.setAttribute('role','button'); el.setAttribute('aria-label',_('Catch the bounty target')); el.innerHTML=fugitiveSVG(); el.style.setProperty('--dur',(D.vip?7:9)+'s');
  const grab=ev=>{ if(ev) ev.stopPropagation(); if(!el.isConnected) return; el.remove(); catchFugitive(); Scene.flash('#ffd21f'); Scene.pop(180,70,W.L.done,'#ffd21f'); };
  el.addEventListener('pointerdown',grab); el.addEventListener('animationend',()=>el.remove());
  layer.appendChild(el); sfx('siren');
  if(D.vip) setTimeout(grab,1600);
}

/* ====================== FIRST-RUN COACH ======================
   A short guided start for new players: a pointing hand, a highlight ring and one line of text per step.
   S.tut: 0 not decided yet, 1..7 the current step, 99 done or skipped. Every step can be skipped. */
const Coach=(function(){
  const el=document.createElement('div'); el.id='coach'; el.hidden=true;
  el.innerHTML=`<div class="ring"></div><svg class="hand" viewBox="0 0 48 48" aria-hidden="true"><path d="M17 4c2 0 3.5 1.6 3.5 3.6V21l1.4-.3c.3-1.7 1.8-2.9 3.5-2.9 1.6 0 3 1.1 3.4 2.6.6-.4 1.4-.7 2.2-.7 1.7 0 3.1 1.2 3.4 2.8.5-.3 1.1-.4 1.7-.4 2 0 3.4 1.6 3.4 3.6v8.8c0 6.9-5.6 12.5-12.5 12.5h-2.6c-4.1 0-7.9-2-10.2-5.4L6.8 31.6c-1-1.6-.6-3.7.9-4.8 1.5-1 3.5-.8 4.7.6l1.1 1.3V7.6C13.5 5.6 15 4 17 4z" fill="#fff" stroke="#0a0c1c" stroke-width="2.4" stroke-linejoin="round"/><path d="M20.5 21v6M27 20.5v6M33 22v5" stroke="#0a0c1c" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg><div class="bubble" role="status" aria-live="polite"><p></p><div class="row sp"><button class="linkbtn" type="button" data-c="skip"></button><button class="btn sm" type="button" data-c="ok"></button></div></div>`;
  document.body.appendChild(el);
  const ring=el.querySelector('.ring'),hand=el.querySelector('.hand'),bub=el.querySelector('.bubble'),txt=bub.querySelector('p'),okB=bub.querySelector('[data-c=ok]'),skipB=bub.querySelector('[data-c=skip]');
  let shownStep=-1,stepAt=0;
  const tabBtn=t=>navEl.querySelector(`[data-t="${t}"]`);
  const cheapUp=()=>availUps().find(u=>S.funds>=u.cost);
  const STEPS={
    1:{target:()=>arrestBtn,text:()=>_('Tap {button}! Every tap earns cash.',{button:W.L.tapWord}),done:()=>S.funds>=unitCost(0,1)||S.owned[0]>0},
    2:{target:()=>tabBtn('roster'),text:()=>_('You can afford a {unit}. Open {tab}.',{unit:GENS[0].n,tab:_('Roster')}),done:()=>cur==='roster'},
    3:{target:()=>panel.querySelector('.gen[data-i="0"] .buy'),text:()=>_('Hire your first {unit}.',{unit:GENS[0].n}),done:()=>S.owned[0]>0,back:()=>cur!=='roster'?2:0},
    4:{target:()=>$('#ips'),hand:false,ok:true,text:()=>_('Your team earns cash on its own, even while you are away. Keep hiring to earn faster.'),done:()=>now()-stepAt>15000},
    5:{wait:true,done:()=>!!cheapUp()},
    6:{target:()=>tabBtn('upgrades'),text:()=>_('You can afford your first upgrade. Open {tab}.',{tab:_('Gear-Up')}),done:()=>cur==='upgrades'},
    7:{target:()=>{ const u=cheapUp(); return u?panel.querySelector(`.up[data-id="${u.id}"] .btn`):null; },text:()=>_('Gear-Up items are permanent boosts. Buy one.'),done:()=>Object.keys(S.ups).length>0,back:()=>cur!=='upgrades'?6:0},
  };
  function go(n){ S.tut=n; stepAt=now(); shownStep=-1; if(n>=99){ el.hidden=true; } save(); }
  function finish(){ go(99); toast(_('Training complete. The city is yours.'),'gold'); sfx('level'); }
  okB.addEventListener('click',()=>{ if(S.tut===4){ go(5); update(); } });
  skipB.addEventListener('click',()=>{ go(99); });
  /* Decide once whether this save needs the tutorial at all. */
  function start(){
    if(S.tut===0) S.tut=(S.owned.some(x=>x>0)||S.promos>0||S.world!=='police'||Object.keys(S.done).length||S.life>1000)?99:1;
    stepAt=now(); update();
  }
  function place(t,st){
    const r=t.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
    ring.style.cssText=`left:${r.left-4}px;top:${r.top-4}px;width:${r.width+8}px;height:${r.height+8}px`;
    const showHand=st.hand!==false;
    hand.style.cssText=showHand?`left:${Math.min(vw-52,r.left+r.width*.6-19)}px;top:${r.top+r.height*.55-4}px`:'display:none';
    const bw=bub.offsetWidth,bh=bub.offsetHeight,sat=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat'))||0;
    let top=r.top-bh-14; if(top<sat+8) top=r.bottom+(showHand?58:14); if(top+bh>vh-8) top=Math.max(sat+8,r.top-bh-14);
    bub.style.left=clamp(r.left+r.width/2-bw/2,12,vw-bw-12)+'px'; bub.style.top=top+'px';
  }
  function update(){
    if(S.tut<1||S.tut>=99){ if(!el.hidden) el.hidden=true; return; }
    if(S.world!=='police'||S.promos>0){ go(99); return; }
    let st=STEPS[S.tut]; if(!st){ go(99); return; }
    if(st.back){ const b=st.back(); if(b){ go(b); st=STEPS[b]; } }
    if(st.done()){ if(S.tut===7){ finish(); return; } go(S.tut+1); Native.haptic('light'); st=STEPS[S.tut]; if(st.done()) return; }
    const t=!st.wait&&st.target&&st.target(),busy=$('#modal-root').classList.contains('on')||document.hidden;
    if(!t||busy||!t.getClientRects().length){ if(!el.hidden) el.hidden=true; return; }
    if(shownStep!==S.tut){
      shownStep=S.tut; txt.textContent=st.text(); okB.hidden=!st.ok; okB.textContent=_('Got it'); skipB.textContent=_('Skip tutorial');
      const pr=panel.getBoundingClientRect(),r=t.getBoundingClientRect(); if(panel.contains(t)&&(r.top<pr.top||r.bottom>pr.bottom)) t.scrollIntoView({block:'nearest'});
    }
    el.hidden=false; place(t,st);
  }
  return {start,update,go};
})();

/* ====================== LOOP ====================== */
let bountyT=60,slowAcc=0,achAcc=0,saveAcc=0;
function tickGame(){
  const t=now(); const dt=(t-S.last)/1000;
  if(dt<-5){ unskew(S,S.last-t); S.last=t; return; }   /* clock moved back */
  S.last=t; if(dt<=0) return;
  if(dt>90){ settleOffline(dt); return; }
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
  hud(); Coach.update();
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
  S.last=t;
  applyCalm();
  applyLangUI();
  $('.rank use').setAttribute('href',rankIcon());
  const purchasesReady=bootPurchases();
  showTab('roster');
  hud(); Coach.start();
  if(S.pending) queueModal(offlineModal);
  if(el>90) settleOffline(el,purchasesReady);
  if(S.sessions>1&&!dailyState().claimed) queueModal(dailyModal);
  /*DEBUG_HOOK_START*/
  window.__np={APP,Pay,PAID_RANDOM,fmt,dailyState,spawnFugitive,openCrateUI,promoteModal,crateBuyAllowed,LANGS,availLangs,setLang,applyLanguage,languageModal,offlineModal,I18N_SEEN,_,
    pseudoLang(){ CAT=new Proxy({},{get:(t,k)=>typeof k==='string'?'\u27e6'+k+'\u27e7':undefined}); localizeData(); localizeShopData(); setWorld(S.world); renderNav(); renderChips(); applyLangUI(); applyWorldUI(); },PRODUCTS,processTx,applyEntitlements,grantSku,purchaseSheet,settingsModal,claimRally,claimSupply,rallyReady,supplyReady,syncEntitlements,restorePurchases,S:()=>S,D,tickGame,recalc,buyGen,buyUp,availUps,doTap,ACT,showTab,GENS:()=>GENS,W:()=>W,WORLDS,promote,canPromote,promoReq,travel,doTravel,applyWorldUI,worldUnlocked,checkAch,addBoost,Scene,
    applyLangUI,applySceneSize,Coach,Music,offlineFor,openCrate,startOp,claimOp,opLeft,opSlots,claimDaily,claimPass,passLevel,catchFugitive,buyItem,buyAgent,ITEMS,AGENTS:()=>AGENTS,addFunds,dailyState,isTop,OPS,unitCost,MILE_T,save,merge,fresh,worlds:()=>WORLDS};
  /*DEBUG_HOOK_END*/
})();
