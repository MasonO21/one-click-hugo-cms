/**
 * SettingsPanel — audio sliders, quality, haptics, auto-gather, analytics consent, left-handed
 * layout, FPS counter, recovery code export/import (through optional SaveManager hooks on `window`),
 * restore purchases and credits.
 */
import { Panel, type PanelTitle } from './Panel';
import type { SettingsState } from '../../core/state';
import { btn, section } from '../widgets';
import { fill, h } from '../dom';

type Hooked = Record<string, (...a: unknown[]) => unknown>;

/** The meta agent's SaveManager may be exposed on window under a few names. */
function saveHook(): Hooked | null {
  const w = window as unknown as Record<string, unknown>;
  const o = (w.saves ?? w.saveManager ?? w.SaveManager ?? w.save) as Hooked | undefined;
  return o && typeof o === 'object' ? o : null;
}

async function callHook(names: string[], ...args: unknown[]): Promise<{ found: boolean; value?: unknown }> {
  const o = saveHook();
  if (!o) return { found: false };
  for (const n of names) {
    if (typeof o[n] === 'function') return { found: true, value: await o[n](...args) };
  }
  return { found: false };
}

export class SettingsPanel extends Panel {
  readonly name = 'settings';
  private code = '';

  title(): PanelTitle {
    return { icon: '⚙️', text: 'Settings' };
  }

  override signature(): string {
    const s = this.st.settings;
    return `${s.quality}|${s.haptics}|${s.autoGather}|${s.analytics}|${s.showFps}|${s.leftHanded}|${this.code.length}`;
  }

  private slider(label: string, icon: string, key: 'music' | 'sfx'): HTMLElement {
    const s = this.st.settings;
    const input = h<HTMLInputElement>('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(s[key] * 100)), 'aria-label': label });
    const val = h('b', { class: 'num', text: `${Math.round(s[key] * 100)}%` });
    const paint = () => input.style.setProperty('--fill', `${input.value}%`);
    paint();
    input.addEventListener('input', () => {
      s[key] = Number(input.value) / 100;
      val.textContent = `${input.value}%`;
      paint();
    });
    input.addEventListener('change', () => this.ctx.sfx('ui_click'));
    return h('div', { class: 'set-row' }, h('div', { class: 'row' }, h('span', { class: 'si', text: icon }), h('div', { class: 'grow', text: label }), val), input);
  }

  private toggle(label: string, sub: string, icon: string, key: keyof Pick<SettingsState, 'haptics' | 'autoGather' | 'analytics' | 'showFps' | 'leftHanded'>, after?: (on: boolean) => void): HTMLElement {
    const s = this.st.settings;
    const sw = h('div', { class: 'switch' + (s[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(s[key]), tabindex: '0' });
    const flip = () => {
      s[key] = !s[key];
      sw.classList.toggle('on', s[key]);
      sw.setAttribute('aria-checked', String(s[key]));
      this.ctx.sfx('ui_tab');
      after?.(s[key]);
    };
    sw.addEventListener('click', flip);
    return h('div', { class: 'set-row row' }, h('span', { class: 'si', text: icon }), h('div', { class: 'grow' }, h('div', { text: label }), h('div', { class: 'mute small', text: sub })), sw);
  }

  render(): void {
    const g = this.game;
    const s = g.state.settings;
    const wrap = h('div', { class: 'stack-v settings' });

    wrap.appendChild(section('Sound'));
    wrap.appendChild(h('div', { class: 'card' }, this.slider('Music', '🎵', 'music'), this.slider('Sound effects', '🔊', 'sfx')));

    wrap.appendChild(section('Graphics'));
    const seg = h('div', { class: 'segmented' });
    for (const q of ['low', 'medium', 'high'] as const) {
      const b = h('button', { class: 'seg' + (s.quality === q ? ' on' : ''), type: 'button', text: q[0].toUpperCase() + q.slice(1), data: { quality: q, sfx: 'ui_tab' } });
      b.addEventListener('click', () => {
        s.quality = q;
        this.rerender();
      });
      seg.appendChild(b);
    }
    wrap.appendChild(h('div', { class: 'card' }, h('div', { class: 'set-row' }, h('div', { class: 'row' }, h('span', { class: 'si', text: '✨' }), h('div', { class: 'grow', text: 'Quality' })), seg, h('div', { class: 'mute small', text: 'Lower it if your phone gets warm or the game stutters.' })), this.toggle('Show FPS', 'Performance counter on screen', '📈', 'showFps')));

    wrap.appendChild(section('Controls'));
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        this.toggle('Left-handed layout', 'Swap the joystick and buttons', '🤚', 'leftHanded'),
        this.toggle('Auto-gather', 'Chop and mine automatically when you stand near a node', '🪓', 'autoGather'),
        this.toggle('Vibration', 'Gentle haptic feedback', '📳', 'haptics'),
      ),
    );

    wrap.appendChild(section('Privacy'));
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        this.toggle('Help improve the game', 'Share anonymous usage data. Never personal info.', '📊', 'analytics', (on) => {
          g.state.settings.analyticsAsked = true;
          g.services.analytics.setConsent(on);
        }),
      ),
    );

