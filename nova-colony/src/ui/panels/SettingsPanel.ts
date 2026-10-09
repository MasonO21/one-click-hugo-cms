/**
 * SettingsPanel — audio sliders, quality, haptics, auto-gather, notifications (iOS / Android), analytics consent,
 * left-handed layout, FPS counter, recovery code export/import (through optional SaveManager hooks on `window`),
 * restore purchases and credits.
 */
import { Panel, type PanelTitle } from './Panel';
import { QUALITY_LEVELS, type QualityLevel, type SettingsState } from '../../core/state';
import { btn, section } from '../widgets';
import { fill, h } from '../dom';
import { hudArt } from '../art';
import { NOTIFY_GRANTED_TOAST } from '../NotifyPrompt';

type Hooked = Record<string, (...a: unknown[]) => unknown>;

const QUALITY_NAME: Record<QualityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** "Auto · Medium" in auto mode (so the player sees what Auto chose), else the picked level. */
export function qualitySummary(s: Pick<SettingsState, 'quality' | 'qualityMode'>): string {
  const name = QUALITY_NAME[s.quality] ?? s.quality;
  return s.qualityMode === 'auto' ? `Auto · ${name}` : name;
}

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

/** Where to switch notifications back on once the OS has blocked them (the game cannot open that screen). */
export function notifyBlockedHint(platform: 'web' | 'ios' | 'android'): string {
  return platform === 'android'
    ? 'Turned off in your phone settings. To get them, open Settings › Apps › Nova Colony › Notifications.'
    : 'Turned off in your device settings. To get them, open Settings › Nova Colony › Notifications.';
}

export class SettingsPanel extends Panel {
  readonly name = 'settings';
  private code = '';
  private notifyBusy = false;

  title(): PanelTitle {
    return { icon: '⚙️', art: hudArt('settings'), text: 'Settings' };
  }

  override signature(): string {
    const s = this.st.settings;
    const n = this.game.notifications;
    const notify = n?.available ? `${n.permission}|${n.enabled}|${this.notifyBusy}` : '-';
    return `${s.quality}|${s.qualityMode}|${s.haptics}|${s.autoGather}|${s.analytics}|${s.showFps}|${s.leftHanded}|${s.batterySaver}|${notify}|${this.code.length}`;
  }

  override onOpen(): void {
    // the player may have changed it in the system settings since
    void this.game.notifications?.refresh();
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

  private toggle(label: string, sub: string, icon: string, key: keyof Pick<SettingsState, 'haptics' | 'autoGather' | 'analytics' | 'showFps' | 'leftHanded' | 'batterySaver' | 'largeText' | 'reduceMotion'>, after?: (on: boolean) => void): HTMLElement {
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
    wrap.appendChild(h('div', { class: 'card' }, this.qualityRow(), this.toggle('Battery saver', '30 fps: longer play, cooler phone', '🔋', 'batterySaver'), this.toggle('Show FPS', 'Performance counter on screen', '📈', 'showFps')));

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

    wrap.appendChild(section('Accessibility'));
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        this.toggle('Larger text', 'Bigger text in menus, sheets and messages', '🔎', 'largeText'),
        this.toggle('Reduce motion', 'No camera shake and calmer animations (your phone setting counts too)', '🌿', 'reduceMotion'),
      ),
    );

    const notify = this.notifyRow();
    if (notify) {
      wrap.appendChild(section('Reminders'));
      wrap.appendChild(h('div', { class: 'card' }, notify));
    }

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

  /**
   * Notifications (iOS / Android only): on = the player's yes AND the OS permission. Turning it on asks the OS while
   * it still asks; once the OS has blocked the app the row explains where to allow them instead.
   */
  private notifyRow(): HTMLElement | null {
    const n = this.game.notifications;
    if (!n?.available) return null;
    const on = n.enabled;
    const sw = h('div', {
      class: 'switch' + (on ? ' on' : ''),
      role: 'switch',
      'aria-checked': String(on),
      'aria-label': 'Notifications',
      tabindex: '0',
      data: { notify: 'toggle' },
    });
    sw.addEventListener('click', () => void this.flipNotify(!on));
    const sub = n.blocked && !on ? notifyBlockedHint(this.game.services.platform) : 'Storehouses full, daily gift ready. Never at night.';
    return h(
      'div',
      { class: 'set-row row' },
      h('span', { class: 'si', text: '🔔' }),
      h('div', { class: 'grow' }, h('div', { text: 'Notifications' }), h('div', { class: 'mute small', data: { notify: 'hint' }, text: sub })),
      sw,
    );
  }

  private async flipNotify(on: boolean): Promise<void> {
    const n = this.game.notifications;
    if (!n || this.notifyBusy) return;
    this.notifyBusy = true;
    this.ctx.sfx('ui_tab');
    try {
      const p = await n.setEnabled(on);
      if (on && p === 'granted') this.ctx.toast(NOTIFY_GRANTED_TOAST, 'success', '🔔');
      else if (on && p === 'denied') this.ctx.toast('Notifications are switched off for Nova Colony in your settings.', 'info', '🔔');
    } finally {
      this.notifyBusy = false;
      this.rerender();
    }
  }

  /**
   * Auto | Low | Medium | High. A level makes the choice the player's (manual); Auto hands it back to the game,
   * which re-checks the device (platform/autoQuality.ts). In auto mode the level in use is outlined and named in
   * the row header ("Auto · Medium").
   */
  private qualityRow(): HTMLElement {
    const g = this.game;
    const s = g.state.settings;
    const auto = s.qualityMode === 'auto';
    const seg = h('div', { class: 'segmented quality', role: 'radiogroup', 'aria-label': 'Graphics quality' });
    const add = (key: string, label: string, on: boolean, inUse: boolean, pick: () => void) => {
      const b = h('button', {
        class: 'seg' + (on ? ' on' : '') + (inUse ? ' in-use' : ''),
        type: 'button',
        role: 'radio',
        'aria-checked': String(on),
        text: label,
        title: inUse ? `Auto is using ${label}` : undefined,
        data: { quality: key, sfx: 'ui_tab' },
      });
      b.addEventListener('click', () => {
        pick();
        this.rerender();
      });
      seg.appendChild(b);
    };
    add('auto', 'Auto', auto, false, () => {
      if (g.autoQuality) g.autoQuality.enableAuto();
      else {
        s.qualityMode = 'auto';
        s.qualityDevice = ''; // re-check the device on the next launch
      }
    });
    for (const q of QUALITY_LEVELS) {
      add(q, QUALITY_NAME[q], !auto && s.quality === q, auto && s.quality === q, () => {
        if (g.autoQuality) g.autoQuality.setManual(q);
        else {
          s.qualityMode = 'manual';
          s.quality = q;
        }
      });
    }
    const hint = auto ? 'Auto picks a level for this device and switches lower by itself if the game stutters.' : 'Lower it if your phone gets warm or the game stutters.';
    return h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'row' }, h('span', { class: 'si', text: '✨' }), h('div', { class: 'grow', text: 'Quality' }), h('b', { class: 'quality-now', text: qualitySummary(s) })),
      seg,
      h('div', { class: 'mute small', text: hint }),
    );
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
