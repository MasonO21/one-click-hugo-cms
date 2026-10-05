/* Browser-side art for tools/make-icons.mjs. Runs in a blank Chromium page after
   web/js/data.js and web/js/draw.js, and draws with the game's own SF.drawHero so
   the icons match the in-game crystal heroes. Every random value is seeded. */
(function () {
  const SF = window.SF;
  const NAVY = '#0b1029', CYAN = '#4fe3d3', TAU = Math.PI * 2;
  const HERO = { id: 'kaida', skin: 'kaida_solar', t: 0.98 }; // t: pose/crown phase, picked by eye
  const FONT = "'Saira Condensed', 'Arial Narrow', 'Liberation Sans Narrow', 'DejaVu Sans Condensed', sans-serif";

  function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function diamond(g, x, y, rx, ry) {
    g.beginPath(); g.moveTo(x, y - ry); g.lineTo(x + rx, y); g.lineTo(x, y + ry); g.lineTo(x - rx, y); g.closePath();
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

  // Deep navy with a soft blue bloom, faint light rays and floating shards.
  function backdrop(g, w, h, o = {}) {
    const m = Math.min(w, h), cx = w / 2, cy = h * (o.cyK || 0.46);
    g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
    const bloom = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * (o.bloomK || 0.62));
    bloom.addColorStop(0, o.flat ? '#18235a' : '#2b3c96');
    bloom.addColorStop(0.32, o.flat ? '#121a46' : '#19246a');
    bloom.addColorStop(0.7, '#0e1538');
    bloom.addColorStop(1, NAVY);
    g.fillStyle = bloom; g.fillRect(0, 0, w, h);
    if (o.rays !== false) {
      g.save(); g.translate(cx, cy); g.globalCompositeOperation = 'lighter';
      const R = rng(11);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU + R() * 0.2, wd = 0.03 + R() * 0.05, L = Math.hypot(w, h);
        const gr = g.createLinearGradient(0, 0, Math.cos(a) * L * 0.6, Math.sin(a) * L * 0.6);
        gr.addColorStop(0, 'rgba(79,227,211,0.10)'); gr.addColorStop(1, 'rgba(79,227,211,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, L, a - wd, a + wd); g.closePath(); g.fill();
      }
      g.restore();
    }
    if (o.shards !== false) {
      const R = rng(o.seed || 7), n = o.shardCount || 26;
      for (let i = 0; i < n; i++) {
        const x = R() * w, y = R() * h, d = Math.hypot((x - cx) / w, (y - cy) / h);
        const s = m * (0.012 + R() * 0.035) * (o.shardScale || 1);
        if (d < (o.clearK || 0.3)) continue;
        g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.9);
        g.globalAlpha = 0.12 + R() * 0.3;
        g.fillStyle = R() < 0.72 ? CYAN : '#d38cff';
        diamond(g, 0, 0, s * 0.5, s);
        g.fill(); g.restore();
      }
    }
  }

  // The big faceted shard frame that sits behind the hero.
  function emblem(g, cx, cy, r, o = {}) {
    const rx = r * 0.78, ry = r * 1.12;
    g.save();
    // outer glow
    g.shadowColor = 'rgba(79,227,211,0.85)'; g.shadowBlur = r * 0.22;
    diamond(g, cx, cy, rx, ry);
    const fill = g.createLinearGradient(cx, cy - ry, cx, cy + ry);
    fill.addColorStop(0, '#1d2d7a'); fill.addColorStop(0.55, '#121b52'); fill.addColorStop(1, '#0a0f2c');
    g.fillStyle = fill; g.fill();
    g.shadowBlur = 0;
    // facets
    g.save(); diamond(g, cx, cy, rx, ry); g.clip();
    const facets = [[-rx, 0, 0, -ry], [rx, 0, 0, -ry], [-rx, 0, 0, ry], [rx, 0, 0, ry]];
    facets.forEach(([x1, y1, x2, y2], i) => {
      g.beginPath(); g.moveTo(cx, cy - ry * 0.08); g.lineTo(cx + x1, cy + y1); g.lineTo(cx + x2, cy + y2); g.closePath();
      g.fillStyle = i < 2 ? 'rgba(120,200,255,0.10)' : 'rgba(0,0,0,0.16)'; g.fill();
    });
    const sheen = g.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.2, cy);
    sheen.addColorStop(0, 'rgba(255,255,255,0.16)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    g.restore();
    // rims
    g.lineJoin = 'round';
    g.lineWidth = r * 0.045; g.strokeStyle = CYAN;
    g.shadowColor = CYAN; g.shadowBlur = r * 0.08;
    diamond(g, cx, cy, rx, ry); g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = r * 0.012; g.strokeStyle = 'rgba(208,255,250,0.85)';
    diamond(g, cx, cy, rx * 0.86, ry * 0.86); g.stroke();
    // corner sparks
    if (o.sparks !== false) {
      [[0, -ry], [rx, 0], [0, ry], [-rx, 0]].forEach(([dx, dy]) => {
        g.fillStyle = '#e9fffc'; g.shadowColor = CYAN; g.shadowBlur = r * 0.06;
        diamond(g, cx + dx, cy + dy, r * 0.035, r * 0.06); g.fill();
      });
    }
    g.restore();
  }

  // Draws the hero so that its crystal body is centered on (cx, cy); h = body height in px.
  function hero(g, cx, cy, h, o = {}) {
    const sk = SF.SKIN[o.skin || HERO.skin];
    const s = h / 2.12, scale = s / 24;
    const heart = cy + s * 0.24;            // body spans heart-1.3s .. heart+0.82s
    const gy = heart + s * 1.3;             // ground point used by drawHero
    if (o.pedestal !== false) {
      const pr = s * 1.05;
      g.save();
      g.beginPath(); g.ellipse(cx, gy + s * 0.02, pr, pr * 0.32, 0, 0, TAU);
      const pg = g.createRadialGradient(cx, gy, 0, cx, gy, pr);
      pg.addColorStop(0, sk.c1 + '88'); pg.addColorStop(0.6, CYAN + '33'); pg.addColorStop(1, CYAN + '00');
      g.fillStyle = pg; g.fill();
      g.lineWidth = s * 0.035; g.strokeStyle = 'rgba(79,227,211,0.9)'; g.shadowColor = CYAN; g.shadowBlur = s * 0.2;
      g.beginPath(); g.ellipse(cx, gy + s * 0.02, pr * 0.9, pr * 0.27, 0, 0, TAU); g.stroke();
      g.restore();
    }
    // drawHero adds a sine bob; cancel it so the pose is exact.
    const t = o.t != null ? o.t : HERO.t;
    const bob = Math.sin(t * 3) * 2 * scale;
    SF.drawHero(g, { heroId: o.id || HERO.id, skinId: sk.id, x: cx, y: gy - bob, t, scale, face: { x: 1, y: 0.2 } });
  }

  function wordmark(g, x, y, size, o = {}) {
    // x,y = left/top of the block (or center when o.align === 'center'); size = cap height of SHARDFALL
    g.save();
    g.textBaseline = 'alphabetic';
    g.textAlign = o.align === 'center' ? 'center' : 'left';
    const big = size / 0.72; // Saira Condensed cap height is ~0.72em
    g.font = `italic 800 ${big}px ${FONT}`;
    g.letterSpacing = (big * 0.01) + 'px';
    const base = y + size;
    const grad = g.createLinearGradient(0, y, 0, base);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#bff3ff');
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = size * 0.08; g.shadowOffsetY = size * 0.04;
    g.fillStyle = grad; g.fillText('SHARDFALL', x, base);
    const wBig = g.measureText('SHARDFALL').width;
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    // ARENA row with cyan rules on both sides
    const small = size * 0.36, sb = small / 0.72;
    g.font = `italic 800 ${sb}px ${FONT}`;
    g.letterSpacing = (sb * 0.42) + 'px';
    const aw = g.measureText('ARENA').width - sb * 0.42;
    const rowY = base + size * 0.24 + small;
    const left = o.align === 'center' ? x - wBig / 2 : x, right = left + wBig;
    const mid = (left + right) / 2;
    g.textAlign = 'center';
    g.fillStyle = CYAN; g.shadowColor = CYAN; g.shadowBlur = size * 0.12;
    g.fillText('ARENA', mid + sb * 0.21, rowY);
    g.shadowBlur = 0;
    const gap = size * 0.18, ly = rowY - small * 0.5, lw = Math.max(2, size * 0.03);
    g.fillStyle = CYAN;
    g.fillRect(left + size * 0.04, ly - lw / 2, mid - aw / 2 - gap - left - size * 0.04, lw);
    g.fillRect(mid + aw / 2 + gap, ly - lw / 2, right - (mid + aw / 2 + gap) - size * 0.04, lw);
    g.restore();
    return { width: wBig, height: rowY - y };
  }

  // ---- composed assets -------------------------------------------------------
  // Full-bleed square icon (iOS, Play Store, apple-touch, maskable). `safe` shrinks
  // the art toward the center (maskable icons keep content in the inner 80%).
  function icon(g, S, o = {}) {
    const k = o.safe || 1;
    backdrop(g, S, S, { seed: 7, shardCount: 30, clearK: 0.34 });
    g.save(); g.translate(S / 2, S / 2); g.scale(k, k); g.translate(-S / 2, -S / 2);
    emblem(g, S * 0.5, S * 0.5, S * 0.36);
    hero(g, S * 0.485, S * 0.47, S * 0.5);
    g.restore();
  }
  // Rounded-square icon with transparent corners (PWA "any" icons, Android legacy).
  function roundedIcon(g, S, o = {}) {
    const pad = S * (o.pad != null ? o.pad : 0.04), r = (S - pad * 2) * (o.round ? 0.5 : 0.22);
    g.save(); rrect(g, pad, pad, S - pad * 2, S - pad * 2, r); g.clip();
    icon(g, S);
    g.restore();
    g.save(); rrect(g, pad, pad, S - pad * 2, S - pad * 2, r);
    g.lineWidth = Math.max(1, S * 0.008); g.strokeStyle = 'rgba(79,227,211,0.55)'; g.stroke();
    g.restore();
  }
  // Tiny sizes: drop the busy background, keep a bold crystal on navy.
  function favicon(g, S) {
    g.save(); rrect(g, 0, 0, S, S, S * 0.22); g.clip();
    backdrop(g, S, S, { rays: false, shards: false });
    emblem(g, S * 0.5, S * 0.5, S * 0.4, { sparks: false });
    hero(g, S * 0.5, S * 0.48, S * 0.62, { pedestal: false });
    g.restore();
  }
  // Android adaptive icon layers (108dp canvas; the inner 66dp circle is always visible).
  function adaptiveBackground(g, S) {
    backdrop(g, S, S, { seed: 3, shardCount: 22, clearK: 0.28, shardScale: 1.2 });
    emblem(g, S * 0.5, S * 0.5, S * 0.27);
  }
  function adaptiveForeground(g, S) {
    hero(g, S * 0.49, S * 0.47, S * 0.34);
  }
  // Themed (monochrome) icon for Android 13+: a solid silhouette of the foreground.
  function adaptiveMonochrome(g, S) {
    adaptiveForeground(g, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a > 150 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
  }
  // Splash / feature graphic: hero emblem + wordmark lockup centered on navy.
  function splash(g, W, H, o = {}) {
    backdrop(g, W, H, { flat: true, rays: false, shards: o.shards === true, bloomK: 0.42, clearK: 0.42, seed: 5, shardCount: 18 });
    const portrait = H > W * 1.15;
    if (portrait) {
      const L = Math.min(W * 0.6, H * 0.28);
      emblem(g, W / 2, H / 2 - L * 0.42, L * 0.5);
      hero(g, W / 2, H / 2 - L * 0.46, L * 0.68);
      wordmark(g, W / 2, H / 2 + L * 0.36, L * 0.36, { align: 'center' });
    } else {
      // Measure the wordmark so the emblem + text lockup always fits inside the frame.
      const textWidth = L => { g.save(); const b = L * 0.42 / 0.72; g.font = `italic 800 ${b}px ${FONT}`; g.letterSpacing = (b * 0.01) + 'px'; const w = g.measureText('SHARDFALL').width; g.restore(); return w; };
      let L = o.L || H * (o.hK || 0.4);
      let total = L * 1.18 + textWidth(L);
      if (total > W * 0.86) { L *= W * 0.86 / total; total = L * 1.18 + textWidth(L); }
      const left = W / 2 - total / 2;
      emblem(g, left + L * 0.5, H / 2, L * 0.5);
      hero(g, left + L * 0.49, H / 2 - L * 0.03, L * 0.68);
      wordmark(g, left + L * 1.18, H / 2 - L * 0.36, L * 0.42);
    }
  }

  window.ART = { icon, roundedIcon, favicon, adaptiveBackground, adaptiveForeground, adaptiveMonochrome, splash };
})();