    wrap.appendChild(section('Your colony'));
    wrap.appendChild(this.dataCard());

    wrap.appendChild(section('About'));
    wrap.appendChild(
      h(
        'div',
        { class: 'card center small' },
        h('div', { class: 'h3', text: 'Nova Colony' }),
        h('div', { class: 'mute', text: 'A cozy little colony on a beautiful alien world.' }),
        h('div', { class: 'mute', style: 'margin-top:.4em', text: 'Desktop keys: WASD move · Q/E turn · Space interact · B build · M map · Esc close' }),
        h('div', { class: 'mute', style: 'margin-top:.4em', text: 'Made with ♥ for cozy builders everywhere.' }),
      ),
    );
    fill(this.body, wrap);
  }

  private dataCard(): HTMLElement {
    const g = this.game;
    const card = h('div', { class: 'card stack-v tight' });
    card.appendChild(
      h(
        'div',
        { class: 'row wrap' },
        btn({
          label: '💾 Save now',
          cls: 'info small grow',
          onClick: async () => {
            const r = await callHook(['saveNow', 'flush'], g);
            const r2 = r.found ? r : await callHook(['save'], g, false);
            this.ctx.toast(r2.found ? 'Colony saved!' : 'Your colony autosaves as you play', 'success', '💾');
          },
        }),
        btn({
          label: '🔄 Restore purchases',
          cls: 'ghost small grow',
          onClick: async () => {
            await g.sys.liveops.restorePurchases();
          },
        }),
      ),
    );
    const area = h<HTMLTextAreaElement>('textarea', { placeholder: 'Recovery code appears here. Paste a code to restore a colony.', rows: '3', 'aria-label': 'Recovery code' });
    area.value = this.code;
    area.addEventListener('input', () => {
      this.code = area.value;
    });
    card.appendChild(area);
    card.appendChild(
      h(
        'div',
        { class: 'row wrap' },
        btn({
          label: '📤 Export code',
          cls: 'ghost small grow',
          onClick: async () => {
            const r = await callHook(['exportRecoveryCode', 'exportCode', 'getRecoveryCode', 'exportSave'], g);
            if (!r.found) {
              this.ctx.toast('Recovery codes are on their way in an update!', 'info', '📤');
              return;
            }
            this.code = String(r.value ?? '');
            area.value = this.code;
            try {
              await navigator.clipboard?.writeText(this.code);
              this.ctx.toast('Code copied to your clipboard', 'success', '📋');
            } catch {
              this.ctx.toast('Code ready — copy it from the box', 'success', '📋');
            }
          },
        }),
        btn({
          label: '📥 Import code',
          cls: 'ghost small grow',
          onClick: async () => {
            const code = area.value.trim();
            if (!code) {
              this.ctx.toast('Paste a recovery code first', 'info', '📥');
              return;
            }
            const r = await callHook(['importRecoveryCode', 'importCode', 'restoreFromCode', 'importSave'], code, g);
            if (!r.found) this.ctx.toast('Recovery codes are on their way in an update!', 'info', '📥');
            else this.ctx.toast(r.value === false ? "That code didn't work" : 'Colony restored!', r.value === false ? 'warning' : 'success', '📥');
          },
        }),
      ),
    );
    return card;
  }
}
