/**
 * UI — DOM overlay (HUD, joystick, context button, build mode, panels, modals, toasts, floating
 * numbers, fly-to-HUD resource animations, tutorial guidance). Touch-first.
 *
 * OWNER: ui agent. (This file is a minimal placeholder so the app boots.)
 */
import type { Game } from '../core/Game';
import type { RendererApi } from '../render/api';

export class UI {
  private root!: HTMLElement;
  constructor(private readonly game: Game, private readonly renderer: RendererApi) {}

  init(root: HTMLElement): void {
    this.root = root;
    void this.renderer;
  }

  update(_dt: number): void {
    void this.game;
    void this.root;
  }
}
