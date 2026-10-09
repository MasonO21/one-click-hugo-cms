/**
 * The cache scene's particle layer: one 2D canvas over the stage, a fixed pool of particles in typed arrays (no
 * allocation per frame) and small sprites painted once per quality level. Each cache tier has its own material:
 *
 *  - Supply Cache (and inventory crates): curled wood shavings, warm sparks and a puff of dust;
 *  - Explorer's Case: blue sparks and drifting blue light motes;
 *  - Prospector's Vault: gold sparks, ore nuggets and bright glints;
 *  - Ancient Relic: violet glyph motes and crystal shards;
 *  - Nova Core: starlight, stardust and expanding energy rings.
 *
 * Sparks are drawn stretched along their velocity (a real streak, not a dot); rings expand and fade in place; dust
 * swells and thins. Low quality and reduced motion scale every count down (reduced motion also drops the ambience).
 * The loop runs on requestAnimationFrame only while the scene is up (`start` / `stop`).
 */

export type FxTheme = 'supply' | 'explorer' | 'prospector' | 'relic' | 'nova' | 'crate';

/** How a sprite moves and is drawn. */
const Motion = {
  /** Shavings: light gravity, sway, tumble (a fake 3D flip). */
  Flutter: 0,
  /** Motes, glyphs, stardust: drift up, sway, pulse. */
  Float: 1,
  /** Glints and stars: pop out, slow down, twinkle. */
  Twinkle: 2,
  /** Ore and crystal shards: fly, spin, fall. */
  Shard: 3,
  /** Shooting stars: straight and fast, drawn along their path. */
  Streak: 4,
  /** Sparks: fast, arcing under gravity, stretched along their velocity, cooling as they go. */
  Spark: 5,
  /** Energy rings: stay put, expand, fade. */
  Ring: 6,
  /** Dust and mist: swell, rise a little, thin out. */
  Puff: 7,
} as const;
type Motion = (typeof Motion)[keyof typeof Motion];

interface KindSpec {
  motion: Motion;
  /** Additive blending (light). */
  add: boolean;
  /** Base size (px at a 400 px wide stage). */
  size: number;
  /** Burst speed factor. */
  speed: number;
  /** Life (s). */
  life: number;
  colors: string[];
  /** Painted variants per colour (glyph shapes). */
  variants?: number;
}

const KINDS: Record<string, KindSpec> = {
  shaving: { motion: Motion.Flutter, add: false, size: 22, speed: 0.95, life: 2.3, colors: ['#d9ac6c', '#c8934f', '#b07a3e', '#e6c38c'], variants: 2 },
  ember: { motion: Motion.Spark, add: true, size: 12, speed: 1.2, life: 1.2, colors: ['#ffb25a', '#ffd68a', '#ff8f45'] },
  dust: { motion: Motion.Puff, add: false, size: 64, speed: 0.22, life: 1.2, colors: ['#d8c6a2', '#c9b48c'] },
  mistb: { motion: Motion.Puff, add: false, size: 64, speed: 0.22, life: 1.2, colors: ['#9fb8d6', '#b8cce2'] },
  mistv: { motion: Motion.Puff, add: false, size: 64, speed: 0.22, life: 1.2, colors: ['#b4a2d6', '#a594c8'] },
  mistn: { motion: Motion.Puff, add: false, size: 64, speed: 0.22, life: 1.2, colors: ['#c4bce6', '#d6cdf0'] },
  mote: { motion: Motion.Float, add: true, size: 20, speed: 0.3, life: 3, colors: ['#ffe2a6', '#fff0cc'] },
  bspark: { motion: Motion.Spark, add: true, size: 12, speed: 1.3, life: 1.1, colors: ['#8ccdff', '#d2ecff', '#5aa6ee'] },
  bmote: { motion: Motion.Float, add: true, size: 22, speed: 0.35, life: 2.6, colors: ['#78c0ff', '#bde2ff'] },
  gspark: { motion: Motion.Spark, add: true, size: 12, speed: 1.25, life: 1.2, colors: ['#ffd36a', '#ffeaa8', '#f0a63a'] },
  glint: { motion: Motion.Twinkle, add: true, size: 24, speed: 0.75, life: 1.2, colors: ['#fff4d2', '#ffe08c'] },
  ore: { motion: Motion.Shard, add: false, size: 13, speed: 0.95, life: 1.9, colors: ['#d9a441', '#c4882c', '#e9c46c'] },
  glyph: { motion: Motion.Float, add: true, size: 19, speed: 0.42, life: 2.7, colors: ['#c5a4ff', '#a98ae8', '#92e2de'], variants: 4 },
  shard: { motion: Motion.Shard, add: false, size: 17, speed: 1, life: 2, colors: ['#b39ae6', '#8ed6da', '#d4c4f2', '#7c6ad0'] },
  vspark: { motion: Motion.Spark, add: true, size: 12, speed: 1.15, life: 1.1, colors: ['#c8a6ff', '#e8daff'] },
  nspark: { motion: Motion.Spark, add: true, size: 11, speed: 1.35, life: 1, colors: ['#fff2d8', '#d9e6ff'] },
  star: { motion: Motion.Twinkle, add: true, size: 26, speed: 0.85, life: 1.6, colors: ['#fff8e8', '#e4eeff', '#ffe6b4'] },
  stardust: { motion: Motion.Float, add: true, size: 15, speed: 0.5, life: 2.6, colors: ['#f0e6ff', '#cddfff', '#fff0d0'] },
  ring: { motion: Motion.Ring, add: true, size: 300, speed: 0, life: 1.15, colors: ['#ffe6b8', '#bfe0ff', '#d8c4ff'] },
  streak: { motion: Motion.Streak, add: true, size: 56, speed: 1, life: 1.4, colors: ['#fff4e0'] },
};

