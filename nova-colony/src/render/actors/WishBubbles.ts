/**
 * Wish bubbles — a small speech bubble with the wish's icon over the head of every colonist with an open wish
 * (sim/wishes.ts). A handful of pooled sprites (at most `POOL`; the sim allows two open wishes), one tiny canvas
 * texture per icon, no per-frame allocation. The bubble is the painted `art/hud/wish.webp` with the icon as a badge
 * when that file exists, else a bubble drawn on the canvas with the icon inside.
 *
 * Readability on a phone: drawn over the scene (no depth test, like a marker), it grows a little with camera
 * distance so it never shrinks to a speck, and fades out far away (and softens right next to the player, so it
 * never hides the player in the middle of the screen). Hidden in build mode, on the map and in Photo Mode. Low quality
 * uses smaller textures and skips the bobbing. Tapping a bubble selects its colonist (Renderer.pick).
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { raySphere } from './Nature';
import type { Colonist } from '../../core/state';

const POOL = 4;
/** Painted bubble (the UI's `hudArt('wish')`): optional, the canvas bubble stands in until / unless it loads. */
const BUBBLE_ART = 'art/hud/wish.webp';
/** World units: bubble size up close, the distance from which it starts to grow, and the fade-out band. */
const BASE_SIZE = 1.45;
const GROW_FROM = 18;
const GROW_MAX = 2.4;
const FADE_FROM = 95;
const FADE_TO = 140;
const POP_SECONDS = 0.35;
/** World units: a bubble this close to the player softens so it never hides the player in the middle of the screen. */
const NEAR_PLAYER = 2.6;
const NEAR_ALPHA = 0.45;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';

