/*
 * Rainkeep: graphics quality. Three tiers for the 3D keep and the Dunes, picked for the device on first run (Auto)
 * or set in Settings:
 *   High      up to 2x pixels, antialiasing, soft shadows from everything, the whole crowd
 *   Balanced  1.5x pixels, no antialiasing, shadows from the buildings and the wyrm only, two thirds of the crowd
 *   Low       1x pixels, no shadows, a third of the crowd in drawn figures instead of painted models, 30 frames a second
 * Auto starts from what the device says about itself (memory, cores, GPU) and, if the keep still runs below about
 * 24 frames a second for a while, steps down a tier and remembers it. Antialiasing is fixed when the renderer is
 * made, so a change to it applies the next time the game opens; everything else applies at once.
 * The keep (town3d.js) and the Dunes (world3d.js) read the tier through KH.gfx and listen for changes with KH.gfx.on.
 */
'use strict';
(function () {
  const KH = window.KH;
  const TIERS = {
    high: { id: 'high', name: 'High', dpr: 2, aa: true, shadow: 2048, peopleShadow: true, crowd: 1, painted: true, fps: 60 },
    mid: { id: 'mid', name: 'Balanced', dpr: 1.5, aa: false, shadow: 1024, peopleShadow: false, crowd: 0.65, painted: true, fps: 60 },
    low: { id: 'low', name: 'Low', dpr: 1, aa: false, shadow: 0, peopleShadow: false, crowd: 0.35, painted: false, fps: 30 },
  };
  const ORDER = ['low', 'mid', 'high'];
  let S = null, detected = null, madeWithAA = null;
  const listeners = [];
  KH.hooks.defaults.push((s) => { s.settings.gfx = 'auto'; s.settings.gfxAuto = null; });
  KH.hooks.boot.push(() => { S = KH.S; });

  // what the device says about itself; automated browsers (tests, store screenshots) keep High so what they see
  // doesn't depend on the machine they run on
  function detect() {
    if (detected) return detected;
    const n = navigator, mem = n.deviceMemory || 0, cores = n.hardwareConcurrency || 0;
    const mobile = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    let gpu = '';
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : (gl ? String(gl.getParameter(gl.RENDERER)) : '');
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) { /* no WebGL: the 2D renderer plays */ }
    let tier = mobile ? 'mid' : 'high';
    if (/Mali-(4\d\d|T\d)|Adreno \(TM\) [2-5]\d\d|PowerVR|SGX|Vivante|GC\d{3,4}/i.test(gpu)) tier = 'low';
    else if (/Mali-G(31|51|52|57|68|71|72|76)\b|Adreno \(TM\) 6[0-4]\d/i.test(gpu)) tier = 'mid';
    else if (/Apple|Adreno \(TM\) (6[5-9]\d|[7-9]\d\d)|Mali-G(7[7-9]|[89]\d\d|7\d\d)|Immortalis|Xclipse/i.test(gpu)) tier = 'high';
    else if (/SwiftShader|llvmpipe|Software/i.test(gpu)) tier = 'low';
    if (mem && mem <= 2) tier = 'low';
    else if (mem && mem <= 4 && tier === 'high') tier = 'mid';
    if (mobile && cores && cores <= 4 && tier === 'high') tier = 'mid';
    if (n.webdriver) tier = 'high';
    detected = { tier, gpu: gpu.slice(0, 80), mem, cores, mobile };
    return detected;
  }
  const settingOf = () => (S && S.settings.gfx) || 'auto';
  const autoTier = () => (S && S.settings.gfxAuto) || detect().tier;
  const tierId = () => { const s = settingOf(); return TIERS[s] ? s : autoTier(); };
  const tier = () => TIERS[tierId()];
  const apply = () => listeners.forEach((f) => { try { f(tier()); } catch (e) { /* a scene not built yet */ } });

  // Auto's watch on the keep: after a few seconds of steady drawing, a median frame slower than ~24 fps steps the
  // tier down for good (at most to Low). Automated browsers never step down.
  const win = [], ring = [];
  let watched = 0, stepped = 0;
  function frame(ms) {
    // the last few hundred frame times, for the playtest report (playtest.js)
    if (ms > 0 && ms < 1000) { ring.push(ms); if (ring.length > 300) ring.shift(); }
    if (settingOf() !== 'auto' || navigator.webdriver || stepped >= 2 || !(ms > 0) || ms > 1000) return;
    watched += ms;
    if (watched < 6000) return; // the first seconds load models and warm shaders
    win.push(ms);
    if (win.length < 150) return;
    const s = win.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    win.length = 0;
    const i = ORDER.indexOf(tierId());
    if (med > 42 && i > 0) {
      S.settings.gfxAuto = ORDER[i - 1];
      stepped++;
      watched = 0;
      apply();
    }
  }

  KH.gfx = {
    TIERS,
    tier,
    setting: settingOf,
    detect,
    // the pixel ratio a renderer should use now
    dpr: () => Math.min(tier().dpr, window.devicePixelRatio || 1),
    // whether a renderer made now should antialias; remembers what the first one was made with
    aa: () => { if (madeWithAA == null) madeWithAA = tier().aa; return madeWithAA; },
    on: (f) => { listeners.push(f); },
    frame,
    set(v) {
      if (!S || !(v === 'auto' || TIERS[v])) return;
      S.settings.gfx = v;
      if (v === 'auto') S.settings.gfxAuto = null;
      stepped = 0; watched = 0; win.length = 0;
      apply();
      const aaNow = tier().aa;
      if (madeWithAA != null && aaNow !== madeWithAA) KH.toast(`Graphics: ${tier().name}. Edge smoothing changes the next time the game opens.`, 'good');
      else KH.toast(`Graphics: ${tier().name}.`, 'good');
    },
    info: () => ({ setting: settingOf(), tier: tierId(), auto: S ? S.settings.gfxAuto : null, device: detect(), stepped }),
    // the keep's median frames per second lately (null until it has drawn a while)
    fps: () => { if (ring.length < 60) return null; const s2 = ring.slice().sort((a, b) => a - b); return Math.round(1000 / s2[s2.length >> 1]); },
  };

  KH.ACT.gfx = (v) => { KH.gfx.set(v); };
  // the control in Settings (ui.js): Auto shows the tier it chose
  KH.gfxRow = () => {
    const cur = settingOf();
    const opt = (v, label) => `<button class="${cur === v ? 'on' : ''}" data-act="gfx" data-arg="${v}" aria-pressed="${cur === v}">${label}</button>`;
    return `<div class="fm gfx-row"><span class="fm-lbl">Graphics</span><div class="seg gfx-seg">${opt('auto', `Auto${cur === 'auto' ? ` · ${TIERS[autoTier()].name}` : ''}`)}${opt('high', 'High')}${opt('mid', 'Balanced')}${opt('low', 'Low')}</div>
      <div class="muted small fm-tip">${cur === 'auto' ? 'Picked for this device, and lowered by itself if the keep runs slowly.' : tier().id === 'low' ? 'Fewer, simpler figures, no shadows and 30 frames a second: easiest on the battery.' : tier().id === 'mid' ? 'Sharp enough for most phones, with fewer shadows and a smaller crowd.' : 'Full resolution, edge smoothing and every shadow.'}</div></div>`;
  };
})();
