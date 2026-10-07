/**
 * Tiny DOM toolkit (no framework): hyperscript `h()`, SVG `s()`, diffed writers and a safe-call
 * wrapper so one misbehaving widget can never take the whole UI loop down.
 */

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Attrs {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  style?: string | Record<string, string | number>;
  data?: Record<string, string | number | boolean | null | undefined>;
  /** Event listeners, e.g. `{ click: fn }`. */
  on?: Record<string, (e: any) => void>;
  [attr: string]: unknown;
}

const NON_ATTR = new Set(['class', 'id', 'text', 'html', 'style', 'data', 'on']);

function applyAttrs(el: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return;
  if (attrs.class) el.setAttribute('class', attrs.class);
  if (attrs.id) el.id = attrs.id;
  if (attrs.text != null) el.textContent = attrs.text;
  if (attrs.html != null) el.innerHTML = attrs.html;
  if (attrs.style) {
    if (typeof attrs.style === 'string') el.setAttribute('style', attrs.style);
    else for (const [k, v] of Object.entries(attrs.style)) (el as HTMLElement).style.setProperty(k, String(v));
  }
  if (attrs.data) {
    for (const [k, v] of Object.entries(attrs.data)) if (v != null && v !== false) el.setAttribute('data-' + k, v === true ? '' : String(v));
  }
  if (attrs.on) for (const [k, fn] of Object.entries(attrs.on)) el.addEventListener(k, fn);
  for (const [k, v] of Object.entries(attrs)) {
    if (NON_ATTR.has(k) || v == null || v === false) continue;
    if (typeof v === 'function' && k.startsWith('on')) {
      el.addEventListener(k.slice(2), v as EventListener);
      continue;
    }
    el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el: Node, kids: Child[]): void {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

/** Create an element: `h('div', { class: 'card' }, 'text', child)`. */
export function h<T extends HTMLElement = HTMLElement>(tag: string, attrs?: Attrs | null, ...kids: Child[]): T {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, kids);
  return el as T;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Create an SVG element. */
export function s(tag: string, attrs?: Record<string, string | number> | null, ...kids: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  append(el, kids);
  return el as SVGElement;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Replace the children of `el`. */
export function fill(el: Element, ...kids: Child[]): void {
  clear(el);
  append(el, kids);
}

type Cached = { __t?: string; __v?: string };

/** Write textContent only when it changed (avoids DOM churn at 5 Hz). */
export function setText(el: Element, text: string): void {
  const c = el as unknown as Cached;
  if (c.__t === text) return;
  c.__t = text;
  el.textContent = text;
}

/** Write a CSS custom property / style only when it changed. */
export function setVar(el: HTMLElement, name: string, value: string): void {
  const c = el as unknown as Record<string, string>;
  const key = '__v' + name;
  if (c[key] === value) return;
  c[key] = value;
  el.style.setProperty(name, value);
}

export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector(sel) as T | null;
}

/** Restart a CSS animation class on an element (pops, shakes). */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

const warned = new Set<string>();
/** Run `fn`, logging each distinct failure once. Returns undefined on failure. */
export function safe<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (!warned.has(label)) {
      warned.add(label);
      console.error(`[ui] ${label} failed`, e);
    }
    return undefined;
  }
}

/** Like `safe` but returns whether `fn` completed without throwing. */
export function tryRun(label: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (!warned.has(label)) {
      warned.add(label);
      console.error(`[ui] ${label} failed`, e);
    }
    return false;
  }
}

/** Escape text for use in innerHTML. */
export function esc(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** requestAnimationFrame-driven count-up of a number into an element. */
export function countUp(el: HTMLElement, to: number, ms: number, delay = 0, format: (n: number) => string = (n) => Math.round(n).toLocaleString()): void {
  const t0 = performance.now() + delay;
  el.textContent = format(0);
  const step = (now: number) => {
    if (!el.isConnected) return;
    const t = Math.min(1, Math.max(0, (now - t0) / ms));
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = format(to * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
