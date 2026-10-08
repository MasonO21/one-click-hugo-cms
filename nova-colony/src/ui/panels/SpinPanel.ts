/**
 * SpinPanel — the Lucky Wheel. Segments come from data.spinSegments; `await liveops.spin(viaAd)`
 * returns the winning index and the wheel decelerates onto it (tick sounds as segments pass).
 */
import { Panel, type PanelTitle } from './Panel';
import { easeOutQuart, segmentAtRotation, spinTarget } from '../logic/spin';
import { rewardParts } from '../logic/rewards';
import { adButton, btn, partIcon, rewardChips } from '../widgets';
import { hudArt, iconEl } from '../art';
import { confetti } from '../fx/Confetti';
import { fill, h } from '../dom';
import { buyNovaItem, novaOffer } from '../../sim/novaShop';
import { novaLabel } from './wardrobe/cards';

export class SpinPanel extends Panel {
  readonly name = 'spin';
  private wheel: HTMLCanvasElement | null = null;
  private rot = 0;
  private spinning = false;
  private result = -1;
  private raf = 0;

  title(): PanelTitle {
    return { icon: '🎡', art: hudArt('spin'), text: 'Lucky Wheel' };
  }

  override onClose(): void {
    cancelAnimationFrame(this.raf);
  }

  /** `{ animate: index }`: a spin bought elsewhere (Shop › Nova Shop) has its result: turn the wheel onto it. */
  override onOpen(arg: unknown): void {
    this.animateArg(arg);
  }

  override onArg(arg: unknown): void {
    this.animateArg(arg);
  }

  private animateArg(arg: unknown): void {
    const idx = this.pick<number>(arg, 'animate');
    if (typeof idx !== 'number' || this.spinning || idx < 0 || idx >= this.data.spinSegments.length) return;
    this.spinning = true;
    this.result = -1;
    // after the first render: the wheel canvas exists
    requestAnimationFrame(() => this.animateTo(idx));
  }

  override signature(): string {
    const lo = this.game.sys.liveops;
    const nova = novaOffer(this.game, 'nova_spin');
    return `${lo.canSpinFree() ? 1 : 0}|${lo.canWatchAd('extra_spin') ? 1 : 0}|${this.spinning}|${this.result}|${this.st.liveops.spin.adSpins}|${nova ? `${nova.ok}${nova.left}` : ''}`;
  }

  render(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const segs = this.data.spinSegments;
    if (!this.wheel) this.wheel = this.drawWheel();
    this.wheel.style.transform = `rotate(${this.rot}deg)`;

    const stage = h('div', { class: 'wheel-stage' }, h('div', { class: 'wheel-ring' }, this.wheel, h('div', { class: 'wheel-hub', text: '★' })), h('div', { class: 'wheel-pointer' }));

    const side = h('div', { class: 'stack-v wheel-side' });
    const free = lo.canSpinFree();
    const adOk = lo.canWatchAd('extra_spin');
    if (this.result >= 0 && !this.spinning) {
      const seg = segs[this.result];
      side.appendChild(h('div', { class: 'card tint center pop-in' }, h('div', { class: 'h3', text: `You won: ${seg.label}!` }), rewardChips(this.data, seg.reward, 'center')));
    } else {
      side.appendChild(h('div', { class: 'card tint center' }, h('div', { class: 'h3', text: free ? 'Your free spin is ready!' : 'Spin for a prize!' }), h('div', { class: 'mute small', text: free ? 'One free spin every day.' : adOk ? 'Watch a short video for another spin.' : 'Come back tomorrow for a free spin.' })));
    }
    side.appendChild(
      btn({
        label: this.spinning ? 'Spinning…' : '🎡 SPIN (free)',
        cls: 'big good block',
        id: 'btn-spin',
        disabled: this.spinning ? true : free ? false : 'No free spin left today',
        onClick: () => this.doSpin(false),
      }),
    );
    side.appendChild(
      adButton(this.ctx, 'extra_spin', 'Extra spin', undefined, {
        cls: 'block',
        run: async () => {
          await this.doSpin(true);
          return true;
        },
      }),
    );

    // one more go for Nova (Nova Shop item: capped per day, never needed)
    const nova = free ? null : novaOffer(g, 'nova_spin');
    if (nova && nova.left > 0) {
      side.appendChild(
        btn({
          label: h('span', null, 'Spin again · ', novaLabel(nova.price)),
          cls: 'nova block',
          id: 'btn-spin-nova',
          disabled: this.spinning ? true : nova.ok ? false : (nova.reason ?? true),
          onClick: () => this.novaSpin(),
        }),
      );
    }

    const prizes = h('div', { class: 'chips prize-chips' });
    for (const s of segs) {
      const p = rewardParts(s.reward, this.data)[0];
      prizes.appendChild(h('span', { class: 'chip', style: { background: s.color + '55' } }, p ? partIcon(p) : iconEl(null, '🎁'), s.label));
    }
    side.appendChild(prizes);
    fill(this.body, h('div', { class: 'spin-layout' }, stage, side));
  }

