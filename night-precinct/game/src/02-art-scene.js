/* ====================== SOUND ====================== */
let AC=null;
function tone(f,d,type='square',v=.04,at=0,to){
  try{
    if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended') AC.resume();
    const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime+at;
    o.type=type; o.frequency.setValueAtTime(f,t);
    if(to) o.frequency.exponentialRampToValueAtTime(to,t+d);
    g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+d+.02);
  }catch(e){}
}
function sfx(k){
  if(!S.sound) return;
  switch(k){
    case 'tap': tone(600+Math.random()*220,.05,'square',.022); break;
    case 'buy': tone(520,.07,'triangle',.05); tone(780,.09,'triangle',.05,.07); break;
    case 'coin': tone(880,.06,'square',.03); tone(1320,.12,'square',.03,.06); break;
    case 'no': tone(140,.14,'sawtooth',.04); break;
    case 'level': [523,659,784,1046].forEach((f,i)=>tone(f,.12,'triangle',.05,i*.08)); break;
    case 'siren': tone(600,.25,'sawtooth',.04,0,1000); tone(1000,.25,'sawtooth',.04,.25,600); break;
  }
}

/* ====================== ICONS ====================== */
const G={
 shield:'<path d="M12 2.5l8 3v6.5c0 5-3.6 8.2-8 9.5-4.4-1.3-8-4.5-8-9.5V5.5z"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
 key:'<circle cx="7.5" cy="12" r="4"/><path d="M11.5 12H22M18 12v4M21 12v3"/>',
 eye:'<path d="M2 12c4-7 16-7 20 0-4 7-16 7-20 0z"/><circle cx="12" cy="12" r="3"/>',
 bolt:'<path d="M13 2L5 13h6l-1 9 9-12h-6z"/>',
 cuffs:'<circle cx="7" cy="15" r="5"/><circle cx="17" cy="9" r="5"/><path d="M10.5 11.5l3 1"/>',
 radio:'<rect x="7" y="8" width="10" height="14" rx="2"/><path d="M9 8V3M10 13h4M10 16h4M10 19h4"/>',
 bag:'<path d="M6 8h12l2 13H4z"/><path d="M9 8c0-5 6-5 6 0"/>',
 cam:'<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
 star:'<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>',
 crate:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 flame:'<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-7 1 1 1 2 2 3 0-3 0-5 1-8z"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
};
function glyph(n,col='currentColor'){
  if(n==='badge') return '<svg viewBox="0 0 24 24"><use href="#i-badge"/></svg>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${G[n]||G.star}</svg>`;
}
const bico='<svg class="bico" viewBox="0 0 24 24"><use href="#i-badge"/></svg>';
const TABS=[
 ['hq','HQ','<path d="M3 20V9l9-6 9 6v11z"/><path d="M9 20v-7h6v7"/>'],
 ['roster','Roster','<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6"/><path d="M15 14c3 0 6 1.5 6 5"/>'],
 ['upgrades','Gear-Up','<path d="M12 21V5"/><path d="M5 12l7-7 7 7"/><path d="M6 21h12"/>'],
 ['ops','Cases','<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3"/><path d="M3 13h18"/>'],
 ['shop','Store','<path d="M4 8h16l-1 13H5z"/><path d="M9 8V6a3 3 0 016 0v2"/>'],
 ['career','Career','<circle cx="12" cy="9" r="5"/><path d="M8 13l-2 8 6-3 6 3-2-8"/>'],
];
function starPts(n,ro,ri,cx=12,cy=12){
  const p=[]; for(let i=0;i<n*2;i++){ const a=-Math.PI/2+i*Math.PI/n,r=i%2?ri:ro; p.push((cx+Math.cos(a)*r).toFixed(2)+','+(cy+Math.sin(a)*r).toFixed(2)); } return p.join(' ');
}
(function sprite(){
  let tips=''; for(let i=0;i<7;i++){ const a=-Math.PI/2+i*2*Math.PI/7; tips+=`<circle cx="${(12+Math.cos(a)*11).toFixed(2)}" cy="${(12+Math.sin(a)*11).toFixed(2)}" r="1.5" fill="#ffe08a" stroke="#a5760a" stroke-width=".6"/>`; }
  $('#sprite').innerHTML=
   `<symbol id="i-badge" viewBox="0 0 24 24"><polygon points="${starPts(7,10,6)}" fill="#ffc53d" stroke="#a5760a" stroke-width="1" stroke-linejoin="round"/>${tips}<circle cx="12" cy="12" r="3.4" fill="#fff0b8" stroke="#a5760a" stroke-width=".8"/><path d="M12 9.8l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.8-1.4.8.3-1.5-1.1-1 1.5-.2z" fill="#a5760a"/></symbol>`+
   `<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 1.5l9 3.3v7.2c0 5.4-3.9 8.9-9 10.5-5.1-1.6-9-5.1-9-10.5V4.8z" fill="#18246a" stroke="var(--blue)" stroke-width="1.3"/><polygon points="${starPts(5,5.6,2.4,12,11.8)}" fill="#ffc53d"/></symbol>`+
   `<clipPath id="shieldClip"><path d="M32 3l25 9.5V33c0 14-10.5 23-25 28C17.5 56 7 47 7 33V12.5z"/></clipPath>`;
})();