interface Slot {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  key: string;
  colonist: number;
  born: number;
  /** Pick sphere (world). */
  x: number;
  y: number;
  z: number;
  r: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Overshooting ease for the pop-in. */
function easeOutBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export class WishBubbles {
  private readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private bubble: HTMLImageElement | null = null;
  private bubbleReady = false;
  /** Photo Mode: no bubbles in the picture (they are markers, like the HUD the mode hides). */
  hidden = false;

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      sprite.center.set(0.5, 0); // the tail sits on the anchor above the head
      sprite.renderOrder = 30;
      sprite.visible = false;
      sprite.frustumCulled = false;
      this.group.add(sprite);
      this.slots.push({ sprite, mat, key: '', colonist: -1, born: 0, x: 0, y: 0, z: 0, r: 0 });
    }
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.bubbleReady = true;
        this.flushTextures(); // redraw with the painted bubble
      };
      img.onerror = () => {
        this.bubbleReady = false;
      };
      img.src = BUBBLE_ART;
      this.bubble = img;
    }
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    const g = ctx.game;
    const env = ctx.env;
    const view = g.view;
    const open = g.state.wishes?.open;
    let used = 0;
    if (open?.length && !this.hidden && view.mode !== 'build' && view.mode !== 'map') {
      const cam = ctx.camera.position;
      const list = g.state.colonists.list;
      const bob = env.quality !== 'low';
      const pl = g.state.player;
      for (let i = 0; i < open.length && used < POOL; i++) {
        const w = open[i];
        let c: Colonist | null = null;
        for (let k = 0; k < list.length; k++) if (list[k].id === w.colonist) { c = list[k]; break; }
        if (!c || c.away || c.activity === 'sheltering') continue;
        if (!inView(env, c.x, c.z, -20)) continue;
        const icon = g.data.wish(w.def)?.icon ?? '💭';
        const slot = this.slots[used++];
        const key = `${icon}|${env.quality === 'low' ? 'l' : 'h'}|${this.bubbleReady ? 1 : 0}`;
        if (slot.key !== key) {
          slot.key = key;
          slot.mat.map = this.texture(icon, env.quality === 'low' ? 96 : 128);
          slot.mat.needsUpdate = true;
        }
        if (slot.colonist !== c.id) {
          slot.colonist = c.id;
          slot.born = env.t;
        }
        const hs = Math.max(0.85, Math.min(1.15, c.appearance?.height ?? 1));
        const sleeping = c.activity === 'sleeping';
        const y = ctx.heightAt(c.x, c.z) + (sleeping ? 1.1 : 2.05 * hs) + (bob ? Math.sin(env.t * 2.2 + c.id) * 0.07 : 0);
        const dx = c.x - cam.x;
        const dy = y - cam.y;
        const dz = c.z - cam.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const pop = Math.min(1, (env.t - slot.born) / POP_SECONDS);
        const s = BASE_SIZE * Math.min(GROW_MAX, Math.max(1, d / GROW_FROM)) * (pop < 1 ? Math.max(0.05, easeOutBack(pop)) : 1);
        const nearPlayer = Math.hypot(c.x - pl.x, c.z - pl.z) < NEAR_PLAYER;
        const alpha = (1 - smoothstep(FADE_FROM, FADE_TO, d)) * (nearPlayer ? NEAR_ALPHA : 1);
        const sp = slot.sprite;
        sp.position.set(c.x, y, c.z);
        sp.scale.set(s, s, 1);
        slot.mat.opacity = alpha;
        sp.visible = alpha > 0.02;
        slot.x = c.x;
        slot.y = y + s * 0.5;
        slot.z = c.z;
        slot.r = s * 0.6;
      }
    }
    for (let i = used; i < POOL; i++) {
      const slot = this.slots[i];
      slot.sprite.visible = false;
      slot.colonist = -1;
    }
  }

  /** The colonist whose bubble the ray hits first (taps on the bubble select its owner). */
  pick(ray: THREE.Ray, maxT: number): { id: number; t: number } | null {
    let best = -1;
    let bestT = maxT;
    for (const s of this.slots) {
      if (!s.sprite.visible || s.colonist < 0) continue;
      const t = raySphere(ray.origin, ray.direction, s.x, s.y, s.z, s.r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = s.colonist;
      }
    }
    return best >= 0 ? { id: best, t: bestT } : null;
  }

  /** Canvas texture for an icon (cached; at most a few distinct ones are ever alive). */
  private texture(icon: string, size: number): THREE.CanvasTexture {
    const key = `${icon}|${size}`;
    let tex = this.textures.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c2 = canvas.getContext('2d');
    if (c2) this.draw(c2, icon, size);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.textures.set(key, tex);
    return tex;
  }

  private draw(g: CanvasRenderingContext2D, icon: string, S: number): void {
    g.clearRect(0, 0, S, S);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (this.bubbleReady && this.bubble) {
      // the painted bubble (parchment with a brass star) with the wish's icon as a little badge in its colours
      g.drawImage(this.bubble, 0, 0, S, S);
      const bx = S * 0.76;
      const by = S * 0.26;
      const br = S * 0.2;
      g.fillStyle = '#fdf1d8';
      g.strokeStyle = '#a87a32';
      g.lineWidth = S * 0.03;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = `${Math.round(S * 0.24)}px ${EMOJI_FONT}`;
      g.fillText(icon, bx, by + S * 0.01);
      return;
    }
    // drawn bubble: soft round cloud with a tail, warm outline, the icon inside
    const pad = S * 0.08;
    const w = S - pad * 2;
    const h = S * 0.68;
    const x = pad;
    const y = pad;
    const r = h * 0.42;
    g.save();
    g.shadowColor = 'rgba(40, 20, 60, 0.35)';
    g.shadowBlur = S * 0.06;
    g.shadowOffsetY = S * 0.02;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    // tail at the bottom centre, pointing down at the colonist
    g.lineTo(S * 0.6, y + h);
    g.lineTo(S * 0.5, S * 0.97);
    g.lineTo(S * 0.4, y + h);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = '#ffcf4a';
    g.lineWidth = S * 0.035;
    g.stroke();
    g.font = `${Math.round(S * 0.42)}px ${EMOJI_FONT}`;
    g.fillText(icon, S * 0.5, y + h * 0.53);
    // a small brass star in the corner: it is a wish
    g.font = `${Math.round(S * 0.17)}px ${EMOJI_FONT}`;
    g.fillText('✨', x + w - S * 0.07, y + S * 0.08);
  }

  /** Forget cached textures (the painted bubble arrived): slots redraw on their next update. */
  private flushTextures(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const s of this.slots) {
      s.key = '';
      s.mat.map = null;
    }
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const s of this.slots) s.mat.dispose();
    this.ctx.scene.remove(this.group);
  }
}
