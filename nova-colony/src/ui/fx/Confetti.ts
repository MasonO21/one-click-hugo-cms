/** Confetti burst via the Web Animations API (compositor-only; nodes removed when finished). */

const COLORS = ['#ffcf4a', '#ff6f91', '#4fb3f6', '#3fc38a', '#b48cff', '#ff8a3d', '#5ef2ff'];

export interface ConfettiOpts {
  count?: number;
  /** Origin in px relative to the container (defaults to 50% / 40%). */
  x?: number;
  y?: number;
  colors?: string[];
  power?: number;
}

export function confetti(container: HTMLElement, opts: ConfettiOpts = {}): void {
  const rect = container.getBoundingClientRect();
  const ox = opts.x ?? rect.width / 2;
  const oy = opts.y ?? rect.height * 0.4;
  const count = Math.min(opts.count ?? 48, 90);
  const colors = opts.colors ?? COLORS;
  const power = opts.power ?? 1;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    const w = 6 + Math.random() * 7;
    el.style.width = `${w}px`;
    el.style.height = `${w * (0.9 + Math.random() * 0.9)}px`;
    el.style.background = colors[i % colors.length];
    if (Math.random() < 0.3) el.style.borderRadius = '50%';
    el.style.left = '0';
    el.style.top = '0';
    container.appendChild(el);
    const ang = Math.random() * Math.PI * 2;
    const speed = (120 + Math.random() * 260) * power;
    const dx = Math.cos(ang) * speed;
    const dy = Math.sin(ang) * speed * 0.8 - 160 * power;
    const fall = 260 + Math.random() * 240;
    const rot = (Math.random() - 0.5) * 900;
    const dur = 1100 + Math.random() * 900;
    const a = el.animate(
      [
        { transform: `translate3d(${ox}px, ${oy}px, 0) rotate(0deg) scale(0.4)`, opacity: 0, offset: 0 },
        { transform: `translate3d(${ox + dx * 0.55}px, ${oy + dy * 0.55}px, 0) rotate(${rot * 0.5}deg) scale(1)`, opacity: 1, offset: 0.28, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
        { transform: `translate3d(${ox + dx}px, ${oy + dy + fall}px, 0) rotate(${rot}deg) scale(0.9)`, opacity: 0, offset: 1 },
      ],
      { duration: dur, delay: Math.random() * 120, fill: 'both', easing: 'ease-in' },
    );
    a.onfinish = () => el.remove();
  }
}