/* ====================== PORTRAITS (64x64 SVG) ====================== */
const shieldPath='M32 3l25 9.5V33c0 14-10.5 23-25 28C17.5 56 7 47 7 33V12.5z';
function wrapP(inner,c){ return `<svg class="por" viewBox="0 0 64 64" aria-hidden="true"><path d="${shieldPath}" fill="${c}" fill-opacity=".2"/><g clip-path="url(#shieldClip)">${inner}</g><path d="${shieldPath}" fill="none" stroke="${c}" stroke-width="2.2"/></svg>`; }
const HAT={
 cap:(a='#22357c',b='#152257',br='#0e1740',pin='#ffc53d')=>`<path d="M21.5 27c0-9 4.5-13 10.5-13s10.5 4 10.5 13z" fill="${a}"/><rect x="20" y="25.5" width="24" height="3.5" rx="1.5" fill="${b}"/><path d="M32 28h14l-2 3H32z" fill="${br}"/><circle cx="32" cy="20" r="2.3" fill="${pin}"/>`,
 peak:(c='#1c2a66')=>`<rect x="20.5" y="15" width="23" height="10" rx="3" fill="${c}"/><rect x="20.5" y="23" width="23" height="3" fill="#ffc53d"/><path d="M18.5 26h27l-3 4.5h-21z" fill="#0f1745"/><circle cx="32" cy="19.5" r="2.5" fill="#ffc53d" stroke="#a5760a" stroke-width=".6"/>`,
 helmet:(c='#f2f4ff',s='#ff9f43')=>`<path d="M20.5 33c0-13 5-19 11.5-19s11.5 6 11.5 19z" fill="${c}"/><rect x="22" y="27" width="20" height="8" rx="3.5" fill="#151a3a"/><path d="M24 29l7 0-2 3z" fill="#3d8bff"/><rect x="21" y="20" width="22" height="2" fill="${s}"/>`,
 fedora:()=>`<ellipse cx="32" cy="25" rx="17" ry="3.8" fill="#33261a"/><path d="M22 25c0-10 4-14 10-14s10 4 10 14z" fill="#4a3522"/><rect x="22" y="20.5" width="20" height="3.5" fill="#8b1e2b"/>`,
 swat:()=>`<path d="M20 31c0-12 5-17 12-17s12 5 12 17z" fill="#181c30"/><rect x="21" y="27" width="22" height="6.5" rx="2" fill="#080a14"/><rect x="24" y="28.5" width="16" height="3.2" rx="1.5" fill="#7cffb0" fill-opacity=".75"/><rect x="30" y="12" width="4" height="4" rx="1" fill="#ffc53d"/>`,
 hoodie:()=>`<path d="M15 44c-3-20 3-31 17-31s20 11 17 31c-2-11-7-17-17-17s-15 6-17 17z" fill="#231a48"/>`,
 fire:(c='#ffd21f')=>`<path d="M19 31c0-11 6-17 13-17s13 6 13 17z" fill="${c}"/><rect x="15" y="29" width="34" height="4.5" rx="2.2" fill="${c}"/><path d="M27 17h10l-1.5 9h-7z" fill="#f4f6ff" fill-opacity=".92"/><rect x="30" y="10.5" width="4" height="4.5" rx="1" fill="${c}"/><rect x="15" y="32" width="34" height="1.4" fill="#0004"/>`,
 hard:(c='#f4f6ff')=>`<path d="M20 28c0-10 5-15 12-15s12 5 12 15z" fill="${c}"/><rect x="17" y="26.5" width="30" height="3.5" rx="1.7" fill="${c}"/><rect x="30" y="12" width="4" height="15" fill="#0002"/>`,
 ems:(c='#39c6a6')=>`<path d="M21.5 27c0-9 4.5-13 10.5-13s10.5 4 10.5 13z" fill="${c}"/><rect x="20" y="25.5" width="24" height="3.5" rx="1.5" fill="#0003"/><path d="M32 28h14l-2 3H32z" fill="#0004"/><path d="M27 20.5h2.6l1.4-3.4 2.4 6 1.4-2.6h2.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
};
function hoodBack(c='#f6f8ff'){ return `<path d="M16 46c-4-20 3-33 16-33s20 13 16 33z" fill="${c}"/>`; }
function bust(o){
  const sk=o.skin||'#f0c9a0',bd=o.body||'#2a3f88',hr=o.hair||'#2a1a10';
  let s=o.back||'';
  s+=`<path d="M10 66c0-13 9-21 22-21s22 8 22 21z" fill="${bd}"/>`;
  s+=`<path d="M26 46l6 9 6-9z" fill="${o.shirt||'#dfe6ff'}"/>`;
  if(o.tie) s+=`<path d="M31 51l1 9 1-9z" fill="${o.tie}"/>`;
  if(o.gold) s+=`<rect x="14" y="52" width="6" height="2" fill="#ffc53d"/><rect x="44" y="52" width="6" height="2" fill="#ffc53d"/>`;
  if(o.reflect) s+=`<path d="M14 58h36M16 62h32" stroke="#e8f0ff" stroke-width="2"/>`;
  s+=`<rect x="28.5" y="38" width="7" height="9" fill="${sk}"/>`;
  s+=`<ellipse cx="32" cy="31" rx="9.5" ry="10.5" fill="${sk}"/>`;
  if(!o.nohair) s+=`<path d="M22.5 29c0-9 4-13 9.5-13s9.5 4 9.5 13c-2-5-5-7-9.5-7s-7.5 2-9.5 7z" fill="${hr}"/>`;
  if(!o.visor){
    s+=`<circle cx="28" cy="31.5" r="1.3" fill="#171b33"/><circle cx="36" cy="31.5" r="1.3" fill="#171b33"/>`;
    if(!o.mask) s+=`<path d="M29 37.5q3 2 6 0" stroke="#5a2f22" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  }
  if(o.gl) s+=`<rect x="24" y="28.5" width="7" height="6" rx="2" fill="none" stroke="#1a1a2a" stroke-width="1.2"/><rect x="33" y="28.5" width="7" height="6" rx="2" fill="none" stroke="#1a1a2a" stroke-width="1.2"/><path d="M31 31h2" stroke="#1a1a2a"/>`;
  if(o.beard) s+=`<path d="M22.5 34q9.5 15 19 0q-1.5 8-9.5 9.5-8-1.5-9.5-9.5z" fill="${hr}"/>`;
  if(o.mask) s+=`<path d="M22.5 33.5h19v6q-9.5 5.5-19 0z" fill="${o.mask}"/>`;
  if(o.visor) s+=`<rect x="22" y="27.5" width="20" height="6" rx="3" fill="#0a1020"/><rect x="24" y="29" width="16" height="3" rx="1.5" fill="${o.visor}"/>`;
  if(o.shades) s+=`<rect x="22.5" y="28" width="9" height="5.5" rx="2" fill="#080810"/><rect x="32.5" y="28" width="9" height="5.5" rx="2" fill="#080810"/><path d="M31 30h2" stroke="#080810" stroke-width="1.5"/>`;
  return s+(o.hat||'');
}
function dogSVG(coat='#c8894a',dark='#5a3a1a',collar='#3d8bff',spots=false){
  return `<path d="M20 30L15 10l13 11z" fill="${dark}"/><path d="M44 30l5-20-13 11z" fill="${dark}"/>`+
   `<ellipse cx="32" cy="34" rx="14.5" ry="13" fill="${coat}"/>`+(spots?`<circle cx="24" cy="28" r="3" fill="${dark}"/><circle cx="41" cy="36" r="2.6" fill="${dark}"/><circle cx="37" cy="26" r="2" fill="${dark}"/><circle cx="24" cy="40" r="2" fill="${dark}"/>`:`<path d="M21 30q11-11 22 0q-5 4-11 4t-11-4z" fill="${dark}"/>`)+
   `<ellipse cx="32" cy="43" rx="8" ry="6" fill="#ead2a6"/><ellipse cx="32" cy="39.5" rx="3.4" ry="2.4" fill="#111"/>`+
   `<circle cx="26" cy="31" r="1.7" fill="#111"/><circle cx="38" cy="31" r="1.7" fill="#111"/>`+
   `<path d="M30 45.5q2 3 4 0" stroke="#111" stroke-width="1.2" fill="none"/><path d="M19 52q13 8 26 0" stroke="${collar}" stroke-width="3.5" fill="none"/><circle cx="32" cy="57" r="3.2" fill="#ffc53d" stroke="#a5760a" stroke-width=".7"/>`;
}
function pCar(o){
  const body=o.body||'#eef1ff',roof=o.roof||'#c9d4ff',st=o.stripe||'#2b6cff';
  return `<rect x="12" y="31" width="40" height="17" rx="6" fill="${body}"/><path d="M17 31l5-11h20l5 11z" fill="${roof}"/><path d="M22 30l3.5-8h13l3.5 8z" fill="#1d2a6e"/><path d="M25 24l4 5" stroke="#7ea8ff" stroke-width="1.2"/><rect x="23" y="14" width="9" height="5" rx="1.5" fill="${o.l1||'#ff3d55'}"/><rect x="32" y="14" width="9" height="5" rx="1.5" fill="${o.l2||'#3d8bff'}"/><circle cx="19" cy="40" r="3.2" fill="#ffe28a"/><circle cx="45" cy="40" r="3.2" fill="#ffe28a"/><rect x="26" y="40" width="12" height="4" rx="1" fill="${st}"/><rect x="15" y="47" width="8" height="6" rx="1.5" fill="#090b18"/><rect x="41" y="47" width="8" height="6" rx="1.5" fill="#090b18"/>`+(o.pulse?`<path d="M25 35.5h3l1.6-4.2 2.6 8 1.6-3.8h3" fill="none" stroke="${o.pulse}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`:'');
}
function pTruck(o){
  const b=o.body||'#d82b2b',st=o.stripe||'#ffe28a';
  let s='';
  if(o.ladder){ s+=`<rect x="8" y="14" width="48" height="3" rx="1" fill="#cfd8ff"/><path d="M12 14v3M18 14v3M24 14v3M30 14v3M36 14v3M42 14v3M48 14v3M54 14v3" stroke="#7e8ab8"/>`; }
  if(o.dish){ s+=`<path d="M22 22q10-14 20 0z" fill="#cfd8ff"/><path d="M32 22v-9" stroke="#cfd8ff" stroke-width="2"/><circle cx="32" cy="12" r="2" fill="#ff5a1f"/>`; }
  s+=`<rect x="20" y="18" width="10" height="4" rx="1" fill="#ff3d3d"/><rect x="34" y="18" width="10" height="4" rx="1" fill="#ffffff"/>`;
  s+=`<rect x="6" y="23" width="52" height="27" rx="${o.bus?7:4}" fill="${b}"/><rect x="10" y="27" width="44" height="12" rx="2" fill="#1d2a6e"/><path d="M14 29l8 8M30 28l8 9" stroke="#7ea8ff" stroke-width="1.2"/>`;
  if(o.bus) s+=`<rect x="6" y="41" width="52" height="3" fill="${st}"/>`;
  s+=`<rect x="18" y="41" width="28" height="8" rx="1.5" fill="#0b0f22"/><path d="M22 41v8M27 41v8M32 41v8M37 41v8M42 41v8" stroke="${st}" stroke-width="1.2"/><circle cx="12" cy="44" r="3" fill="#ffe28a"/><circle cx="52" cy="44" r="3" fill="#ffe28a"/><rect x="4" y="49" width="56" height="4" rx="2" fill="#cfd8ff"/><rect x="9" y="52" width="9" height="8" rx="2" fill="#090b18"/><rect x="46" y="52" width="9" height="8" rx="2" fill="#090b18"/>`;
  if(o.armor) s+=`<path d="M6 30h4M6 36h4M54 30h4M54 36h4" stroke="#3d8bff" stroke-width="2"/>`;
  if(o.tank) s+=`<circle cx="32" cy="16" r="6" fill="#dfe6f4" stroke="#8b93b8"/>`;
  if(o.pulse) s+=`<path d="M26.5 33h3l1.6-4 2.6 7.5 1.6-3.5h3" fill="none" stroke="${o.pulse}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}
function pHeli(o){
  const b=o.body||'#1b2a6b',ac=o.accent||'#4de3c1';
  return `<path d="M22 44L8 64h30z" fill="${o.beam||'#fff8b0'}" fill-opacity=".28"/><rect x="8" y="16" width="48" height="2.8" rx="1.4" fill="#cfd8ff"/><rect x="30" y="18" width="4" height="7" fill="#8b93b8"/><ellipse cx="30" cy="32" rx="17" ry="9.5" fill="${b}" stroke="${ac}" stroke-width="1.2"/><path d="M17 30q5-7 14-7l3 7z" fill="#7ce8ff" fill-opacity=".85"/><path d="M44 30h14l4-7h-4l-3 3.5H44z" fill="${b}"/><path d="M22 41v5M40 41v5M14 47h32" stroke="#cfd8ff" stroke-width="2" stroke-linecap="round"/><circle cx="22" cy="43" r="2.2" fill="#fff8b0"/>`+(o.bucket?`<path d="M30 42v8" stroke="#cfd8ff"/><path d="M24 50h12l-2 8H26z" fill="#ff9f43" stroke="#a5591e"/><path d="M27 60v3M32 60v4M37 60v3" stroke="#7cc8ff" stroke-width="2" stroke-linecap="round"/>`:'');
}
function pPlane(o){
  const b=o.body||'#f4f6ff',ac=o.accent||'#ff3d3d';
  return `<path d="M4 44q14 10 30 4" stroke="${o.trail||'#ff5a3d'}" stroke-width="5" fill="none" stroke-opacity=".55" stroke-linecap="round"/><ellipse cx="34" cy="30" rx="24" ry="6" fill="${b}"/><path d="M28 30L14 10h9l14 20z" fill="${ac}"/><path d="M28 32L14 52h9l14-20z" fill="${ac}"/><path d="M52 28l7-11h-5l-8 11z" fill="${ac}"/><path d="M14 30h30" stroke="${ac}" stroke-width="1.5"/><ellipse cx="50" cy="30" rx="4" ry="3" fill="#1d2a6e"/><rect x="10" y="22" width="3" height="16" rx="1.5" fill="#cfd8ff" fill-opacity=".8"/>`;
}
function pDrone(o){
  const b=o.body||'#231a48',g=o.glow||'#b57cff',e=o.eye||'#7ce8ff';
  return `<path d="M32 36L14 62h36z" fill="${g}" fill-opacity=".22"/><ellipse cx="32" cy="30" rx="13" ry="7" fill="${b}" stroke="${g}" stroke-width="1.5"/><circle cx="32" cy="30" r="3.5" fill="${e}"/><path d="M19 27l-9-5M45 27l9-5" stroke="${g}" stroke-width="2"/><rect x="4" y="19" width="12" height="2.5" rx="1.2" fill="#cfd8ff"/><rect x="48" y="19" width="12" height="2.5" rx="1.2" fill="#cfd8ff"/><circle cx="32" cy="50" r="2" fill="${g}"/>`;
}
function pSat(){
  return `<circle cx="32" cy="58" r="28" fill="#0c2a60"/><path d="M12 48q10-6 16 0t14-2 14 2" stroke="#2f7be0" stroke-width="3" fill="none"/><path d="M34 40L24 64h20z" fill="#7ce8ff" fill-opacity=".3"/><rect x="24" y="16" width="16" height="12" rx="2.5" fill="#ffc53d" stroke="#a5760a"/><rect x="4" y="19" width="18" height="7" fill="#3d8bff"/><rect x="42" y="19" width="18" height="7" fill="#3d8bff"/><path d="M10 19v7M16 19v7M48 19v7M54 19v7" stroke="#0a1a4a"/><path d="M32 16v-6" stroke="#cfd8ff" stroke-width="1.5"/><circle cx="32" cy="9" r="2.8" fill="#ff3d55"/>`;
}
function pRobot(o){
  const b=o.body||'#8b93b8',e=o.eye||'#7ce8ff';
  return `<rect x="30" y="4" width="4" height="9" fill="#cfd8ff"/><circle cx="32" cy="4" r="2.5" fill="${e}"/><rect x="20" y="12" width="24" height="20" rx="5" fill="${b}" stroke="#0004"/><rect x="24" y="18" width="16" height="7" rx="3" fill="#0a1020"/><rect x="26" y="20" width="12" height="3" rx="1.5" fill="${e}"/><path d="M26 28h12" stroke="#0005" stroke-width="1.5"/><rect x="26" y="32" width="12" height="5" fill="#4a5480"/><path d="M8 66c0-14 10-24 24-24s24 10 24 24z" fill="${b}"/><rect x="24" y="46" width="16" height="10" rx="2" fill="#0a1020"/><circle cx="28" cy="51" r="2" fill="${e}"/><circle cx="36" cy="51" r="2" fill="${o.fire?'#ff7a1a':'#ff5fa2'}"/>`+(o.fire?`<path d="M14 66l2-8 4 5 3-7 3 10z" fill="#ff7a1a" fill-opacity=".8"/>`:'');
}
function pPortal(o){
  const c=o.col||'#b57cff';
  return `<circle cx="32" cy="34" r="26" fill="${c}" fill-opacity=".15"/><circle cx="32" cy="34" r="22" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="7 4"/><circle cx="32" cy="34" r="15" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="3 5"/><circle cx="32" cy="34" r="9" fill="${c}" fill-opacity=".5"/><path d="M22 62c0-9 4-14 10-14s10 5 10 14z" fill="#0b1030"/><circle cx="32" cy="42" r="5" fill="#0b1030"/><rect x="26" y="40" width="12" height="2" fill="${c}"/>`;
}
const holoBust=(c,bd)=>bust({body:bd,skin:'#d6ccff',hat:HAT.peak(bd),nohair:1,visor:c})+`<path d="M10 41h44M10 47h44M10 53h44M10 59h44" stroke="${c}" stroke-opacity=".35"/>`;
const POR={
 police:[
  ()=>bust({body:'#5aa0ff',tie:'#ffc53d',hat:HAT.cap(),hair:'#3a2415'}),
  ()=>bust({body:'#28408f',skin:'#b98058',tie:'#ffc53d',hat:HAT.peak(),hair:'#1a1210',shirt:'#c9d4ff'}),
  ()=>bust({body:'#141830',skin:'#e0b48c',hat:HAT.helmet('#f2f4ff','#ff9f43'),nohair:1,shirt:'#ff9f43'}),
  ()=>pCar({}),
  ()=>dogSVG(),
  ()=>bust({body:'#7a5a3a',skin:'#d9a679',hat:HAT.fedora(),hair:'#2a1c10',beard:1,shirt:'#f0e6d0',tie:'#8b1e2b'}),
  ()=>bust({back:hoodBack(),body:'#f4f6ff',skin:'#c99770',shirt:'#c9d4ff',nohair:1,mask:'#8fd3ff',gl:1}),
  ()=>bust({body:'#1a1e33',skin:'#f0c9a0',hat:HAT.swat(),nohair:1,mask:'#10131e',shirt:'#3a4160'}),
  ()=>pHeli({}),
  ()=>bust({body:'#1c1436',hat:HAT.hoodie(),visor:'#7ce8ff',nohair:1,shirt:'#3a2a70'})+`<path d="M14 58h8l3-5h6M50 58h-8l-3-5" stroke="#b57cff" stroke-width="1.2" fill="none"/><circle cx="14" cy="58" r="1.5" fill="#b57cff"/><circle cx="50" cy="58" r="1.5" fill="#b57cff"/>`,
  ()=>bust({body:'#0e101c',skin:'#e0b48c',hair:'#111',shades:1,tie:'#ff3d55',shirt:'#eef1ff'})+`<path d="M41.5 33q5 8-1 15" stroke="#e6e6f5" stroke-width="1.2" fill="none"/><circle cx="41.5" cy="33" r="1.5" fill="#e6e6f5"/>`,
  ()=>pSat(),
  ()=>pTruck({body:'#1a1e2e',stripe:'#3d8bff',armor:1}),
  ()=>pRobot({body:'#8b93b8',eye:'#7ce8ff'}),
  ()=>holoBust('#b57cff','#4a3aa0'),
  ()=>pPortal({col:'#ff5fa2'}),
 ],
 fire:[
  ()=>bust({body:'#e8562a',hat:HAT.fire('#ffd21f'),nohair:1,shirt:'#ffe28a'}),
  ()=>bust({body:'#cfa64a',skin:'#b98058',hat:HAT.fire('#d82b2b'),nohair:1,shirt:'#ffd21f',reflect:1}),
  ()=>bust({body:'#3a2a1e',skin:'#e0b48c',hat:HAT.helmet('#ffd21f','#ff5a1f'),nohair:1,shirt:'#ff5a1f'}),
  ()=>pTruck({body:'#d82b2b',stripe:'#ffe28a',ladder:1}),
  ()=>dogSVG('#f4f6ff','#20232b','#ff3d3d',true),
  ()=>bust({body:'#5a4b3a',skin:'#d9a679',hat:HAT.hard('#f4f6ff'),hair:'#2a1c10',gl:1,shirt:'#e8dcc0',tie:'#ff5a1f'}),
  ()=>bust({back:hoodBack('#ffd21f'),body:'#ffd21f',skin:'#c99770',shirt:'#e0b800',nohair:1,mask:'#d0d0d8',gl:1}),
  ()=>bust({body:'#d1442a',skin:'#8a5a3c',hat:HAT.fire('#f4f6ff'),nohair:1,beard:1,hair:'#111',shirt:'#ffe28a'}),
  ()=>pTruck({body:'#f4f6ff',stripe:'#ff5a1f',tank:1}),
  ()=>pTruck({body:'#e63946',stripe:'#ffe28a',ladder:1}),
  ()=>pHeli({body:'#d82b2b',accent:'#ffd21f',bucket:1,beam:'#ffd28a'}),
  ()=>pDrone({body:'#2a1a12',glow:'#ff7a1a',eye:'#ffd28a'}),
  ()=>pPlane({body:'#f4f6ff',accent:'#ff3d3d',trail:'#ff5a3d'}),
  ()=>pTruck({body:'#20242e',stripe:'#ff5a1f',dish:1}),
  ()=>pRobot({body:'#d1442a',eye:'#ffd28a',fire:1}),
  ()=>pSat(),
 ],
 ems:[
  ()=>bust({body:'#1fae94',hat:HAT.ems('#39c6a6'),hair:'#3a2415',shirt:'#e8fff8'}),
  ()=>bust({body:'#2a7fd6',skin:'#b98058',hat:HAT.ems('#2a7fd6'),hair:'#1a1210',shirt:'#eaf3ff',tie:'#ff4d6d'}),
  ()=>bust({body:'#2a7fd6',skin:'#e0b48c',hat:HAT.helmet('#ffffff','#ff4d6d'),nohair:1,shirt:'#ff4d6d'}),
  ()=>pCar({body:'#f4f6ff',roof:'#dfe6ff',stripe:'#ff4d6d',l1:'#ff4d6d',l2:'#ffffff',pulse:'#0fb89a'}),
  ()=>dogSVG('#e0a860','#a5701e','#ff4d6d'),
  ()=>bust({body:'#1c2a5a',skin:'#c98b62',hat:HAT.helmet('#ff4d6d','#f4f6ff'),nohair:1,shirt:'#ff4d6d'}),
  ()=>bust({body:'#39c6a6',skin:'#e0b48c',hat:HAT.ems('#39c6a6'),mask:'#bff3e6',gl:1,shirt:'#e8fff8'}),
  ()=>bust({body:'#ff4d6d',skin:'#8a5a3c',hat:HAT.ems('#e8ecff'),hair:'#111',shirt:'#ffffff'}),
  ()=>pHeli({body:'#f4f6ff',accent:'#ff4d6d',beam:'#bfffe8'}),
  ()=>pDrone({body:'#e8ecff',glow:'#2ee6c8',eye:'#ff4d6d'}),
  ()=>pTruck({body:'#e8ecff',stripe:'#39c6a6',pulse:'#0fb89a'}),
  ()=>pSat(),
  ()=>pTruck({body:'#f4f6ff',stripe:'#ff4d6d',bus:1}),
  ()=>holoBust('#2ee6c8','#1a8a78'),
  ()=>pTruck({body:'#7ce8ff',stripe:'#ffffff'}),
  ()=>pPortal({col:'#b57cff'}),
 ],
};
function portrait(i){ return wrapP(POR[W.id][i](),GENS[i].col); }
function agentPortrait(a){
  const f=a.face;
  if(f.hat==='dog') return wrapP(dogSVG(a.id==='biscuit'?'#e0a860':a.id==='f_ember'?'#f4f6ff':'#e0a860',a.id==='biscuit'?'#7a4a22':a.id==='f_ember'?'#20232b':'#a5701e',a.id==='e_pip'?'#ff4d6d':'#ff3d3d',a.id==='f_ember'),'#ffc53d');
  const hats={peak:HAT.peak(),none:'',hood:'',fire:HAT.fire(f.hc),ems:HAT.ems(f.hc||'#39c6a6')};
  return wrapP(bust({body:f.body||'#1f2f78',skin:f.skin,hair:f.hair,gl:f.gl,beard:f.beard,gold:f.gold,hat:hats[f.hat]||'',back:f.hat==='hood'?hoodBack(f.body==='#ffd21f'?'#ffd21f':'#f6f8ff'):'',nohair:f.hat==='hood'||f.hat==='fire',tie:'#ffc53d'}),'#ffc53d');
}
function crateSVG(type){
  const c={std:['#8b93b8','#cfd8ff'],elite:['#4da3ff','#bfe0ff'],legend:['#ffc53d','#fff0b8']}[type];
  return `<svg viewBox="0 0 58 50"><path d="M4 14L29 2l25 12v22L29 48 4 36z" fill="#121a44" stroke="${c[0]}" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 14l25 12 25-12M29 26v22" stroke="${c[0]}" stroke-width="2" fill="none"/><path d="M29 26L4 14v6l25 12z" fill="${c[0]}" fill-opacity=".18"/><rect x="24" y="24" width="10" height="8" rx="1.5" fill="${c[1]}" stroke="${c[0]}"/><circle cx="29" cy="28" r="1.4" fill="#121a44"/>${type==='legend'?'<circle cx="29" cy="26" r="20" fill="#ffc53d" fill-opacity=".08"/>':''}</svg>`;
}
function fugitiveSVG(){
  if(W.id==='fire') return `<svg viewBox="0 0 52 64"><ellipse cx="26" cy="61" rx="12" ry="2.5" fill="#000" fill-opacity=".4"/><rect x="17" y="46" width="6" height="14" rx="2" fill="#ff5a1f"/><rect x="29" y="46" width="6" height="14" rx="2" fill="#ff5a1f"/><path d="M8 50c-4-14 4-16 6-30 4 6 6 8 8 4 2-8 0-14 4-24 2 12 12 16 10 32 6-2 6-8 6-12 6 14 2 30-4 30z" fill="#ff4d1c"/><path d="M14 52c-2-10 4-12 6-22 3 4 5 6 7 2 1-6 0-10 3-16 1 9 8 12 7 24 3-1 4-5 4-8 3 10 0 20-4 20z" fill="#ff9a2b"/><path d="M20 52c-1-7 2-8 4-14 2 3 3 4 5 1 1 5 5 8 4 13z" fill="#ffe27a"/><circle cx="21" cy="42" r="2.2" fill="#2a0f0a"/><circle cx="31" cy="42" r="2.2" fill="#2a0f0a"/><path d="M22 48q4 3 8 0" stroke="#2a0f0a" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
  if(W.id==='ems') return `<svg viewBox="0 0 52 64"><ellipse cx="26" cy="61" rx="18" ry="2.5" fill="#000" fill-opacity=".4"/><path d="M4 30h44l-2 12H6z" fill="#e8ecff" stroke="#8b93b8" stroke-width="1.5"/><rect x="8" y="24" width="18" height="6" rx="3" fill="#c9d4ff"/><path d="M17 33.5h3.5l1.8-4.5 3 8 2-3.5h4" fill="none" stroke="#ff4d6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 42v10M40 42v10" stroke="#8b93b8" stroke-width="3"/><circle cx="12" cy="56" r="4.500" fill="#1b2340" stroke="#8b93b8" stroke-width="1.500"/><circle cx="40" cy="56" r="4.500" fill="#1b2340" stroke="#8b93b8" stroke-width="1.500"/><circle cx="14" cy="18" r="6" fill="#e8b98e"/><path d="M8 14q6-8 12 0" fill="#3a2415"/><path d="M8 26l-6-4M20 26l6-6" stroke="#e8b98e" stroke-width="3" stroke-linecap="round"/></svg>`;
  return `<svg viewBox="0 0 52 64"><ellipse cx="26" cy="61" rx="12" ry="2.5" fill="#000" fill-opacity=".4"/><rect x="17" y="44" width="7" height="16" rx="2" fill="#20233a"/><rect x="28" y="44" width="7" height="16" rx="2" fill="#20233a"/><rect x="13" y="24" width="26" height="24" rx="6" fill="#f2f2fa"/><path d="M13 30h26M13 36h26M13 42h26" stroke="#15172a" stroke-width="3"/><circle cx="26" cy="16" r="10" fill="#e8b98e"/><rect x="15" y="12" width="22" height="7" rx="3" fill="#0a0a14"/><circle cx="21.5" cy="15.5" r="1.8" fill="#fff"/><circle cx="30.5" cy="15.5" r="1.8" fill="#fff"/><path d="M14 27L4 18" stroke="#f2f2fa" stroke-width="5" stroke-linecap="round"/><circle cx="6" cy="18" r="9" fill="#c9b26b" stroke="#7a6220" stroke-width="1.5"/><text x="6" y="22" text-anchor="middle" font-family="Impact,sans-serif" font-size="12" fill="#3e3210">$</text></svg>`;
}
function worldArt(id){
  const c={police:['#111a4b','#3d8bff'],fire:['#3a1208','#ff5a1f'],ems:['#0b2b28','#2ee6c8']}[id];
  const ic={police:'<path d="M32 8l18 7v14c0 12-8 20-18 24-10-4-18-12-18-24V15z" fill="#ffc53d" fill-opacity=".9"/><polygon points="'+starPts(5,9,4,32,30)+'" fill="#18246a"/>',
    fire:'<path d="M32 6c2 10 16 14 16 30a16 16 0 01-32 0c0-8 5-11 8-18 2 3 3 5 5 7 0-7 1-12 3-19z" fill="#ff7a1a"/><path d="M32 26c1 6 8 8 8 16a8 8 0 01-16 0c0-5 3-7 5-10 1 2 2 3 3 4z" fill="#ffe27a"/>',
    ems:'<path d="M32 48C16 37 10 28 10 20a11 11 0 0122-3 11 11 0 0122 3c0 8-6 17-22 28z" fill="#ff4d6d"/><path d="M15 29h9l3-7 5 14 3-7h11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'}[id];
  return `<svg viewBox="0 0 64 56" class="wart"><rect width="64" height="56" rx="6" fill="${c[0]}"/><path d="M0 46h64v10H0z" fill="${c[1]}" fill-opacity=".35"/>${ic}</svg>`;
}

/* ====================== SCENE ====================== */
const Scene=(function(){
  const cv=$('#scene'),cx=cv.getContext('2d'),wrap=$('#sceneWrap');
  const W0=360,H0=200,LANE={walk:158,road1:176,road2:191,air:66,drone:96,sat:40};
  const TH={
    night:{sky:['#050820','#111a4b','#2c2466'],far:'#0b1134',mid:'#111946',win:'#ffd76a',walk:'#1a2256',road:'#0d1027',line:'#f2e6a0',moon:1,stars:1},
    dusk:{sky:['#22103f','#8e2f6f','#ff9a52'],far:'#2a1238',mid:'#3a1a4b',win:'#ffe0a0',walk:'#3d2153',road:'#190f27',line:'#ffe7b0',sun:1},
    rain:{sky:['#030c19','#0a2846','#134a6d'],far:'#061a2f',mid:'#0b2745',win:'#7ce8ff',walk:'#12304f',road:'#08101e',line:'#a8f0ff',rain:1},
  };
  const TINT={fire:['rgba(255,90,20,.55)','rgba(255,60,10,0)'],ems:['rgba(46,230,200,.28)','rgba(46,230,200,0)']};
  const prof={u:0,r:0,n:0};
  let sc=1,dpr=1,offY=0,bg=null,T=0,last=0,spawnAcc=0,recAcc=0,flashT=0,flashC='#fff',spots=[];
  const units=[],targets=[],pops=[],fx=[],drops=[];
  for(let i=0;i<70;i++) drops.push({x:Math.random()*W0,y:Math.random()*H0,v:rnd(140,230)});
  const stars=[]; for(let i=0;i<46;i++) stars.push({x:Math.random()*W0,y:8+Math.random()*95,p:Math.random()*9,s:Math.random()<.2?1.6:1});

  function resize(){
    const w=wrap.clientWidth,h=wrap.clientHeight; if(!w||!h) return;
    dpr=Math.min(1.5,window.devicePixelRatio||1); sc=w/W0; offY=Math.min(0,h/sc-H0);
    cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
    buildBG();
  }
  function buildBG(){
    const th=TH[S.theme]||TH.night;
    bg=document.createElement('canvas'); bg.width=cv.width; bg.height=Math.round(H0*sc*dpr);
    const g=bg.getContext('2d'); g.setTransform(sc*dpr,0,0,sc*dpr,0,0);
    const grd=g.createLinearGradient(0,0,0,140); th.sky.forEach((c,i)=>grd.addColorStop(i/2,c)); g.fillStyle=grd; g.fillRect(0,0,W0,H0);
    if(th.moon){ g.fillStyle='#f4f1d8'; g.beginPath(); g.arc(302,52,11,0,7); g.fill(); g.fillStyle=th.sky[1]; g.beginPath(); g.arc(307,49,10,0,7); g.fill(); }
    if(th.sun){ const sg=g.createRadialGradient(240,128,2,240,128,46); sg.addColorStop(0,'#fff2b0'); sg.addColorStop(.35,'#ffb454'); sg.addColorStop(1,'rgba(255,120,80,0)'); g.fillStyle=sg; g.fillRect(180,70,120,80); }
    const tn=TINT[W.id]; if(tn){ const tg=g.createLinearGradient(0,60,0,145); tg.addColorStop(0,tn[1]); tg.addColorStop(1,tn[0]); g.fillStyle=tg; g.fillRect(0,60,W0,90); }
    let seed=11; const r=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    g.fillStyle=th.far; let x=-4; while(x<W0){ const w=18+r()*26,h=28+r()*52; g.fillRect(x,134-h,w,h+12); x+=w+2; }
    x=-10; const roofs=[];
    while(x<W0){
      const w=26+r()*34,h=44+r()*60; g.fillStyle=th.mid; g.fillRect(x,142-h,w,h+10);
      roofs.push([x+w*.5,142-h]);
      if(r()<.35){ g.fillRect(x+w/2-1,142-h-11,2,11); g.fillStyle='#ff3d55'; g.fillRect(x+w/2-1,142-h-12,2,2); }
      for(let wy=142-h+6;wy<134;wy+=9) for(let wx=x+4;wx<x+w-6;wx+=8){ const on=r()<.42; g.fillStyle=on?th.win:'rgba(255,255,255,.05)'; g.globalAlpha=on?.5+r()*.45:1; g.fillRect(wx,wy,4,5); }
      g.globalAlpha=1; x+=w+4;
    }
    spots=[]; for(let k=0;k<6;k++) spots.push(roofs[Math.floor((k+.5)*roofs.length/6)]||[60*k+30,90]);
    g.fillStyle=th.walk; g.fillRect(0,140,W0,24); g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(0,140,W0,2);
    g.fillStyle='#2b3672'; g.fillRect(0,162,W0,3); g.fillStyle=th.road; g.fillRect(0,165,W0,35);
    g.fillStyle=th.line; for(let lx=6;lx<W0;lx+=30) g.fillRect(lx,183,15,2);
    for(let lx=40;lx<W0;lx+=110){
      const lg=g.createRadialGradient(lx-5,112,1,lx-5,120,44); lg.addColorStop(0,'rgba(255,240,170,.34)'); lg.addColorStop(1,'rgba(255,240,170,0)'); g.fillStyle=lg; g.fillRect(lx-50,70,90,90);
      g.fillStyle='#090c22'; g.fillRect(lx,110,2,32); g.fillRect(lx-7,108,10,2.5); g.fillStyle='#fff3b0'; g.beginPath(); g.arc(lx-5,112,2,0,7); g.fill();
    }
    g.fillStyle='rgba(255,255,255,.03)'; g.fillRect(0,166,W0,2);
  }
  function rr(x,y,w,h,r){ cx.beginPath(); cx.moveTo(x+r,y); cx.arcTo(x+w,y,x+w,y+h,r); cx.arcTo(x+w,y+h,x,y+h,r); cx.arcTo(x,y+h,x,y,r); cx.arcTo(x,y,x+w,y,r); cx.closePath(); }
  function fillRR(x,y,w,h,r,col){ cx.fillStyle=col; rr(x,y,w,h,r); cx.fill(); }

  /* ---- people ---- */
  function person(x,y,dir,t,o){
    const c=cx; c.save(); c.translate(x,y); c.scale(dir,1);
    if(o.holo){ c.globalAlpha=.78; c.shadowColor=o.holo; c.shadowBlur=6; }
    const w=o.still?0:Math.sin(t*10)*2.4;
    if(!o.sit){ c.fillStyle=o.pants||'#12183a'; c.fillRect(-3.5+w*.4,-8,3,8); c.fillRect(.5-w*.4,-8,3,8); c.fillStyle='#04050d'; c.fillRect(-4+w*.4,-1.4,4.4,1.6); c.fillRect(.4-w*.4,-1.4,4.4,1.6); }
    if(o.hose){ c.strokeStyle='#ffb02b'; c.lineWidth=1.8; c.beginPath(); c.moveTo(-4,-9); c.quadraticCurveTo(-13,-1,-19,-1.5); c.stroke(); }
    c.fillStyle=o.body; rr(-4.6,-16.5,9.2,9.5,o.robot?1:2); c.fill();
    if(o.stripe){ c.fillStyle=o.stripe; for(let k=-15;k<-8;k+=3) c.fillRect(-4.6,k,9.2,1.3); }
    if(o.reflect){ c.fillStyle='#e8f0ff'; c.fillRect(-4.6,-13.4,9.2,1.2); c.fillRect(-4.6,-10.8,9.2,1.2); }
    if(o.robot){ c.fillStyle='#0a1020'; c.fillRect(-2.6,-14.2,5.2,3.4); c.fillStyle=o.eye||'#7ce8ff'; c.fillRect(-1.6,-13.2,1.2,1.4); c.fillRect(.6,-13.2,1.2,1.4); }
    c.fillStyle=o.body;
    if(o.up){ c.fillRect(-5.6,-25,2.2,10); c.fillRect(3.4,-25,2.2,10); c.fillStyle='#cfd8ff'; c.fillRect(-5.8,-26,2.6,1.6); c.fillRect(3.2,-26,2.6,1.6); }
    else { c.fillRect(-5.8+w*.25,-15.5,2.2,7.5); c.fillRect(3.6-w*.25,-15.5,2.2,7.5); }
    if(o.robot){
      c.fillStyle='#9fb0d8'; rr(-3.9,-26,7.8,7,1.5); c.fill(); c.fillStyle='#0a1020'; c.fillRect(-3,-24,6,2.6); c.fillStyle=o.eye||'#7ce8ff'; c.fillRect(-2.2,-23.4,4.4,1.3);
      c.strokeStyle='#cfd8ff'; c.lineWidth=.8; c.beginPath(); c.moveTo(0,-26); c.lineTo(0,-29); c.stroke(); c.fillStyle=Math.floor(t*3)%2?'#ff3d55':'#3a0c14'; c.fillRect(-.9,-30.2,1.8,1.8);
    } else {
      c.fillStyle=o.skin||'#f0c9a0'; c.beginPath(); c.arc(0,-20.4,3.7,0,7); c.fill();
      switch(o.hat){
        case 'cap': c.fillStyle=o.hc||'#22357c'; c.fillRect(-4.2,-25.6,8.4,3.4); c.fillRect(0,-22.8,6,1.3); break;
        case 'peak': c.fillStyle='#1c2a66'; c.fillRect(-4.4,-27,8.8,4.6); c.fillStyle='#ffc53d'; c.fillRect(-4.4,-23.6,8.8,1); c.fillStyle='#0f1745'; c.fillRect(0,-22.8,6.5,1.5); break;
        case 'helmet': c.fillStyle=o.hc||'#f2f4ff'; c.beginPath(); c.arc(0,-21,4.4,Math.PI,0); c.fill(); c.fillStyle=o.vc||'#7cffb0'; c.fillRect(0,-22.6,4.4,1.8); break;
        case 'fedora': c.fillStyle=o.hc||'#4a3522'; c.fillRect(-6.4,-23.6,12.8,1.4); c.fillRect(-3.8,-27.5,7.6,4.2); c.fillStyle='#8b1e2b'; c.fillRect(-3.8,-24.6,7.6,1); break;
        case 'hood': c.strokeStyle='#f6f8ff'; c.lineWidth=2; c.beginPath(); c.arc(0,-20.4,4.6,Math.PI*.9,Math.PI*2.1); c.stroke(); c.fillStyle='#8fd3ff'; c.fillRect(0,-19.5,3.8,2); break;
        case 'fire': c.fillStyle=o.hc||'#ffd21f'; c.beginPath(); c.arc(0,-21.4,4.7,Math.PI,0); c.fill(); c.fillRect(-6.4,-21.6,12.8,1.5); c.fillStyle='#f4f6ff'; c.fillRect(-1.2,-25.6,2.4,2.4); break;
        case 'haz': c.fillStyle=o.hc||'#ffd21f'; c.beginPath(); c.arc(0,-20.6,4.6,0,7); c.fill(); c.fillStyle='#bfe9ff'; c.fillRect(0,-22.6,3.8,3.4); c.fillStyle='#6b7280'; c.fillRect(2.6,-19.2,2.2,2.2); break;
        case 'hard': c.fillStyle=o.hc||'#f4f6ff'; c.beginPath(); c.arc(0,-21.2,4.4,Math.PI,0); c.fill(); c.fillRect(-5.6,-21.4,11.2,1.4); break;
        case 'ems': c.fillStyle=o.hc||'#39c6a6'; c.fillRect(-4.2,-25.6,8.4,3.4); c.fillRect(0,-22.8,6,1.3); c.fillStyle='#fff'; c.fillRect(-1.8,-24.5,3.6,1.1); break;
      }
      if(o.badge){ c.fillStyle='#ffc53d'; c.fillRect(1.2,-14.5,2.2,2.4); }
      if(o.mask){ c.fillStyle='#08080f'; c.fillRect(-3.8,-21.6,7.6,2.2); }
    }
    if(o.shield){ c.fillStyle='rgba(124,232,255,.5)'; c.fillRect(3.4,-18,4.4,14); c.strokeStyle='#cfd8ff'; c.lineWidth=.6; c.strokeRect(3.4,-18,4.4,14); }
    if(o.axe){ c.strokeStyle='#8a5a3c'; c.lineWidth=1.3; c.beginPath(); c.moveTo(5,-6); c.lineTo(8,-20); c.stroke(); c.fillStyle='#cfd8ff'; c.fillRect(6.6,-22,4,3.4); }
    if(o.defib){ c.fillStyle='#ffd21f'; c.fillRect(5.6,-11,3.4,2.6); c.fillStyle='#ff4d6d'; c.fillRect(6.4,-10.4,1.8,1.4); }
    if(o.bag){ c.fillStyle='#c9b26b'; c.beginPath(); c.arc(-5.6,-13,3.4,0,7); c.fill(); c.fillStyle='#3e3210'; c.fillRect(-6.4,-14,1.6,2); }
    if(o.glint){ const a=.5+.5*Math.sin(t*6); c.fillStyle=`rgba(255,230,140,${a})`; c.beginPath(); c.arc(7,-14,2.6,0,7); c.fill(); c.strokeStyle='#cfd8ff'; c.lineWidth=.8; c.stroke(); }
    c.restore();
  }
  function moto(x,y,dir,t,o){
    const c=cx; c.save(); c.translate(x,y); c.scale(dir,1);
    c.strokeStyle='#07091a'; c.lineWidth=2; [-8,8].forEach(wx=>{ c.beginPath(); c.arc(wx,-4,3.8,0,7); c.stroke(); });
    c.strokeStyle=o.col; c.lineWidth=2.4; c.beginPath(); c.moveTo(-8,-4); c.lineTo(-2,-9); c.lineTo(5,-9); c.lineTo(8,-4); c.moveTo(1,-9); c.lineTo(3,-13); c.stroke();
    c.fillStyle='#141830'; rr(-4,-11.5,8,3.5,1.5); c.fill();
    const f=Math.floor(t*(S.calm?1.4:7))%2; c.fillStyle=f?LC()[0]:LC()[1]; c.fillRect(-7,-12.5,3.2,2);
    c.restore();
    person(x-1*dir,y-3,dir,t,{sit:1,still:1,body:o.rider,hat:'helmet',hc:o.helm,vc:o.vc});
  }
  function dog(x,y,dir,t,o){
    const c=cx; c.save(); c.translate(x,y); c.scale(dir,1);
    const w=Math.sin(t*14)*2;
    c.fillStyle=o.coat; c.fillRect(-6+w*.4,-4,1.8,4); c.fillRect(-3-w*.4,-4,1.8,4); c.fillRect(3+w*.4,-4,1.8,4); c.fillRect(6-w*.4,-4,1.8,4);
    rr(-8,-9,17,6,2.5); c.fill();
    c.fillStyle=o.dark; if(o.spots){ [[-5,-7],[0,-6],[4,-8]].forEach(p=>{ c.beginPath(); c.arc(p[0],p[1],1.3,0,7); c.fill(); }); } else { rr(-6,-9.5,11,2.5,1); c.fill(); }
    c.fillStyle=o.coat; c.beginPath(); c.arc(9,-10,3.5,0,7); c.fill();
    c.fillStyle='#ead2a6'; c.fillRect(10.5,-9.5,4,2.6); c.fillStyle='#111'; c.fillRect(14,-10,1.4,1.4);
    c.fillStyle=o.dark; c.beginPath(); c.moveTo(8,-13); c.lineTo(9,-9.5); c.lineTo(6.3,-10); c.fill();
    c.strokeStyle=o.coat; c.lineWidth=1.6; c.beginPath(); c.moveTo(-8,-8); c.quadraticCurveTo(-12,-11-w,-11,-13); c.stroke();
    c.fillStyle=o.collar; c.fillRect(5,-8.5,2,4.2);
    c.restore();
  }
  /* ---- vehicles ---- */
  const LC=()=>W.id==='fire'?['#ff3d3d','#ffffff']:W.id==='ems'?['#ff4d6d','#ffffff']:['#ff3d55','#3d8bff'];
  const skinCols=()=>W.skins.find(k=>k.id===S.skin)||W.skins[0];
  function wheel(x,y,r=3.5){ cx.fillStyle='#07091a'; cx.beginPath(); cx.arc(x,y,r,0,7); cx.fill(); cx.fillStyle='#4a5480'; cx.beginPath(); cx.arc(x,y,r*.38,0,7); cx.fill(); }
  function flash(x,y,t,ph){
    const f=Math.floor(t*(S.calm?1.4:6)+ph)%2,lc=LC();
    cx.fillStyle=f?lc[0]:lc[1]; cx.fillRect(x,y,4,2.3); cx.fillStyle=f?lc[1]:lc[0]; cx.fillRect(x+4,y,4,2.3);
    cx.globalAlpha=.2; cx.fillStyle=f?lc[0]:lc[1]; cx.beginPath(); cx.arc(x+(f?2:6),y+1,10,0,7); cx.fill(); cx.globalAlpha=1;
  }
  function vehStart(x,y,dir,len){ cx.save(); cx.translate(x,y); cx.scale(dir,1); cx.fillStyle='rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(0,0,len,2.6,0,0,7); cx.fill(); }
  function car(u,o){
    const c=cx,t=T+u.ph,k=o.skin?skinCols():o;
    vehStart(u.x,u.y,u.dir,19);
    fillRR(-18,-11,36,8.5,3,k.body);
    c.beginPath(); c.moveTo(-9,-11); c.lineTo(-5.5,-17.5); c.lineTo(7,-17.5); c.lineTo(11.5,-11); c.closePath(); c.fillStyle=k.roof||k.body; c.fill();
    c.fillStyle='#22336e'; c.beginPath(); c.moveTo(-7.5,-11.5); c.lineTo(-4.5,-16.5); c.lineTo(-.5,-16.5); c.lineTo(-.5,-11.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(1,-11.5); c.lineTo(1,-16.5); c.lineTo(6.2,-16.5); c.lineTo(9.5,-11.5); c.closePath(); c.fill();
    c.fillStyle=k.stripe; c.fillRect(-18,-8,36,2);
    if(o.pulse){ c.strokeStyle=o.pulse; c.lineWidth=1.3; c.lineJoin='round'; c.lineCap='round'; c.beginPath(); c.moveTo(-11,-8); c.lineTo(-9.3,-8); c.lineTo(-8.2,-10.4); c.lineTo(-6.9,-5.8); c.lineTo(-6,-8); c.lineTo(-4.4,-8); c.stroke(); }
    wheel(-10.5,-2.8); wheel(10.5,-2.8);
    c.fillStyle='#fff2a8'; c.fillRect(16.5,-9.5,1.8,2.2); c.fillStyle='#ff3d55'; c.fillRect(-18,-9.5,1.4,2);
    if(!o.fed) flash(-3,-19.7,t,u.ph); else { c.fillStyle='#7ce8ff'; c.fillRect(-1,-18.3,3,1); }
    c.restore();
  }
  function longVeh(u,o,kind){
    const c=cx,t=T+u.ph,k=o.skin?skinCols():o;
    const len=kind==='ladder'?34:kind==='bus'?25:26;
    vehStart(u.x,u.y,u.dir,len);
    if(kind==='engine'){
      fillRR(-26,-14,36,11,2,k.body); fillRR(9,-17,17,14,3,k.body);
      c.fillStyle='#22336e'; c.fillRect(16,-15,8,6); c.fillStyle=k.stripe; c.fillRect(-26,-8.5,36,1.6);
      c.fillStyle='#cfd8ff'; c.fillRect(-25,-18.5,34,2); c.strokeStyle='#7e8ab8'; c.lineWidth=.6; c.beginPath(); for(let x=-24;x<8;x+=4){ c.moveTo(x,-18.5); c.lineTo(x,-16.5); } c.stroke();
      c.fillStyle='#cfd8ff'; c.beginPath(); c.arc(-14,-8,3,0,7); c.fill(); c.fillStyle='#8b93b8'; c.beginPath(); c.arc(-14,-8,1.2,0,7); c.fill();
      wheel(-18,-3); wheel(-8,-3); wheel(18,-3); flash(12,-19.5,t,u.ph);
    } else if(kind==='tanker'){
      fillRR(9,-16,15,13,3,k.body); c.fillStyle='#22336e'; c.fillRect(15,-14,7,5);
      fillRR(-25,-19,34,15,7,'#dfe6f4'); c.fillStyle=k.stripe; c.fillRect(-25,-11.5,34,2); c.fillStyle='#8b93b8'; c.fillRect(-9,-21,6,2.4);
      wheel(-18,-3); wheel(-8,-3); wheel(16,-3); flash(11,-18.5,t,u.ph);
    } else if(kind==='ladder'){
      fillRR(-34,-13,44,10,2,k.body); fillRR(10,-16,17,13,3,k.body); c.fillStyle='#22336e'; c.fillRect(17,-14,8,6); c.fillStyle=k.stripe; c.fillRect(-34,-8,44,1.6);
      const sw=Math.sin(T*1.2+u.ph)*2.2; c.strokeStyle='#cfd8ff'; c.lineWidth=1.2; c.beginPath(); c.moveTo(-30,-14); c.lineTo(16,-30+sw); c.moveTo(-30,-17); c.lineTo(16,-33+sw); c.stroke();
      c.lineWidth=.7; c.beginPath(); for(let k2=0;k2<=6;k2++){ const p=k2/6; c.moveTo(-30+46*p,-14-16*p+sw*p); c.lineTo(-30+46*p,-17-16*p+sw*p); } c.stroke();
      wheel(-28,-3); wheel(-18,-3); wheel(-8,-3); wheel(18,-3); flash(12,-18.5,t,u.ph);
    } else if(kind==='bus'){
      fillRR(-24,-17,48,14,3,k.body); c.fillStyle='#22336e'; for(let q=0;q<6;q++) c.fillRect(-21+q*7.4,-14.6,5.2,5); c.fillRect(19,-14.6,4,7);
      c.fillStyle=k.stripe; c.fillRect(-24,-8.2,48,1.8); wheel(-14,-3); wheel(14,-3); flash(-3,-19.2,t,u.ph);
    } else { /* box: ambulance, van, command, cryo */
      fillRR(-22,-16,32,13,2,k.body); fillRR(9,-13,14,10,3,k.body); c.fillStyle='#22336e'; c.fillRect(15,-11.5,7,5);
      c.fillStyle=k.stripe; c.fillRect(-22,-8.5,45,1.8);
      if(o.pulse){ c.strokeStyle=o.pulse; c.lineWidth=1.6; c.lineJoin='round'; c.lineCap='round'; c.beginPath(); c.moveTo(-16,-9.5); c.lineTo(-13,-9.5); c.lineTo(-11.4,-13.6); c.lineTo(-8.8,-6); c.lineTo(-7.2,-9.5); c.lineTo(-4,-9.5); c.stroke(); }
      if(o.armor){ c.fillStyle='#3d8bff'; c.fillRect(-22,-15,32,1.4); c.fillRect(-22,-5,32,1.4); }
      if(o.dish){ c.fillStyle='#cfd8ff'; c.beginPath(); c.arc(-8,-16,5,Math.PI,0); c.fill(); c.strokeStyle='#cfd8ff'; c.beginPath(); c.moveTo(-8,-16); c.lineTo(-8,-21); c.moveTo(2,-16); c.lineTo(2,-24); c.stroke(); }
      if(o.cryo){ c.fillStyle='rgba(124,232,255,.55)'; fillRR(-19,-14,20,8,4,'rgba(124,232,255,.55)'); }
      wheel(-14,-3); wheel(-4,-3); wheel(16,-3); flash(11,-15.6,t,u.ph);
    }
    c.restore();
  }
  /* ---- air + misc ---- */
  function heli(u,o){
    const c=cx,x=u.x,y=u.y,dir=u.dir,t=T+u.ph,tg=u.tgt?u.tgt.x:x+dir*24;
    if(!o.bucket){ c.fillStyle='rgba(255,248,176,.16)'; c.beginPath(); c.moveTo(x,y+5); c.lineTo(tg-11,158); c.lineTo(tg+11,158); c.closePath(); c.fill(); }
    c.save(); c.translate(x,y); c.scale(dir,1);
    c.fillStyle=o.body; c.beginPath(); c.ellipse(0,0,11,5.5,0,0,7); c.fill();
    c.fillRect(8,-2,15,2.2); c.fillRect(21,-6,2.2,6);
    c.fillStyle='#7ce8ff'; c.beginPath(); c.ellipse(-4,-1.5,5,3.2,0,Math.PI,0); c.fill();
    c.fillStyle=o.accent; c.fillRect(-9,1,18,1.2);
    const rw=15*(.25+.75*Math.abs(Math.sin(t*26))); c.fillStyle='rgba(207,216,255,.85)'; c.fillRect(-rw,-8,rw*2,1.3); c.fillRect(-.8,-8,1.6,3);
    c.strokeStyle='#cfd8ff'; c.lineWidth=1; c.beginPath(); c.moveTo(-5,5.5); c.lineTo(-5,8); c.moveTo(5,5.5); c.lineTo(5,8); c.moveTo(-9,8); c.lineTo(9,8); c.stroke();
    if(o.bucket){ c.strokeStyle='#cfd8ff'; c.beginPath(); c.moveTo(0,6); c.lineTo(0,13); c.stroke(); c.fillStyle='#ff9f43'; c.beginPath(); c.moveTo(-3.5,13); c.lineTo(3.5,13); c.lineTo(2.5,18); c.lineTo(-2.5,18); c.closePath(); c.fill();
      if(Math.sin(t*.9)>.5){ c.fillStyle='rgba(124,200,255,.8)'; for(let q=0;q<5;q++){ c.fillRect(-3+q*1.6,19+((t*40+q*7)%36),1.2,3); } } }
    const f=Math.floor(t*(S.calm?1.4:6))%2; c.fillStyle=f?LC()[0]:LC()[1]; c.fillRect(22,-6.5,2.4,1.6);
    c.restore();
  }
  function plane(u,o){
    const c=cx,x=u.x,y=u.y,dir=u.dir,t=T+u.ph;
    c.save(); c.translate(x,y); c.scale(dir,1);
    c.strokeStyle=o.trail; c.globalAlpha=.4; c.lineWidth=4; c.lineCap='round'; c.beginPath(); c.moveTo(-14,4); c.lineTo(-52,10); c.stroke(); c.globalAlpha=1; c.lineCap='butt';
    c.fillStyle=o.body; c.beginPath(); c.ellipse(0,0,15,3.8,0,0,7); c.fill();
    c.fillStyle=o.accent; c.beginPath(); c.moveTo(-2,0); c.lineTo(-9,-8); c.lineTo(-3,-8); c.lineTo(5,0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-9,-1); c.lineTo(-15,-6); c.lineTo(-11,-6); c.lineTo(-5,-1); c.closePath(); c.fill();
    c.fillStyle='#1d2a6e'; c.beginPath(); c.ellipse(9,-1,4,2.2,0,0,7); c.fill();
    c.fillStyle='rgba(207,216,255,.7)'; c.fillRect(14.5,-4*Math.abs(Math.sin(t*30)),1.6,8*Math.abs(Math.sin(t*30)));
    c.restore();
  }
  function drone(u,o){
    const c=cx,x=u.x,y=u.y,t=T+u.ph,sw=(t*1.4)%1;
    c.fillStyle='rgba(124,232,255,.09)'; c.fillStyle=o.glow+'18'; c.beginPath(); c.moveTo(x,y+4); c.lineTo(x-20,150); c.lineTo(x+20,150); c.closePath(); c.fill();
    c.strokeStyle=o.glow+'aa'; c.lineWidth=.8; const sy=y+4+(150-y-4)*sw,hw=20*sw; c.beginPath(); c.moveTo(x-hw,sy); c.lineTo(x+hw,sy); c.stroke();
    c.fillStyle=o.body; c.beginPath(); c.ellipse(x,y,6.5,3.5,0,0,7); c.fill();
    c.strokeStyle=o.glow; c.lineWidth=1; c.strokeRect(x-4,y-1.8,8,3.6);
    c.fillStyle=o.eye; c.beginPath(); c.arc(x,y+.3,1.5,0,7); c.fill();
    c.fillStyle='rgba(207,216,255,.8)'; [-8,8].forEach(d=>{ c.fillRect(x+d-4*Math.abs(Math.sin(t*30)),y-4.5,8*Math.abs(Math.sin(t*30)),1.2); c.fillRect(x+d-.5,y-3.5,1,3); });
  }
  function sat(u){
    const c=cx,x=u.x,y=u.y,t=T+u.ph,on=Math.sin(t*.6)>.35;
    if(on){ const gx=x+Math.sin(t*.9)*70; c.strokeStyle='rgba(124,232,255,.4)'; c.lineWidth=1; c.beginPath(); c.moveTo(x,y+4); c.lineTo(gx,157); c.stroke();
      c.strokeStyle='rgba(255,197,61,.85)'; c.beginPath(); c.arc(gx,157,5+Math.sin(t*8),0,7); c.stroke(); c.beginPath(); c.moveTo(gx-8,157); c.lineTo(gx+8,157); c.moveTo(gx,149); c.lineTo(gx,165); c.stroke(); }
    c.fillStyle='#3d8bff'; c.fillRect(x-14,y-1.5,9,4); c.fillRect(x+5,y-1.5,9,4);
    c.fillStyle='#0a1a4a'; c.fillRect(x-11,y-1.5,.8,4); c.fillRect(x+8,y-1.5,.8,4);
    c.fillStyle='#ffc53d'; rr(x-4.5,y-3.5,9,7.5,1.5); c.fill();
    c.fillStyle=Math.floor(t*2)%2?'#ff3d55':'#3a0c14'; c.beginPath(); c.arc(x,y-5.5,1.4,0,7); c.fill();
  }
  function portal(u,o){
    const c=cx,x=u.x,y=u.y,t=T+u.ph;
    c.save(); c.translate(x,y-2);
    const g=c.createRadialGradient(0,0,1,0,0,15); g.addColorStop(0,o.col+'88'); g.addColorStop(1,o.col+'00'); c.fillStyle=g; c.beginPath(); c.ellipse(0,0,15,5,0,0,7); c.fill();
    c.strokeStyle=o.col; c.lineWidth=1.5; c.setLineDash([4,3]); c.lineDashOffset=-t*14; c.beginPath(); c.ellipse(0,0,13,4,0,0,7); c.stroke();
    c.lineDashOffset=t*10; c.strokeStyle='#ffffffaa'; c.lineWidth=.8; c.beginPath(); c.ellipse(0,0,8,2.4,0,0,7); c.stroke(); c.setLineDash([]);
    c.restore();
    person(x,y-1-Math.abs(Math.sin(t*.8))*2,u.dir,t,{holo:o.col,body:o.col,hat:'peak',still:0});
  }
  function flame(x,y,t,s=1){
    const c=cx; c.save(); c.translate(x,y); c.scale(s,s);
    const a=Math.sin(t*9)*2,b=Math.sin(t*13+1)*2.4;
    c.globalAlpha=.22; c.fillStyle='#ff6a1f'; c.beginPath(); c.arc(0,-8,15,0,7); c.fill(); c.globalAlpha=1;
    const layer=(col,k)=>{ c.fillStyle=col; c.beginPath(); c.moveTo(-6*k,0); c.bezierCurveTo(-9*k,-7,-3*k,-11+a,0,-18*k+b); c.bezierCurveTo(3*k,-11-a,9*k,-7,6*k,0); c.closePath(); c.fill(); };
    layer('#ff4d1c',1); layer('#ff9a2b',.72); layer('#ffe27a',.42);
    c.restore();
  }
  function patient(x,y,t,done){
    const c=cx; c.save(); c.translate(x,y);
    if(!done){
      c.fillStyle='#39c6a6'; rr(-9,-6,14,5.5,2.5); c.fill(); c.fillStyle='#20233a'; c.fillRect(-15,-5,7,3.4);
      c.fillStyle='#e8b98e'; c.beginPath(); c.arc(8,-3.5,3.6,0,7); c.fill(); c.fillStyle='#3a2415'; c.beginPath(); c.arc(8.6,-4.6,3.6,Math.PI,Math.PI*1.9); c.fill();
      const a=.5+.5*Math.sin(t*7); c.fillStyle=`rgba(255,210,31,${.4+.6*a})`; c.fillRect(-1.5,-21,3,7.5); c.fillRect(-1.5,-12.6,3,3);
    } else {
      c.fillStyle='#39c6a6'; rr(-3,-14,7,9,2); c.fill(); c.fillStyle='#20233a'; c.fillRect(-3,-5,11,3); c.fillStyle='#e8b98e'; c.beginPath(); c.arc(.5,-18.4,3.6,0,7); c.fill();
      c.fillStyle='#ff4d6d'; c.font='800 9px sans-serif'; c.textAlign='center'; c.fillText('♥',.5,-25);
    }
    c.restore();
  }
  const CR=['#e8e8f2','#f2c94c','#ff9f43','#c77dff'];

  /* sprite tables: [drawFn, options] per tier */
  const SPR={
   police:[
    ['person',{body:'#5aa0ff',hat:'cap',badge:1}],['person',{body:'#28408f',hat:'peak',badge:1,skin:'#b98058'}],
    ['moto',{col:'#ff9f43',helm:'#f2f4ff',vc:'#3d8bff',rider:'#141830'}],['car',{skin:1}],
    ['dog',{coat:'#c8894a',dark:'#5a3a1a',collar:'#3d8bff'}],['person',{body:'#7a5a3a',hat:'fedora',pants:'#2a2118',skin:'#d9a679'}],
    ['person',{body:'#f4f6ff',hat:'hood',pants:'#dfe6ff',skin:'#c99770',glint:1}],['person',{body:'#1a1e33',hat:'helmet',hc:'#0f1220',vc:'#7cffb0',pants:'#0f1220',shield:1}],
    ['heli',{body:'#1b2a6b',accent:'#4de3c1'}],['drone',{body:'#231a48',glow:'#b57cff',eye:'#7ce8ff'}],
    ['car',{body:'#0d0f1a',stripe:'#242a44',roof:'#171a29',fed:1}],['sat',{}],
    ['box',{body:'#1a1e2e',stripe:'#3d8bff',roof:'#0f1220',armor:1}],['person',{robot:1,body:'#8b93b8',eye:'#7ce8ff',pants:'#4a5480'}],
    ['person',{holo:'#b57cff',body:'#7a5aff',hat:'peak',pants:'#4a3aa0'}],['portal',{col:'#ff5fa2'}],
   ],
   fire:[
    ['person',{body:'#e8562a',hat:'fire',hc:'#ffd21f',pants:'#3a2a1e'}],['person',{body:'#cfa64a',hat:'fire',hc:'#d82b2b',pants:'#3a2a1e',reflect:1,hose:1,skin:'#b98058'}],
    ['moto',{col:'#ff5a1f',helm:'#ffd21f',vc:'#ffb02b',rider:'#3a2a1e'}],['engine',{skin:1}],
    ['dog',{coat:'#f4f6ff',dark:'#20232b',collar:'#ff3d3d',spots:1}],['person',{body:'#5a4b3a',hat:'hard',hc:'#f4f6ff',pants:'#2a2118',glint:1}],
    ['person',{body:'#ffd21f',hat:'haz',hc:'#ffd21f',pants:'#e0b800',skin:'#c99770'}],['person',{body:'#d1442a',hat:'fire',hc:'#f4f6ff',pants:'#3a2a1e',axe:1,skin:'#8a5a3c'}],
    ['tanker',{body:'#f4f6ff',stripe:'#ff5a1f'}],['ladder',{body:'#e63946',stripe:'#ffe28a'}],
    ['heli',{body:'#d82b2b',accent:'#ffd21f',bucket:1}],['drone',{body:'#2a1a12',glow:'#ff7a1a',eye:'#ffd28a'}],
    ['plane',{body:'#f4f6ff',accent:'#ff3d3d',trail:'#ff5a3d'}],['box',{body:'#20242e',stripe:'#ff5a1f',dish:1}],
    ['person',{robot:1,body:'#d1442a',eye:'#ffd28a',pants:'#7a2a18'}],['sat',{}],
   ],
   ems:[
    ['person',{body:'#1fae94',hat:'ems',hc:'#39c6a6',pants:'#20233a'}],['person',{body:'#2a7fd6',hat:'ems',hc:'#2a7fd6',pants:'#20233a',reflect:1,skin:'#b98058'}],
    ['moto',{col:'#e8ecff',helm:'#ffffff',vc:'#ff4d6d',rider:'#2a7fd6'}],['box',{skin:1,pulse:'#0fb89a'}],
    ['dog',{coat:'#e0a860',dark:'#a5701e',collar:'#ff4d6d'}],['person',{body:'#1c2a5a',hat:'helmet',hc:'#ff4d6d',vc:'#f4f6ff',pants:'#12183a',skin:'#c98b62'}],
    ['person',{body:'#39c6a6',hat:'ems',hc:'#39c6a6',pants:'#2a9a82',mask:1}],['person',{body:'#ff4d6d',hat:'ems',hc:'#e8ecff',pants:'#20233a',defib:1,skin:'#8a5a3c'}],
    ['heli',{body:'#f4f6ff',accent:'#ff4d6d'}],['drone',{body:'#e8ecff',glow:'#2ee6c8',eye:'#ff4d6d'}],
    ['box',{body:'#e8ecff',stripe:'#39c6a6',pulse:'#0fb89a'}],['sat',{}],
    ['bus',{body:'#f4f6ff',stripe:'#ff4d6d'}],['person',{holo:'#2ee6c8',body:'#1a8a78',hat:'ems',hc:'#2ee6c8',pants:'#1a8a78'}],
    ['box',{body:'#7ce8ff',stripe:'#ffffff',cryo:1}],['portal',{col:'#b57cff'}],
   ],
  };
  const PRIM={
   person:(u,o)=>person(u.x,u.y,u.dir,T+u.ph,o), moto:(u,o)=>moto(u.x,u.y,u.dir,T+u.ph,o), dog:(u,o)=>dog(u.x,u.y,u.dir,T+u.ph,o),
   car, box:(u,o)=>longVeh(u,o,'box'), engine:(u,o)=>longVeh(u,o,'engine'), tanker:(u,o)=>longVeh(u,o,'tanker'), ladder:(u,o)=>longVeh(u,o,'ladder'), bus:(u,o)=>longVeh(u,o,'bus'),
   heli, plane, drone, sat, portal,
  };
  function drawUnit(u){ const s=SPR[W.id][u.t]; PRIM[s[0]](u,s[1]); }
  function mk(i){
    const g=GENS[i],ln=g.lane;
    const u={t:i,x:rnd(30,330),dir:Math.random()<.5?1:-1,ph:rnd(0,9),tgt:null,y:LANE[ln]};
    const big=SPR[W.id][i][0];
    u.sp=ln==='air'?rnd(18,30):ln==='drone'?rnd(14,24):ln==='sat'?rnd(4,7):ln==='walk'?rnd(16,26):rnd(34,52);
    if(big==='ladder'||big==='bus'||big==='tanker') u.sp*=.8;
    u.chase=ln==='air'?72:ln==='drone'?62:ln==='sat'?0:ln==='walk'?74:110;
    if(ln==='walk') u.y+=rnd(-4,3);
    if(ln==='air') u.y+=rnd(-10,10);
    return u;
  }
  function reconcile(){
    GENS.forEach((g,i)=>{
      const o=S.owned[i],want=o<=0?0:Math.min(g.cap,1+Math.floor(Math.log2(o)));
      let have=units.filter(u=>u.t===i).length;
      while(have<want){ units.push(mk(i)); have++; }
      while(have>want){ const k=units.findIndex(u=>u.t===i); units.splice(k,1); have--; }
    });
  }
  function spawnTarget(){
    if(targets.length>=7) return;
    const cand=units.filter(u=>GENS[u.t].lane!=='sat'&&!u.tgt); if(!cand.length) return;
    const u=pick(cand),ln=GENS[u.t].lane,road=ln==='road1'||ln==='road2',kind=W.kind;
    const away=Math.random()<.5?1:-1; const x=clamp(u.x+away*rnd(60,110),12,348);
    const c={isT:1,kind,x,y:road?LANE[ln]:LANE.walk+rnd(-3,3),dir:x>=u.x?1:-1,st:'run',sp:kind==='crook'?rnd(26,36):0,ch:u,t:rnd(0,9),age:0,col:pick(CR),road,timer:0};
    targets.push(c); u.tgt=c;
  }
  function pop(x,y,txt,col){ pops.push({x,y,txt,col:col||'#ffd76a',life:1.2}); if(pops.length>26) pops.shift(); }
  function burst(x,y,col,n=9){ for(let k=0;k<n;k++){ const a=Math.random()*6.283,s=rnd(20,50); fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-16,life:.5,col}); } if(fx.length>110) fx.splice(0,25); }
  function tap(lx,v,quiet){
    if(document.hidden||targets.length>=14) return;
    const x=clamp(lx,10,350),y=LANE.walk+rnd(-3,3);
    targets.push({isT:1,kind:W.kind,x,y,dir:Math.random()<.5?1:-1,st:'done',timer:.75,t:0,col:pick(CR),age:0,ch:null});
    pop(x,y-34,'+'+money(v),'#7cd6ff'); burst(x,y-12,W.kind==='flame'?'#7cc8ff':'#ffd76a',quiet?4:9);
  }
  function flash_(col){ if(S.calm) return; flashT=.5; flashC=col||'#fff'; }
  function reset(){ units.length=0; targets.length=0; pops.length=0; fx.length=0; buildBG(); }
  function update(dt){
    T+=dt; recAcc+=dt; if(recAcc>.6){ recAcc=0; reconcile(); }
    spawnAcc+=Math.min(D.crimeRate,1.7)*dt;
    if(spawnAcc>=1){ spawnAcc-=1; spawnTarget(); }
    const fine=D.crimeRate>0?D.ips/D.crimeRate:0;
    for(const u of units){
      const ln=GENS[u.t].lane;
      if(u.tgt&&u.tgt.st!=='run') u.tgt=null;
      if(ln==='sat'){ u.x+=u.dir*u.sp*dt; if(u.x>340||u.x<20) u.dir*=-1; continue; }
      if(u.tgt){ const dx=u.tgt.x-u.x; u.dir=dx>=0?1:-1; u.x+=clamp(dx,-u.chase*dt,u.chase*dt); }
      else{ u.x+=u.dir*u.sp*dt; if(u.x>350){u.x=350;u.dir=-1;} if(u.x<10){u.x=10;u.dir=1;} if(Math.random()<dt*.12) u.dir*=-1; }
    }
    for(let k=targets.length-1;k>=0;k--){
      const c=targets[k]; c.age+=dt; c.t+=dt;
      if(c.st==='run'){
        if(c.sp){ c.x+=c.dir*c.sp*dt; if(c.x>352){c.x=352;c.dir=-1;} if(c.x<8){c.x=8;c.dir=1;} }
        const u=c.ch,d=u?Math.abs(u.x-c.x):999;
        if(c.kind==='flame'&&u&&d<36&&Math.random()<dt*46){ fx.push({x:u.x+u.dir*7,y:u.y-14,vx:(c.x-u.x)*2.4+rnd(-8,8),vy:rnd(-34,-14),life:.42,col:'#7cc8ff'}); }
        const near=u&&d<(GENS[u.t].lane==='walk'||c.road?9:13);
        if(near||c.age>6){ c.st='done'; c.timer=.85; if(u) u.tgt=null; pop(c.x,c.y-34,'+'+money(fine),'#ffd76a'); burst(c.x,c.y-12,c.kind==='flame'?'#7cc8ff':'#7ce8ff',c.kind==='flame'?14:9); }
      } else { c.timer-=dt; if(c.timer<=0) targets.splice(k,1); }
    }
    for(let k=pops.length-1;k>=0;k--){ const p=pops[k]; p.life-=dt; p.y-=16*dt; if(p.life<=0) pops.splice(k,1); }
    for(let k=fx.length-1;k>=0;k--){ const f=fx[k]; f.life-=dt; f.x+=f.vx*dt; f.y+=f.vy*dt; f.vy+=90*dt; if(f.life<=0) fx.splice(k,1); }
    if(flashT>0) flashT-=dt;
  }
  function drawTarget(e){
    const alpha=e.st==='done'&&e.timer<.25?e.timer/.25:1; cx.globalAlpha=alpha;
    if(e.kind==='crook'){
      person(e.x,e.y,e.dir,e.t,{body:e.col,stripe:'#15172a',pants:'#20233a',mask:1,bag:1,up:e.st==='done',still:e.st==='done'});
    } else if(e.kind==='flame'){
      if(e.st==='run') flame(e.x,e.y,T+e.t,1);
      else { for(let q=0;q<3;q++){ const p=1-e.timer/.85; cx.fillStyle=`rgba(190,200,215,${.5*(1-p)})`; cx.beginPath(); cx.arc(e.x+(q-1)*3.5+Math.sin(T*6+q)*1.5,e.y-6-p*20-q*3,3+p*4+q,0,7); cx.fill(); } flame(e.x,e.y,T+e.t,.25*e.timer/.85); }
    } else patient(e.x,e.y,T+e.t,e.st==='done');
    if(e.st==='done'){ cx.fillStyle='#ffd21f'; cx.font='800 7px "Big Shoulders Display",Impact,sans-serif'; cx.textAlign='center'; cx.fillText(W.L.done,e.x,e.y-(e.kind==='patient'?30:29)); }
    cx.globalAlpha=1;
  }
  function render(){
    const th=TH[S.theme]||TH.night;
    cx.setTransform(1,0,0,1,0,0); cx.clearRect(0,0,cv.width,cv.height); if(bg) cx.drawImage(bg,0,offY*sc*dpr);
    cx.setTransform(sc*dpr,0,0,sc*dpr,0,offY*sc*dpr);
    if(th.stars) for(const s of stars){ cx.globalAlpha=.35+.65*Math.abs(Math.sin(T*1.3+s.p)); cx.fillStyle='#fff'; cx.fillRect(s.x,s.y,s.s,s.s); } cx.globalAlpha=1;
    if(W.id==='fire'){ const n=clamp(6-Math.floor(units.length/2.5),0,6); for(let k=0;k<n;k++) flame(spots[k][0],spots[k][1]+3,T+k*1.7,.95); }
    const fl=Math.sin(T*23)>.94?.35:1; cx.fillStyle='#090c22'; cx.fillRect(250,116,2.4,25); rr(226,101,52,16,3); cx.fill();
    cx.globalAlpha=fl; cx.strokeStyle=W.id==='fire'?'#ffb02b':W.id==='ems'?'#2ee6c8':'#ff5fa2'; cx.lineWidth=1.2; rr(228,103,48,12,2.5); cx.stroke();
    cx.fillStyle='#fff3f8'; cx.font='800 9px "Big Shoulders Display",Impact,sans-serif'; cx.textAlign='center'; cx.fillText(W.id==='fire'?'STATION 1':W.id==='ems'?'24H CLINIC':'24H DONUTS',252,112.3); cx.globalAlpha=.16; cx.fillStyle=W.id==='fire'?'#ffb02b':W.id==='ems'?'#2ee6c8':'#ff5fa2'; cx.fillRect(220,96,64,30); cx.globalAlpha=1;
    const all=[...units,...targets].sort((a,b)=>(a.y||0)-(b.y||0));
    for(const e of all){ if(e.isT) drawTarget(e); else drawUnit(e); }
    for(const f of fx){ cx.globalAlpha=clamp(f.life*2,0,1); cx.fillStyle=f.col; cx.fillRect(f.x-1,f.y-1,2.4,2.4); } cx.globalAlpha=1;
    cx.textAlign='center'; cx.font='900 11px "Big Shoulders Display",Impact,sans-serif'; cx.lineWidth=3; cx.lineJoin='round';
    for(const p of pops){ cx.globalAlpha=clamp(p.life*2,0,1); cx.strokeStyle='rgba(5,7,20,.85)'; cx.strokeText(p.txt,p.x,p.y); cx.fillStyle=p.col; cx.fillText(p.txt,p.x,p.y); } cx.globalAlpha=1;
    if(units.length){
      const k=Math.min(units.length,14)/14,ph=Math.sin(T*(S.calm?1.5:5)),a=(.05+.09*k)*(S.calm?.4:1),lc=LC();
      const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)].join(',');
      let g=cx.createRadialGradient(0,150,2,0,150,170); g.addColorStop(0,`rgba(${rgb(lc[0])},${a*(.5+.5*ph)})`); g.addColorStop(1,`rgba(${rgb(lc[0])},0)`); cx.fillStyle=g; cx.fillRect(0,-60,W0,H0+60);
      g=cx.createRadialGradient(W0,150,2,W0,150,170); g.addColorStop(0,`rgba(${rgb(lc[1])},${a*(.5-.5*ph)})`); g.addColorStop(1,`rgba(${rgb(lc[1])},0)`); cx.fillStyle=g; cx.fillRect(0,-60,W0,H0+60);
    }
    if(th.rain){ cx.strokeStyle='rgba(170,220,255,.32)'; cx.lineWidth=.7; cx.beginPath(); for(const d of drops){ cx.moveTo(d.x,d.y); cx.lineTo(d.x-2,d.y+7); } cx.stroke(); }
    if(flashT>0){ cx.globalAlpha=flashT*.6; cx.fillStyle=flashC; cx.fillRect(0,-60,W0,H0+60); cx.globalAlpha=1; }
  }
  function frame(ts){
    const dt=Math.min(.05,(ts-last)/1000||.016); last=ts;
    const th=TH[S.theme]||TH.night; if(th.rain) for(const d of drops){ d.y+=d.v*dt; d.x-=d.v*.25*dt; if(d.y>H0){ d.y=-6; d.x=Math.random()*(W0+30); } }
    const p0=performance.now(); update(dt); const p1=performance.now(); render(); const p2=performance.now(); prof.u+=p1-p0; prof.r+=p2-p1; prof.n++;
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(wrap); resize();
  cv.addEventListener('pointerdown',e=>{ const r=cv.getBoundingClientRect(); doTap((e.clientX-r.left)/r.width*W0); });
  requestAnimationFrame(frame);
  return {tap,pop,flash:flash_,setTheme:buildBG,reset,count:()=>units.length,W:W0,prof};
})();