type Mix = [string, number][];

interface ThemeFx {
  /** The burst when it opens: [kind, weight]. */
  burst: Mix;
  /** Drifting ambience: [kind, per second at full quality]. */
  ambient: Mix;
  /** Where it lands. */
  land: string;
  /** Light leaking from the seam while it charges. */
  seam: string;
  /** Energy rings in the burst. */
  rings: number;
}

const THEMES: Record<FxTheme, ThemeFx> = {
  supply: { burst: [['shaving', 5], ['ember', 4.5], ['dust', 0.8]], ambient: [['mote', 1.3]], land: 'dust', seam: 'ember', rings: 0 },
  crate: { burst: [['shaving', 4.5], ['ember', 3.5], ['dust', 1.2]], ambient: [['mote', 0.9]], land: 'dust', seam: 'ember', rings: 0 },
  explorer: { burst: [['bspark', 6], ['bmote', 2.6], ['star', 0.6]], ambient: [['bmote', 2.1]], land: 'mistb', seam: 'bspark', rings: 0 },
  prospector: { burst: [['gspark', 6], ['ore', 2.8], ['glint', 1.8]], ambient: [['mote', 1.8], ['glint', 0.25]], land: 'dust', seam: 'gspark', rings: 0 },
  relic: { burst: [['shard', 4.5], ['glyph', 3.2], ['vspark', 2.4]], ambient: [['glyph', 0.9]], land: 'mistv', seam: 'vspark', rings: 0 },
  nova: { burst: [['star', 3.4], ['stardust', 3.2], ['nspark', 2.6]], ambient: [['stardust', 2.6], ['streak', 0.28]], land: 'mistn', seam: 'nspark', rings: 3 },
};

/** A card's reveal, by rarity: [kind, count at full quality]. */
const REVEAL: Record<string, Mix> = {
  common: [['glint', 4]],
  rare: [['bspark', 9], ['glint', 2]],
  epic: [['vspark', 12], ['glint', 3]],
  legendary: [['gspark', 18], ['glint', 6]],
  mythic: [['star', 10], ['nspark', 14], ['stardust', 8]],
};

const MAX = 340;
const TAU = Math.PI * 2;

function makeCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Soft glow dot with a hot core (sparks, motes). */
function glowDot(g: CanvasRenderingContext2D, r: number, color: string, core: number): void {
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(core, color);
  grad.addColorStop(Math.min(0.9, core + 0.25), color + '55');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(-r, -r, r * 2, r * 2);
}

