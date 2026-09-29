// Frame-rate and main-thread profile with a maxed-out roster on phone-DPR and desktop.  node perf.js
const { launch, url } = require('./lib');
(async()=>{
  const b=await launch();
  for(const [label,vp,dsf] of [['phone dpr2',{width:400,height:820},2],['desktop dpr1',{width:1280,height:800},1]]){
    for(const world of ['police','fire','ems']){
      const ctx=await b.newContext({viewport:vp,deviceScaleFactor:dsf}); const p=await ctx.newPage();
      const cdp=await ctx.newCDPSession(p); await cdp.send('Performance.enable');
      p.on('pageerror',e=>console.log('pageerror',e.message));
      await p.goto(url()); await p.waitForTimeout(500);
      await p.evaluate((world)=>{ const N=window.__np; const s=N.S(); s.done.police=true; s.done.fire=true; if(world!=='police') N.doTravel(world); const t=N.S(); t.funds=1e40; t.run=1e40; for(let i=0;i<16;i++) t.owned[i]=200; t.perm.auto=2; t.autoOn=true; t.boosts.spree=Date.now()+1e7; t.theme=world==='ems'?'rain':'night'; N.recalc(); N.Scene.setTheme(); N.showTab('roster'); document.getElementById('modal-root').classList.remove('on'); },world);
      await p.waitForTimeout(900); await p.evaluate(()=>{ const m=document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML=''; });
      await p.waitForTimeout(800);
      const m0=await cdp.send('Performance.getMetrics'); const g=(m,n)=>m.metrics.find(x=>x.name===n).value;
      const t0=g(m0,'Timestamp'), task0=g(m0,'TaskDuration'), script0=g(m0,'ScriptDuration'), lay0=g(m0,'LayoutDuration'), rs0=g(m0,'RecalcStyleDuration');
      const frames=await p.evaluate(()=>new Promise(res=>{ const ts=[]; let n=0; const stop=performance.now()+4000; function f(t){ ts.push(t); if(t<stop) requestAnimationFrame(f); else res(ts); } requestAnimationFrame(f); // hammer taps while measuring
        const tapper=setInterval(()=>{ const cv=document.getElementById('scene'); const r=cv.getBoundingClientRect(); for(let i=0;i<3;i++) cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+Math.random()*r.width,clientY:r.top+30,bubbles:true})); },100); setTimeout(()=>clearInterval(tapper),4000); }));
      const m1=await cdp.send('Performance.getMetrics');
      const el=g(m1,'Timestamp')-t0;
      const d=[]; for(let i=1;i<frames.length;i++) d.push(frames[i]-frames[i-1]); d.sort((a,b)=>a-b);
      const avg=d.reduce((a,b)=>a+b,0)/d.length, p95=d[Math.floor(d.length*.95)], mx=d[d.length-1];
      console.log(`${label.padEnd(13)} ${world.padEnd(7)} fps ${(1000/avg).toFixed(1)}  avg ${avg.toFixed(1)}ms p95 ${p95.toFixed(1)}ms max ${mx.toFixed(0)}ms | main-thread busy ${( (g(m1,'TaskDuration')-task0)/el*100).toFixed(0)}% (script ${((g(m1,'ScriptDuration')-script0)/el*100).toFixed(0)}% layout ${((g(m1,'LayoutDuration')-lay0)/el*100).toFixed(0)}% style ${((g(m1,'RecalcStyleDuration')-rs0)/el*100).toFixed(0)}%)`);
      await ctx.close();
    }
  }
  await b.close();
})();