  private async doSpin(viaAd: boolean): Promise<void> {
    if (this.spinning) return;
    const lo = this.game.sys.liveops;
    if (!viaAd && !lo.canSpinFree()) {
      this.ctx.toast('No free spin left — watch a video for another!', 'info', '🎡');
      return;
    }
    this.spinning = true;
    this.result = -1;
    this.rerender();
    let idx: number | null = null;
    try {
      idx = await lo.spin(viaAd);
    } catch {
      idx = null;
    }
    if (idx == null) {
      this.spinning = false;
      this.ctx.toast("The wheel is stuck — try again in a moment", 'info', '🎡');
      this.rerender();
      return;
    }
    this.animateTo(idx);
  }

  private novaSpin(): void {
    if (this.spinning) return;
    const res = buyNovaItem(this.game, 'nova_spin');
    if (!res.ok || res.spin == null) {
      this.ctx.toast(res.reason ?? 'The wheel is stuck — try again in a moment', 'info', '🎡');
      this.rerender();
      return;
    }
    this.spinning = true;
    this.result = -1;
    this.rerender();
    this.animateTo(res.spin);
  }

  private animateTo(idx: number): void {
    const n = this.data.spinSegments.length;
    const from = this.rot;
    const to = spinTarget(from, idx, n, 5, (Math.random() - 0.5) * 0.6);
    const dur = 4600;
    const t0 = performance.now();
    let lastSeg = segmentAtRotation(from, n);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      this.rot = from + (to - from) * easeOutQuart(k);
      if (this.wheel) this.wheel.style.transform = `rotate(${this.rot}deg)`;
      const seg = segmentAtRotation(this.rot, n);
      if (seg !== lastSeg) {
        lastSeg = seg;
        this.ctx.sfx('spin_tick');
      }
      if (k < 1 && this.wheel?.isConnected) this.raf = requestAnimationFrame(step);
      else this.finish(idx);
    };
    this.raf = requestAnimationFrame(step);
  }

  private finish(idx: number): void {
    this.spinning = false;
    this.result = idx;
    this.ctx.sfx('spin_win');
    this.ctx.haptic('success');
    this.rerender();
    confetti(this.frame, { count: 56, y: this.frame.clientHeight * 0.45 });
    const seg = this.data.spinSegments[idx];
    window.setTimeout(() => {
      if (this.card.isConnected) this.ctx.showReward(`You won: ${seg.label}!`, seg.reward, '🎡');
    }, 700);
  }

  private drawWheel(): HTMLCanvasElement {
    const S = 640;
    const cv = h<HTMLCanvasElement>('canvas', { class: 'wheel', width: S, height: S });
    this.paintWheel(cv);
    // prize icons: repaint with the illustrations once they are decoded (the HUD has usually cached them already)
    const srcs = new Set<string>();
    for (const s of this.data.spinSegments) {
      const art = rewardParts(s.reward, this.data)[0]?.art;
      if (art) srcs.add(art);
    }
    if (srcs.size) {
      const imgs = new Map<string, HTMLImageElement>();
      void Promise.all(
        [...srcs].map(async (src) => {
          const img = new Image();
          img.src = src;
          try {
            await img.decode();
            imgs.set(src, img);
          } catch {
            /* keep the emoji for this one */
          }
        }),
      ).then(() => {
        if (imgs.size) this.paintWheel(cv, imgs);
      });
    }
    return cv;
  }

  private paintWheel(cv: HTMLCanvasElement, imgs?: Map<string, HTMLImageElement>): void {
    const segs = this.data.spinSegments;
    const S = cv.width;
    const c = cv.getContext('2d')!;
    const R = S / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.translate(R, R);
    const n = Math.max(1, segs.length);
    const a = (Math.PI * 2) / n;
    // outer rim
    c.beginPath();
    c.arc(0, 0, R - 2, 0, Math.PI * 2);
    c.fillStyle = '#ffcf4a';
    c.fill();
    segs.forEach((s, i) => {
      const a0 = -Math.PI / 2 + i * a;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R - 26, a0, a0 + a);
      c.closePath();
      c.fillStyle = s.color;
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.stroke();
      // light overlay on alternate segments
      if (i % 2) {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fill();
      }
      // label + icon
      c.save();
      c.rotate(a0 + a / 2);
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      const p = rewardParts(s.reward, this.data)[0];
      // label reads outward from the hub, shrunk to fit; the prize icon sits near the rim
      let fs = 40;
      const maxW = R * 0.46;
      c.font = `900 ${fs}px ui-rounded, system-ui, sans-serif`;
      while (c.measureText(s.label).width > maxW && fs > 20) {
        fs -= 2;
        c.font = `900 ${fs}px ui-rounded, system-ui, sans-serif`;
      }
      c.textAlign = 'left';
      c.lineWidth = 7;
      c.strokeStyle = 'rgba(30,14,50,0.7)';
      c.fillStyle = '#fff';
      c.strokeText(s.label, R * 0.26, 0);
      c.fillText(s.label, R * 0.26, 0);
      const img = p?.art ? imgs?.get(p.art) : undefined;
      if (img) {
        const sz = 70;
        c.drawImage(img, R * 0.81 - sz / 2, -sz / 2, sz, sz);
      } else {
        c.font = '52px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
        c.textAlign = 'center';
        c.fillStyle = '#000';
        c.fillText(p?.icon ?? '🎁', R * 0.81, 3);
      }
      c.restore();
    });
    // rim lights
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(ang) * (R - 13), Math.sin(ang) * (R - 13), 6, 0, Math.PI * 2);
      c.fillStyle = i % 2 ? '#fff6c8' : '#ff8a3d';
      c.fill();
    }
  }
}
