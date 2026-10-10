// One-thumb floating joystick (touch / mouse anywhere on the battlefield) + WASD / arrow keys.
export class Input {
  constructor(surface) {
    this.surface = surface;
    this.x = 0; this.z = 0;          // move vector, magnitude 0..1
    this.active = false;              // finger down
    this.ox = 0; this.oy = 0;         // joystick origin (css px)
    this.kx = 0; this.ky = 0;         // knob position
    this.pointerId = null;
    this.radius = 58; this.knob = 26; // setSize: Settings → Joystick size
    this.keys = new Set();
    this.moved = false;
    this.enabled = true;

    this._down = (e) => {
      if (!this.enabled || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      const r = surface.getBoundingClientRect();
      this.ox = this.kx = e.clientX - r.left;
      this.oy = this.ky = e.clientY - r.top;
      this.active = true;
      try { surface.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    this._move = (e) => {
      if (e.pointerId !== this.pointerId) return;
      const r = surface.getBoundingClientRect();
      let dx = e.clientX - r.left - this.ox, dy = e.clientY - r.top - this.oy;
      const d = Math.hypot(dx, dy);
      // the base follows the thumb when dragged far, so direction changes stay snappy
      if (d > this.radius * 1.6) {
        const k = (d - this.radius * 1.6) / d;
        this.ox += dx * k; this.oy += dy * k;
        dx = e.clientX - r.left - this.ox; dy = e.clientY - r.top - this.oy;
      }
      this.kx = this.ox + dx; this.ky = this.oy + dy;
      const m = Math.min(1, Math.hypot(dx, dy) / this.radius);
      const a = Math.atan2(dy, dx);
      const dead = 0.12;
      const mag = m < dead ? 0 : (m - dead) / (1 - dead);
      this.tx = Math.cos(a) * mag; this.tz = Math.sin(a) * mag;
      if (mag > 0.2) this.moved = true;
    };
    this._up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null; this.active = false; this.tx = 0; this.tz = 0;
    };
    this._kd = (e) => { this.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); };
    this._ku = (e) => this.keys.delete(e.code);
    this.tx = 0; this.tz = 0;
    surface.addEventListener('pointerdown', this._down);
    surface.addEventListener('pointermove', this._move);
    surface.addEventListener('pointerup', this._up);
    surface.addEventListener('pointercancel', this._up);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
  }

  update() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (x || z) {
      const l = Math.hypot(x, z); this.x = x / l; this.z = z / l; this.moved = true;
    } else { this.x = this.tx; this.z = this.tz; }
  }

  /** Joystick size (Settings → Accessibility): k × the default 58 px radius, 0.75–1.5. */
  setSize(k) {
    const f = Math.min(1.5, Math.max(0.75, +k || 1));
    this.radius = 58 * f; this.knob = 26 * f;
  }

  reset() { this.pointerId = null; this.active = false; this.tx = this.tz = this.x = this.z = 0; this.keys.clear(); }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(this.ox, this.oy, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,20,40,0.28)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(126,226,255,0.45)'; ctx.stroke();
    const g = ctx.createRadialGradient(this.kx, this.ky, 2, this.kx, this.ky, this.knob);
    g.addColorStop(0, 'rgba(230,255,255,0.95)'); g.addColorStop(0.5, 'rgba(78,242,255,0.65)'); g.addColorStop(1, 'rgba(78,242,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.kx, this.ky, this.knob, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  dispose() {
    const s = this.surface;
    s.removeEventListener('pointerdown', this._down); s.removeEventListener('pointermove', this._move);
    s.removeEventListener('pointerup', this._up); s.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku);
  }
}
