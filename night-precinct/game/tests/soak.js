// 90-second hammer test for memory / DOM-node / listener leaks.  node soak.js
const { launch, url } = require('./lib');
(async()=>{
  const b=await launch();
  const ctx=await b.newContext({viewport:{width:400,height:820},deviceScaleFactor:2}); const p=await ctx.newPage();
  const cdp=await ctx.newCDPSession(p); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable');
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(url()); await p.waitForTimeout(600);
  await p.evaluate(()=>{ const N=window.__np; const s=N.S(); s.done.police=true; s.done.fire=true; N.doTravel('ems'); const t=N.S(); t.funds=1e35; t.run=1e35; for(let i=0;i<16;i++) t.owned[i]=60; t.perm.auto=2; t.autoOn=true; N.recalc(); document.getElementById('modal-root').classList.remove('on'); });
  await p.waitForTimeout(1200); await p.evaluate(()=>{ const m=document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML=''; });
  const snap=async(label)=>{ await cdp.send('HeapProfiler.collectGarbage'); const m=await cdp.send('Performance.getMetrics'); const g=n=>m.metrics.find(x=>x.name===n).value; const r={label,heapMB:+(g('JSHeapUsedSize')/1048576).toFixed(2),nodes:g('Nodes'),listeners:g('JSEventListeners')}; console.log(JSON.stringify(r)); return r; };
  const a=await snap('start');
  // hammer for 90s: taps, fugitives, tab switching, toasts
  await p.evaluate(()=>{ const N=window.__np; let n=0;
    window.__soak=setInterval(()=>{ n++;
      const cv=document.getElementById('scene'); const r=cv.getBoundingClientRect();
      for(let i=0;i<4;i++) cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+Math.random()*r.width,clientY:r.top+40,bubbles:true}));
      if(n%20===0){ const tabs=['roster','upgrades','ops','shop','career','hq']; N.showTab(tabs[(n/20)%6|0]); }
      if(n%50===0){ N.catchFugitive(); }
      if(n%70===0){ N.addBoost('spree',20); }
      if(n%300===0){ const s=N.S(); s.crates.std+=2; }
    },50); });
  await p.waitForTimeout(45000); const mid=await snap('t+45s');
  await p.waitForTimeout(45000); await p.evaluate(()=>clearInterval(window.__soak)); await p.waitForTimeout(1500);
  const z=await snap('t+90s (idle after)');
  console.log('heap growth (MB):',(z.heapMB-a.heapMB).toFixed(2),' node growth:',z.nodes-a.nodes,' listener growth:',z.listeners-a.listeners,' errors:',JSON.stringify(errs));
  await b.close();
})();