/** A thin four-point flare (glints, stars); `diag` adds four shorter diagonal rays. */
function flare(g: CanvasRenderingContext2D, r: number, color: string, diag: boolean): void {
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
  glow.addColorStop(0, color);
  glow.addColorStop(1, color + '00');
  g.fillStyle = glow;
  g.fillRect(-r, -r, r * 2, r * 2);
  const ray = (len: number, wid: number, a: number) => {
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, -len);
    g.quadraticCurveTo(wid, 0, 0, len);
    g.quadraticCurveTo(-wid, 0, 0, -len);
    g.fill();
    g.restore();
  };
  g.fillStyle = '#ffffff';
  ray(r, r * 0.07, 0);
  ray(r * 0.78, r * 0.07, Math.PI / 2);
  if (diag) {
    g.globalAlpha = 0.65;
    ray(r * 0.42, r * 0.05, Math.PI / 4);
    ray(r * 0.42, r * 0.05, -Math.PI / 4);
    g.globalAlpha = 1;
  }
}

/** Paint one sprite, centred in a `size` square (wider for streaks). */
function paint(kind: string, color: string, size: number, variant: number): HTMLCanvasElement {
  const wide = kind === 'streak';
  const [c, g] = makeCanvas(wide ? size * 2 : size, size);
  g.translate(c.width / 2, size / 2);
  const r = size * 0.44;
  switch (kind) {
    case 'shaving': {
      // a curl of planed wood: a ribbon wound into a loose spiral, its darker underside showing at the turns
      const spiral = (r0: number, r1: number, turns: number) => {
        g.beginPath();
        for (let i = 0; i <= 28; i++) {
          const t = i / 28;
          const a = t * turns * TAU - 0.6;
          const rr = r0 + (r1 - r0) * t;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * 0.82;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      };
      // two shapes: a loose curl and a tighter one (never a neat swirl)
      const turns = variant ? 1.05 : 0.78;
      const r0 = variant ? r * 0.3 : r * 0.42;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(96, 54, 20, 0.9)';
      g.lineWidth = size * 0.24;
      spiral(r0, r * 0.84, turns);
      g.strokeStyle = color;
      g.lineWidth = size * 0.17;
      spiral(r0, r * 0.84, turns);
      g.strokeStyle = 'rgba(255, 236, 200, 0.45)';
      g.lineWidth = size * 0.04;
      spiral(r0 + r * 0.06, r * 0.9, turns);
      break;
    }
    case 'ember':
    case 'bspark':
    case 'gspark':
    case 'vspark':
    case 'nspark':
      glowDot(g, r, color, 0.22);
      break;
    case 'mote':
    case 'bmote':
    case 'stardust':
      glowDot(g, r, color, 0.14);
      break;
    case 'dust':
    case 'mistb':
    case 'mistv':
    case 'mistn': {
      // a soft cloud: three overlapping blobs
      g.globalAlpha = 0.5;
      for (const [x, y, k] of [[-0.25, 0.08, 0.62], [0.22, 0.05, 0.58], [0, -0.14, 0.66]] as const) {
        const grad = g.createRadialGradient(x * r, y * r, 0, x * r, y * r, r * k);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '00');
        g.fillStyle = grad;
        g.fillRect(-r, -r, r * 2, r * 2);
      }
      break;
    }
    case 'glint':
      flare(g, r, color, false);
      break;
    case 'star':
      flare(g, r, color, true);
      break;
    case 'ore': {
      // a faceted nugget with a lit face
      const pts = [[-0.7, -0.15], [-0.35, -0.7], [0.35, -0.62], [0.75, -0.05], [0.45, 0.6], [-0.4, 0.62]];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r)));
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.strokeStyle = 'rgba(80, 46, 10, 0.55)';
      g.lineWidth = size * 0.04;
      g.stroke();
      g.beginPath();
      g.moveTo(-0.35 * r, -0.7 * r);
      g.lineTo(0.35 * r, -0.62 * r);
      g.lineTo(0.1 * r, -0.05 * r);
      g.lineTo(-0.7 * r, -0.15 * r);
      g.closePath();
      g.fillStyle = 'rgba(255, 246, 214, 0.65)';
      g.fill();
      break;
    }
    case 'glyph': {
      // a glowing alien rune: four simple shapes
      g.shadowColor = color;
      g.shadowBlur = size * 0.2;
      g.strokeStyle = '#f6efff';
      g.lineWidth = size * 0.065;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const k = r * 0.62;
      g.beginPath();
      if (variant === 0) {
        g.arc(0, 0, k, 0, TAU);
        g.moveTo(0, -k * 1.25);
        g.lineTo(0, k * 1.25);
      } else if (variant === 1) {
        g.moveTo(0, -k);
        g.lineTo(k * 0.9, k * 0.6);
        g.lineTo(-k * 0.9, k * 0.6);
        g.closePath();
        g.moveTo(0, -k * 0.1);
        g.lineTo(0, k * 0.35);
      } else if (variant === 2) {
        g.arc(-k * 0.35, 0, k * 0.55, -Math.PI / 2, Math.PI / 2);
        g.moveTo(k * 0.35, -k * 0.9);
        g.arc(k * 0.35, 0, k * 0.55, -Math.PI / 2, Math.PI / 2, true);
        g.moveTo(-k, k);
        g.lineTo(k, k);
      } else {
        g.moveTo(0, -k);
        g.lineTo(k, 0);
        g.lineTo(0, k);
        g.lineTo(-k, 0);
        g.closePath();
        g.moveTo(-k * 0.45, -k * 0.45);
        g.lineTo(k * 0.45, k * 0.45);
      }
      g.stroke();
      g.shadowBlur = 0;
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = color + '88';
      g.fillRect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'shard': {
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.36, -r * 0.3);
      g.lineTo(r * 0.24, r * 0.85);
      g.lineTo(-r * 0.24, r * 0.85);
      g.lineTo(-r * 0.36, -r * 0.3);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.36, -r * 0.3);
      g.lineTo(0, r * 0.85);
      g.closePath();
      g.fillStyle = 'rgba(255, 255, 255, 0.4)';
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      g.lineWidth = size * 0.025;
      g.stroke();
      break;
    }
    case 'ring': {
      g.shadowColor = color;
      g.shadowBlur = size * 0.05;
      g.strokeStyle = color;
      g.lineWidth = size * 0.018;
      g.beginPath();
      g.arc(0, 0, r * 0.94, 0, TAU);
      g.stroke();
      g.globalAlpha = 0.35;
      g.lineWidth = size * 0.06;
      g.beginPath();
      g.arc(0, 0, r * 0.88, 0, TAU);
      g.stroke();
      break;
    }
    case 'streak': {
      const m = size;
      const grad = g.createLinearGradient(-m, 0, m, 0);
      grad.addColorStop(0, color + '00');
      grad.addColorStop(0.75, color + '99');
      grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-m, 0);
      g.lineTo(m * 0.9, -size * 0.04);
      g.arc(m * 0.9, 0, size * 0.04, -Math.PI / 2, Math.PI / 2);
      g.closePath();
      g.fill();
      break;
    }
  }
  return c;
}

interface Sprite {
  img: HTMLCanvasElement;
  motion: Motion;
  add: boolean;
  /** The sprite's design size (px, before dpr): what `size` is measured against. */
  base: number;
}

export class ChestFx {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private sprites: Sprite[] = [];
  /** Sprite indices by kind. */
  private byKind = new Map<string, number[]>();
  private theme: FxTheme = 'supply';
  private w = 1;
  private hgt = 1;
  private dpr = 1;
  /** Particle count multiplier (quality / reduced motion). */
  private amount = 1;
  private ambientOn = true;
  private ambAcc: number[] = [];

  // particle pool (struct of arrays)
  private n = 0;
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  /** Seconds lived (negative: not born yet, a staggered ring). */
  private readonly life = new Float32Array(MAX);
  private readonly max = new Float32Array(MAX);
  private readonly rot = new Float32Array(MAX);
  private readonly vr = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly ph = new Float32Array(MAX);
  private readonly spr = new Uint16Array(MAX);
  /** Fade in over the first part of its life (ambient particles appear softly). */
  private readonly soft = new Uint8Array(MAX);

  private raf = 0;
  private last = 0;
  private running = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cs-fx';
    this.g = this.canvas.getContext('2d');
  }

  /** Quality: `amount` scales every count (1 = high); `ambient` keeps the gentle drifting particles. */
  configure(amount: number, ambient: boolean, dprCap: number): void {
    this.amount = Math.max(0.1, amount);
    this.ambientOn = ambient;
    const dpr = Math.min(dprCap, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    if (dpr !== this.dpr || !this.sprites.length) {
      this.dpr = dpr;
      this.paintSprites();
    }
  }

  setTheme(theme: FxTheme): void {
    this.theme = THEMES[theme] ? theme : 'supply';
    this.ambAcc = THEMES[this.theme].ambient.map(() => 0);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.hgt = Math.max(1, h);
    const cw = Math.round(this.w * this.dpr);
    const ch = Math.round(this.hgt * this.dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
  }

  private paintSprites(): void {
    this.sprites = [];
    this.byKind.clear();
    for (const [kind, spec] of Object.entries(KINDS)) {
      const ids: number[] = [];
      // rings are big on screen: paint them big so they stay crisp
      const base = spec.motion === Motion.Ring ? 160 : spec.motion === Motion.Puff ? 64 : 40;
      const px = Math.round(base * this.dpr);
      for (const col of spec.colors) {
        for (let v = 0; v < (spec.variants ?? 1); v++) {
          ids.push(this.sprites.length);
          this.sprites.push({ img: paint(kind, col, px, v), motion: spec.motion, add: spec.add, base });
        }
      }
      this.byKind.set(kind, ids);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.n = 0;
    this.g?.setTransform(1, 0, 0, 1, 0, 0);
    this.g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Remove every particle (a new cache drops in). */
  clear(): void {
    this.n = 0;
  }

  private get s(): number {
    return Math.min(this.w, this.hgt) / 400;
  }

  private pickKind(mix: Mix): string {
    let total = 0;
    for (const [, w] of mix) total += w;
    let r = Math.random() * total;
    for (const [k, w] of mix) {
      r -= w;
      if (r <= 0) return k;
    }
    return mix[mix.length - 1][0];
  }

  private spawn(kind: string, x: number, y: number, vx: number, vy: number, size: number, life: number, soft = false, delay = 0): void {
    if (this.n >= MAX) return;
    const ids = this.byKind.get(kind);
    const spec = KINDS[kind];
    if (!ids || !ids.length || !spec) return;
    const i = this.n++;
    const m = spec.motion;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = -delay;
    this.max[i] = life;
    this.rot[i] = m === Motion.Streak ? Math.atan2(vy, vx) : m === Motion.Ring || m === Motion.Spark ? 0 : Math.random() * TAU;
    this.vr[i] = m === Motion.Streak || m === Motion.Ring || m === Motion.Spark ? 0 : (Math.random() - 0.5) * (m === Motion.Shard ? 9 : m === Motion.Flutter ? 6 : 1.6);
    this.size[i] = size;
    this.ph[i] = Math.random() * TAU;
    this.spr[i] = ids[Math.floor(Math.random() * ids.length)];
    this.soft[i] = soft ? 1 : 0;
  }

  /** One particle of `kind` thrown from (x, y) at angle `a` (radians) with the kind's own speed, size and life. */
  private throw(kind: string, x: number, y: number, a: number, speed: number, sizeK = 1): void {
    const spec = KINDS[kind];
    if (!spec) return;
    const s = this.s;
    const sp = speed * spec.speed * s;
    const size = spec.size * s * sizeK * (0.7 + Math.random() * 0.6);
    this.spawn(kind, x, y, Math.cos(a) * sp, Math.sin(a) * sp, size, spec.life * (0.75 + Math.random() * 0.5));
  }

  /**
   * The big moment: the cache's own material fountains out of its mouth at (x, y). `power` ~1 for a cache (rarer
   * tiers a little more), ~0.6 for a crate.
   */
  burst(x: number, y: number, power = 1): void {
    const t = THEMES[this.theme];
    const count = Math.round(120 * power * this.amount);
    const s = this.s;
    for (let i = 0; i < count; i++) {
      const kind = this.pickKind(t.burst);
      const m = KINDS[kind].motion;
      const spread = m === Motion.Spark ? 2.7 : m === Motion.Puff ? 3.2 : 2.3;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = m === Motion.Puff ? 120 + Math.random() * 120 : (230 + Math.random() * 430) * (0.75 + 0.35 * power);
      this.throw(kind, x + (Math.random() - 0.5) * 34 * s, y + (Math.random() - 0.5) * 10 * s, a, speed);
    }
    if (t.rings) this.rings(x, y, t.rings * (this.amount < 0.5 ? 0.67 : 1));
  }

  /** Energy rings expanding from (x, y), staggered. */
  rings(x: number, y: number, count: number, scale = 1): void {
    const n = Math.max(1, Math.round(count));
    const s = this.s;
    for (let i = 0; i < n; i++) this.spawn('ring', x, y, 0, 0, KINDS.ring.size * s * scale * (1 - i * 0.12), KINDS.ring.life + i * 0.1, false, i * 0.16);
  }

  /** It lands: a low cloud of dust (or mist) rolling out to both sides of its feet. */
  land(x: number, y: number, width: number): void {
    const kind = THEMES[this.theme].land;
    const count = Math.round(14 * this.amount);
    const s = this.s;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const sp = (50 + Math.random() * 110) * s;
      const px = x + side * (0.15 + Math.random() * 0.3) * width;
      this.spawn(kind, px, y - Math.random() * 6 * s, side * sp, -(8 + Math.random() * 26) * s, KINDS[kind].size * s * (0.6 + Math.random() * 0.6), 0.9 + Math.random() * 0.6);
    }
  }

  /** Light leaking out of the lid's seam on a charging tap: a spray of the tier's sparks. */
  seam(x: number, y: number, width: number, strength: number): void {
    const kind = THEMES[this.theme].seam;
    const count = Math.round((5 + strength * 10) * this.amount);
    const s = this.s;
    for (let i = 0; i < count; i++) {
      const px = x + (Math.random() - 0.5) * width;
      const side = px < x ? -1 : 1;
      const a = -Math.PI / 2 + side * (0.35 + Math.random() * 0.9);
      this.spawn(kind, px, y, Math.cos(a) * (120 + Math.random() * 160) * s * (0.6 + strength), Math.sin(a) * (120 + Math.random() * 160) * s * (0.6 + strength), KINDS[kind].size * s * (0.8 + strength * 0.4), 0.45 + Math.random() * 0.35);
    }
  }

  /** A card turns over: a small crown of light in its rarity's colour (bigger for rarer cards). */
  card(x: number, y: number, rarity: string, scale = 1): void {
    const mix = REVEAL[rarity] ?? REVEAL.common;
    for (const [kind, n] of mix) {
      const count = Math.round(n * scale * this.amount);
      for (let i = 0; i < count; i++) {
        const a = (i / Math.max(1, count)) * TAU + Math.random() * 0.5;
        this.throw(kind, x, y, a, 150 + Math.random() * 170, 0.85);
      }
    }
    if (rarity === 'mythic') this.rings(x, y, 1, 0.55);
  }

  private ambient(dt: number): void {
    if (!this.ambientOn) return;
    const list = THEMES[this.theme].ambient;
    const s = this.s;
    for (let j = 0; j < list.length; j++) {
      const [kind, rate] = list[j];
      this.ambAcc[j] = (this.ambAcc[j] ?? 0) + dt * rate * this.amount;
      while (this.ambAcc[j] >= 1) {
        this.ambAcc[j] -= 1;
        const spec = KINDS[kind];
        if (spec.motion === Motion.Streak) {
          // a shooting star across the upper sky
          const fromLeft = Math.random() < 0.5;
          const sp = (360 + Math.random() * 180) * s;
          this.spawn(kind, fromLeft ? -30 : this.w + 30, this.hgt * (0.05 + Math.random() * 0.25), (fromLeft ? 1 : -1) * sp, sp * 0.32, spec.size * s, 1.7);
        } else {
          // rising softly from the lower two thirds
          const size = spec.size * s * (0.55 + Math.random() * 0.7) * (spec.motion === Motion.Twinkle ? 0.7 : 1);
          this.spawn(kind, Math.random() * this.w, this.hgt * (0.35 + Math.random() * 0.65), (Math.random() - 0.5) * 18 * s, -(10 + Math.random() * 22) * s, size, 4 + Math.random() * 3, true);
        }
      }
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.ambient(dt);
    this.step(dt);
    this.draw();
  };

  private step(dt: number): void {
    const s = this.s;
    let i = 0;
    while (i < this.n) {
      const life = (this.life[i] += dt);
      if (life >= this.max[i] || this.y[i] > this.hgt + 80) {
        this.kill(i);
        continue;
      }
      if (life < 0) {
        i++;
        continue;
      }
      let g = 0;
      let drag = 0;
      switch (this.sprites[this.spr[i]].motion) {
        case Motion.Flutter:
          g = 95 * s;
          drag = 1.7;
          this.vx[i] += Math.sin(life * 3 + this.ph[i]) * 70 * s * dt;
          break;
        case Motion.Float:
          g = -8 * s;
          drag = 1.2;
          this.vx[i] += Math.sin(life * 1.5 + this.ph[i]) * 14 * s * dt;
          break;
        case Motion.Twinkle:
          g = 30 * s;
          drag = 2.6;
          break;
        case Motion.Shard:
          g = 330 * s;
          drag = 0.6;
          break;
        case Motion.Spark:
          g = 260 * s;
          drag = 1.25;
          break;
        case Motion.Puff:
          g = -10 * s;
          drag = 2.2;
          break;
        case Motion.Ring:
        case Motion.Streak:
          break;
      }
      const k = drag ? Math.max(0, 1 - drag * dt) : 1;
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k + g * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      i++;
    }
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.rot[i] = this.rot[j];
    this.vr[i] = this.vr[j];
    this.size[i] = this.size[j];
    this.ph[i] = this.ph[j];
    this.spr[i] = this.spr[j];
    this.soft[i] = this.soft[j];
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.n) return;
    const d = this.dpr;
    const s = this.s;
    for (let pass = 0; pass < 2; pass++) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < this.n; i++) {
        const sp = this.sprites[this.spr[i]];
        if (sp.add !== (pass === 1)) continue;
        const life = this.life[i];
        if (life < 0) continue;
        const t = life / this.max[i];
        let a = t > 0.7 ? (1 - t) / 0.3 : 1;
        if (this.soft[i]) a *= Math.min(1, t / 0.2);
        let sx = 1;
        let sy = 1;
        let rot = this.rot[i];
        switch (sp.motion) {
          case Motion.Twinkle: {
            const pop = t < 0.12 ? t / 0.12 : 1;
            sx = sy = pop;
            a *= 0.6 + 0.4 * Math.sin(life * 16 + this.ph[i]);
            break;
          }
          case Motion.Float:
            a *= 0.55 + 0.45 * Math.sin(life * 3.4 + this.ph[i]);
            break;
          case Motion.Flutter:
            // a tumbling curl: squash across as it turns
            sx = 0.3 + 0.7 * Math.abs(Math.cos(life * 4.2 + this.ph[i]));
            break;
          case Motion.Spark: {
            // stretched along its flight, cooling (shrinking) as it slows
            const vx = this.vx[i];
            const vy = this.vy[i];
            const speed = Math.sqrt(vx * vx + vy * vy);
            rot = Math.atan2(vy, vx);
            sx = Math.min(4.2, 1 + speed / (140 * s));
            sy = 1 - t * 0.55;
            a *= 0.75 + 0.25 * Math.sin(life * 30 + this.ph[i]);
            break;
          }
          case Motion.Ring: {
            const e = 1 - (1 - t) * (1 - t) * (1 - t);
            sx = sy = 0.12 + 0.88 * e;
            a = Math.pow(1 - t, 1.6) * 0.9;
            break;
          }
          case Motion.Puff: {
            const e = 1 - (1 - t) * (1 - t);
            sx = sy = 0.55 + 0.85 * e;
            a = 0.85 * Math.pow(1 - t, 1.3);
            break;
          }
        }
        if (a <= 0.01) continue;
        g.globalAlpha = a > 1 ? 1 : a;
        const img = sp.img;
        const k = (this.size[i] * d) / (sp.base * d);
        const c = Math.cos(rot) * k;
        const sn = Math.sin(rot) * k;
        g.setTransform(c * sx, sn * sx, -sn * sy, c * sy, this.x[i] * d, this.y[i] * d);
        g.drawImage(img, -img.width / 2, -img.height / 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
