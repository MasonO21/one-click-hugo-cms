import { compassName, formatDistance } from './lib/geo.js';
import { Guide, labelForKind } from './lib/guide.js';
import { trailToGpx, gpxToTrail } from './lib/gpx.js';
import {
  GlassesBridge, HapticAdapter, HeadingFilter, MetaDisplayAdapter, PreviewAdapter, VoiceAdapter,
  createHud, hudFrame, pickHeading,
} from './lib/glasses.js';
import { drawElevation, drawMap } from './lib/map.js';
import { Recorder } from './lib/recorder.js';
import { Compass, hasGeolocation, keepAwake, photoToDataUrl, watchPosition } from './lib/sensors.js';
import { makeDemoTrail, Walker } from './lib/sim.js';
import { localTrails, remoteTrails, settings } from './lib/store.js';
import { reverseTrail, toPoints, validateTrail } from './lib/trail.js';

const DRAFT_ID = '__draft__';
const DEFAULT_ORIGIN = { lat: 39.9784, lng: -105.2895 };

/* ───────────────────────── tiny DOM helpers ───────────────────────── */

const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
};

// Native append()/replaceChildren() would stringify `false`/`undefined` from `cond && h(...)`: filter them.
const kidsOf = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false);
const add = (parent, ...kids) => parent.append(...kidsOf(kids));
const set = (parent, ...kids) => parent.replaceChildren(...kidsOf(kids));

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
let toastTimer;
function toast(msg, kind = '', ms = 3200) {
  $toast.textContent = msg;
  $toast.className = `toast ${kind}`;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), ms);
}

function formDialog({ title, intro, fields = [], ok = 'Save', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const inputs = {};
    const form = h('form', { method: 'dialog' });
    form.append(h('h2', { style: { margin: '0 0 6px' } }, title));
    if (intro) form.append(h('p', { class: 'muted small' }, intro));
    for (const f of fields) {
      let input;
      if (f.type === 'textarea') input = h('textarea', { rows: 3, maxlength: f.max ?? 500 }, f.value ?? '');
      else if (f.type === 'select') input = h('select', {}, f.options.map((o) => h('option', { value: o, selected: o === f.value }, o)));
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!f.value });
      else input = h('input', { type: 'text', value: f.value ?? '', maxlength: f.max ?? 80, autocomplete: 'off' });
      inputs[f.name] = input;
      form.append(
        f.type === 'checkbox'
          ? h('label', { class: 'check' }, input, h('span', {}, f.label, f.help && h('small', { class: 'muted' }, ` ${f.help}`)))
          : h('label', { class: 'field' }, f.label, input, f.help && h('small', {}, f.help)),
      );
    }
    const dlg = h('dialog', {}, form);
    let result = null;
    form.append(
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, cancel),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit' }, ok)),
    );
    form.addEventListener('submit', () => {
      result = Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value.trim()]));
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    document.body.append(dlg);
    dlg.showModal();
    (Object.values(inputs)[0] ?? dlg.querySelector('button.primary, button.danger'))?.focus();
  });
}

const fmtDuration = (s) => {
  if (s == null) return '–';
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
};
const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);
const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trail';

/* ───────────────────────── glasses / guidance outputs ───────────────────────── */

const voice = new VoiceAdapter();
const haptic = new HapticAdapter();
const metaDisplay = new MetaDisplayAdapter();
voice.enabled = settings.get('voice', true);

function refreshChip() {
  const parts = [];
  if (metaDisplay.available()) parts.push('Glasses display');
  if (voice.available()) parts.push('Audio');
  if (haptic.available()) parts.push('Haptics');
  const chip = document.getElementById('glasses-chip');
  chip.hidden = parts.length === 0;
  chip.textContent = `Guidance: ${parts.join(' · ')}`;
  chip.title = 'Audio cues play through any paired Bluetooth device, including Meta glasses.';
}

/* ───────────────────────── location sources (real or simulated) ───────────────────────── */

const simEnabled = () => settings.get('sim', false);

function startFixes({ sim, points, onFix, onError, walkerOpts = {}, tickMs = 500 }) {
  if (sim) {
    const walker = new Walker(points, { speedMps: 1.4, noiseM: 2, seed: 11, ...walkerOpts });
    const id = setInterval(() => !walker.done && onFix(walker.next(1)), tickMs);
    return { stop: () => clearInterval(id), walker };
  }
  if (!window.isSecureContext) {
    onError(new Error('Location needs HTTPS (or localhost). Open the app over https:// to use GPS.'));
    return { stop() {} };
  }
  return { stop: watchPosition(onFix, onError), walker: null };
}

const gpsErrorText = (err) =>
  err?.code === 1 ? 'Location permission denied. Allow location for this site, or use “Simulate GPS”.' : err?.message || 'Could not get a GPS fix.';

function getPositionOnce(timeout = 6000) {
  return new Promise((resolve) => {
    if (!hasGeolocation() || !window.isSecureContext) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        settings.set('lastPos', pos);
        resolve(pos);
      },
      () => resolve(null),
      { timeout, maximumAge: 60000 },
    );
  });
}

/* ───────────────────────── trail data access ───────────────────────── */

async function loadTrail(kind, id) {
  const local = await localTrails.get(id);
  if (local) return { trail: local, saved: true };
  if (kind === 'shared') return { trail: await remoteTrails.get(id), saved: false };
  return null;
}

function trailCard(t, href, extra = []) {
  const s = t.stats;
  return h('li', { class: 'trail-item' },
    h('a', { href },
      h('div', { class: 'card' },
        h('div', { class: 'trail-title' }, t.name),
        h('div', { class: 'meta' }, [fmtKm(s.distance), `↑ ${s.ascent} m`, t.difficulty, t.distanceFromUserM != null && `${fmtKm(t.distanceFromUserM)} away`].filter(Boolean).join('  ·  ')),
        h('div', { class: 'badges' },
          h('span', { class: 'badge' }, t.source === 'glasses' ? 'Recorded on glasses' : t.source === 'gpx' ? 'GPX import' : t.source === 'demo' ? 'Demo' : 'Recorded on phone'),
          (t.waypoints?.length ?? t.waypointCount) > 0 && h('span', { class: 'badge' }, `${t.waypoints?.length ?? t.waypointCount} waypoints`),
          t.author && h('span', { class: 'badge' }, `by ${t.author}`),
          extra))));
}

/* ───────────────────────── views ───────────────────────── */

async function homeView(root, ctx) {
  const [all, draft] = await Promise.all([localTrails.list(), localTrails.get(DRAFT_ID)]);
  const mine = all.filter((t) => t.id !== DRAFT_ID).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const importInput = h('input', { type: 'file', accept: '.gpx,application/gpx+xml,text/xml', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const t = validateTrail(gpxToTrail(await file.text(), { author: settings.get('author', '') }));
      t.id = crypto.randomUUID();
      await localTrails.put(t);
      location.hash = `#/trail/local/${t.id}`;
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'warn');
    }
    e.target.value = '';
  } });

  const sharedList = h('ul', { class: 'trail-list' });
  const sharedStatus = h('p', { class: 'muted small' }, 'Loading shared trails…');
  const loadShared = async (pos) => {
    sharedStatus.textContent = pos ? 'Shared trails near you' : 'Recently shared trails';
    try {
      const rows = await remoteTrails.nearby(pos ?? {});
      if (ctx.cancelled) return;
      sharedList.replaceChildren(...rows.map((t) => trailCard(t, `#/trail/shared/${t.id}`, h('span', { class: 'badge' }, 'Shared'))));
      if (!rows.length) sharedList.replaceChildren(h('li', { class: 'empty' }, pos ? 'No shared trails within 100 km yet. Record the first one!' : 'Nothing shared yet. Record a trail and publish it.'));
    } catch {
      if (ctx.cancelled) return;
      sharedStatus.textContent = 'Sharing server unreachable. Your saved trails still work offline.';
      sharedList.replaceChildren();
    }
  };
  loadShared(settings.get('lastPos', null));

  add(root, 
    h('section', { class: 'hero' },
      h('h1', {}, 'Hike it once. Guide everyone after.'),
      h('p', {}, 'Record a trail as you walk. Anyone following it later, on Meta glasses or their phone, gets arrows that keep them on the path.')),
    draft?.points?.length > 1 && h('div', { class: 'card stack', style: { marginBottom: '12px' } },
      h('div', {}, h('b', {}, 'Unfinished recording'), h('div', { class: 'meta' }, `${fmtKm(draft.distance ?? 0)} · ${draft.points.length} points`)),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: '#/record?resume=1' }, 'Resume'),
        h('button', { class: 'btn', onclick: async () => { await localTrails.remove(DRAFT_ID); ctx.rerender(); } }, 'Discard'))),
    h('div', { class: 'row' },
      h('a', { class: 'btn primary grow', href: '#/record' }, '● Record a trail'),
      h('button', { class: 'btn', onclick: () => importInput.click() }, 'Import GPX'),
      h('button', { class: 'btn', onclick: async () => {
        const origin = (await getPositionOnce(2500)) ?? settings.get('lastPos', DEFAULT_ORIGIN);
        const t = makeDemoTrail(origin);
        await localTrails.put(t);
        location.hash = `#/trail/local/${t.id}`;
      } }, 'Try demo trail'),
      importInput),
    h('h2', {}, 'Your trails'),
    mine.length
      ? h('ul', { class: 'trail-list' }, mine.map((t) => trailCard(t, `#/trail/local/${t.id}`, t.published && h('span', { class: 'badge' }, 'Published'))))
      : h('div', { class: 'empty' }, 'No trails yet. Record one, import a GPX file, or try the demo trail.'),
    h('div', { class: 'row spread' },
      h('h2', {}, 'Shared trails'),
      h('button', { class: 'btn', onclick: async (e) => {
        e.target.disabled = true;
        const pos = await getPositionOnce();
        e.target.disabled = false;
        if (!pos) return toast('Could not get your location', 'warn');
        loadShared(pos);
      } }, 'Near me')),
    sharedStatus,
    sharedList,
    h('h2', {}, 'Wearing Meta glasses?'),
    h('div', { class: 'card stack small' },
      h('p', {}, h('b', {}, 'Today: '), 'pair your glasses over Bluetooth and turn on voice. Turn-by-turn cues (“Turn left in 40 metres”, “Off trail, follow the arrow back”) play through the glasses’ speakers, so your eyes stay on the trail. (Keep the app open with the screen on: browsers can’t track GPS reliably in the background.)'),
      h('p', {}, h('b', {}, 'Display glasses: '), 'the guide screen shows exactly the arrow frame a heads-up display would draw. The adapter to push it to the glasses is stubbed; see the README.'),
      h('p', { class: 'disclosure' }, 'Recording never films people: only your GPS track is stored, and photos are taken one at a time, on purpose, and stay on your device unless you choose to include them when publishing.')),
    h('label', { class: 'toggle', style: { marginTop: '22px' } },
      h('input', { type: 'checkbox', checked: simEnabled(), onchange: (e) => { settings.set('sim', e.target.checked); toast(e.target.checked ? 'GPS simulation on: recording and guiding will use a simulated walker' : 'GPS simulation off'); } }),
      'Simulate GPS (for demos on a desktop)'),
  );
}

async function recordView(root, ctx, query) {
  const sim = simEnabled();
  const draft = query.get('resume') ? await localTrails.get(DRAFT_ID) : null;
  let recorder = draft ? Recorder.restore(draft) : new Recorder();
  let lastFix = null;
  let error = null;
  const origin = settings.get('lastPos', DEFAULT_ORIGIN);

  const status = h('div', { class: 'banner' }, 'Waiting for a GPS fix…');
  const vTime = h('b', {}, '0:00');
  const vDist = h('b', {}, '0 m');
  const vPts = h('b', {}, '0');
  const vAcc = h('b', {}, '–');
  const canvas = h('canvas', { class: 'map', role: 'img', 'aria-label': 'Live map of the trail you are recording' });

  const paint = () => {
    if (!lastFix && !recorder.points.length) return;
    const now = sim && lastFix ? lastFix.t : Date.now();
    vTime.textContent = recorder.startedAt ? fmtDuration((now - recorder.startedAt) / 1000) : '0:00';
    vDist.textContent = fmtKm(recorder.distance);
    vPts.textContent = String(recorder.points.length);
    vAcc.textContent = lastFix?.accuracy != null ? `±${Math.round(lastFix.accuracy)} m` : '–';
    drawMap(canvas, { breadcrumb: recorder.points, waypoints: recorder.waypoints, position: lastFix ?? recorder.last, heading: lastFix?.heading ?? undefined });
  };

  const onFix = (fix) => {
    lastFix = fix;
    error = null;
    settings.set('lastPos', { lat: fix.lat, lng: fix.lng });
    recorder.addFix(fix);
    status.className = 'banner ok';
    status.textContent = fix.accuracy > 30 ? `Weak GPS (±${Math.round(fix.accuracy)} m): points are being skipped until it improves` : 'Recording. Screen stays on.';
    paint();
  };
  const onError = (err) => {
    error = err;
    status.className = 'banner';
    status.textContent = gpsErrorText(err);
  };

  const demo = sim ? toPoints(makeDemoTrail(origin)) : null;
  const src = startFixes({ sim, points: demo, onFix, onError, walkerOpts: { noiseM: 1.5, seed: 5, speedMps: 6 }, tickMs: 100 });
  const release = await keepAwake();
  const ticker = setInterval(paint, 1000);
  const saveDraft = () => recorder.points.length > 1 && localTrails.put({ id: DRAFT_ID, ...recorder.snapshot() }).catch(() => {});
  const autosave = setInterval(saveDraft, 10000);
  const onHide = () => document.visibilityState === 'hidden' && saveDraft();
  document.addEventListener('visibilitychange', onHide);
  ctx.onCleanup(() => {
    src.stop();
    release();
    clearInterval(ticker);
    clearInterval(autosave);
    document.removeEventListener('visibilitychange', onHide);
  });

  const mark = (kind, text = '', photo) => {
    try {
      recorder.addWaypoint({ kind, text, photo, at: lastFix ?? undefined });
      toast(`${labelForKind(kind)} marked`);
      paint();
    } catch (err) {
      toast(err.message, 'warn');
    }
  };
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      mark('photo', '', await photoToDataUrl(file));
    } catch (err) {
      toast(`Photo failed: ${err.message}`, 'warn');
    }
  } });

  const finish = async () => {
    if (!recorder.canFinish) return toast('Walk a little further first: need at least two points.', 'warn');
    const res = await formDialog({
      title: 'Save trail',
      fields: [
        { name: 'name', label: 'Name', value: `Trail ${new Date().toLocaleDateString()}` },
        { name: 'difficulty', label: 'Difficulty', type: 'select', options: ['easy', 'moderate', 'hard'], value: 'moderate' },
        { name: 'description', label: 'Notes for other hikers', type: 'textarea', value: '', max: 2000 },
        { name: 'author', label: 'Your display name (optional)', value: settings.get('author', ''), max: 40 },
      ],
      ok: 'Save trail',
    });
    if (!res) return;
    settings.set('author', res.author);
    const trail = recorder.finish({ ...res, source: metaDisplay.available() ? 'glasses' : 'phone' });
    await localTrails.put(trail);
    await localTrails.remove(DRAFT_ID);
    location.hash = `#/trail/local/${trail.id}`;
  };

  add(root, 
    h('h1', {}, 'Recording'),
    status,
    h('div', { class: 'stats', style: { margin: '12px 0' } },
      h('div', { class: 'stat' }, vTime, h('span', {}, 'Time')),
      h('div', { class: 'stat' }, vDist, h('span', {}, 'Distance')),
      h('div', { class: 'stat' }, vPts, h('span', {}, 'Points')),
      h('div', { class: 'stat' }, vAcc, h('span', {}, 'GPS'))),
    canvas,
    h('h2', {}, 'Mark this spot'),
    h('div', { class: 'kinds' },
      ['water', 'view', 'hazard', 'junction'].map((k) => h('button', { class: 'btn', onclick: () => mark(k) }, h('span', { class: `kind kind-${k}` }, { water: 'W', view: 'V', hazard: '!', junction: 'Y' }[k]), labelForKind(k))),
      h('button', { class: 'btn', onclick: async () => {
        const r = await formDialog({ title: 'Add a note', fields: [{ name: 'text', label: 'Note', type: 'textarea', value: '' }], ok: 'Add' });
        if (r?.text) mark('note', r.text);
      } }, h('span', { class: 'kind kind-note' }, 'N'), 'Note'),
      h('button', { class: 'btn', onclick: () => photoInput.click() }, h('span', { class: 'kind kind-photo' }, 'P'), 'Photo'),
      photoInput),
    h('div', { class: 'row', style: { marginTop: '22px' } },
      h('button', { class: 'btn primary grow big', onclick: finish }, 'Finish & save'),
      h('button', { class: 'btn danger', onclick: async () => {
        const ok = await formDialog({ title: 'Discard this recording?', intro: 'The track recorded so far will be deleted.', ok: 'Discard', danger: true });
        if (!ok) return;
        await localTrails.remove(DRAFT_ID);
        location.hash = '#/';
      } }, 'Discard')),
    sim && h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'Simulating a walk with GPS noise. Switch it off on the home screen to use real GPS.'),
  );
  requestAnimationFrame(paint);
  if (draft) toast('Resumed your unfinished recording');
  return { redraw: paint, error: () => error };
}

async function trailView(root, ctx, kind, id) {
  const loaded = await loadTrail(kind, id).catch((err) => ({ error: err.message }));
  if (!loaded || loaded.error) {
    add(root, h('h1', {}, 'Trail not found'), h('p', { class: 'muted' }, loaded?.error ?? 'It may have been unpublished.'), h('a', { class: 'btn', href: '#/' }, 'Back'));
    return;
  }
  let { trail, saved } = loaded;
  const pts = toPoints(trail);
  const s = trail.stats;

  const map = h('canvas', { class: 'map', role: 'img', 'aria-label': `Map of ${trail.name}` });
  const elev = h('canvas', { class: 'elev', role: 'img', 'aria-label': 'Elevation profile' });

  const actions = h('div', { class: 'row' });
  const renderActions = () => {
    actions.replaceChildren(
      h('a', { class: 'btn primary grow big', href: `#/guide/${kind}/${id}` }, '▶ Follow this trail'),
      h('a', { class: 'btn', href: `#/guide/${kind}/${id}?reverse=1` }, 'Follow in reverse'),
    );
  };
  renderActions();

  const secondary = h('div', { class: 'row', style: { marginTop: '10px' } });
  const renderSecondary = () => {
    set(secondary, 
      !saved && h('button', { class: 'btn', onclick: async () => {
        trail = { ...trail, origin: 'shared' };
        await localTrails.put(trail);
        saved = true;
        toast('Saved for offline use');
        renderSecondary();
      } }, 'Save offline'),
      saved && trail.origin === 'shared' && h('span', { class: 'badge' }, 'Saved offline'),
      saved && trail.origin !== 'shared' && !trail.published && h('button', { class: 'btn', onclick: publish }, 'Publish for other hikers'),
      trail.published && h('button', { class: 'btn', onclick: copyLink }, 'Copy share link'),
      trail.published && h('button', { class: 'btn', onclick: unpublish }, 'Unpublish'),
      h('button', { class: 'btn', onclick: () => download(`${slug(trail.name)}.gpx`, trailToGpx(trail), 'application/gpx+xml') }, 'Export GPX'),
      saved && h('button', { class: 'btn danger', onclick: remove }, 'Delete'),
    );
  };

  async function publish() {
    const hasPhotos = trail.waypoints.some((w) => w.photo);
    const res = await formDialog({
      title: 'Publish this trail',
      intro: 'Anyone will be able to find it by location and follow it. Your track, waypoints and notes become public.',
      fields: [
        { name: 'name', label: 'Name', value: trail.name },
        hasPhotos && { name: 'photos', label: 'Include photos', type: 'checkbox', value: false, help: 'Photos may show people or identifying places. Only include ones you are comfortable sharing.' },
      ].filter(Boolean),
      ok: 'Publish',
    });
    if (!res) return;
    try {
      const payload = { ...trail, name: res.name || trail.name, waypoints: trail.waypoints.map(({ photo, ...w }) => (res.photos && photo ? { ...w, photo } : w)) };
      delete payload.id;
      delete payload.published;
      const out = await remoteTrails.publish(payload);
      trail = { ...trail, published: { id: out.id, deleteToken: out.deleteToken, at: new Date().toISOString() } };
      await localTrails.put(trail);
      toast('Published');
      renderSecondary();
    } catch (err) {
      toast(`Could not publish: ${err.message}`, 'warn', 5000);
    }
  }
  async function copyLink() {
    const url = `${location.origin}/#/trail/shared/${trail.published.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast(url, '', 8000);
    }
  }
  async function unpublish() {
    try {
      await remoteTrails.unpublish(trail.published.id, trail.published.deleteToken);
    } catch (err) {
      if (!/not found/i.test(err.message)) return toast(`Could not unpublish: ${err.message}`, 'warn', 5000);
    }
    trail = { ...trail };
    delete trail.published;
    await localTrails.put(trail);
    toast('Unpublished');
    renderSecondary();
  }
  async function remove() {
    if (!(await formDialog({ title: `Delete “${trail.name}”?`, intro: trail.published ? 'It stays published until you unpublish it.' : 'This cannot be undone.', ok: 'Delete', danger: true }))) return;
    await localTrails.remove(trail.id);
    location.hash = '#/';
  }
  renderSecondary();

  add(root, 
    h('a', { href: '#/', class: 'muted small' }, '← All trails'),
    h('h1', { style: { margin: '6px 0 2px' } }, trail.name),
    h('div', { class: 'meta' }, [trail.author && `by ${trail.author}`, trail.source === 'glasses' ? 'recorded on glasses' : trail.source === 'demo' ? 'synthetic demo' : null, new Date(trail.createdAt).toLocaleDateString()].filter(Boolean).join(' · ')),
    trail.description && h('p', { style: { marginTop: '10px', whiteSpace: 'pre-wrap' } }, trail.description),
    h('div', { class: 'stats', style: { margin: '14px 0' } }, stat(fmtKm(s.distance), 'Distance'), stat(`+${s.ascent} m`, 'Ascent'), stat(`−${s.descent} m`, 'Descent'), stat(s.durationS != null ? fmtDuration(s.durationS) : '–', 'Recorded time'), stat(trail.difficulty, 'Difficulty')),
    map,
    h('h2', {}, 'Elevation'),
    elev,
    h('div', { style: { marginTop: '16px' } }, actions, secondary),
    h('h2', {}, `Waypoints (${trail.waypoints.length})`),
    trail.waypoints.length
      ? h('ul', { class: 'wp-list' }, trail.waypoints.map((w) => h('li', { class: 'wp' },
        h('span', { class: `kind kind-${w.kind}` }, { water: 'W', view: 'V', hazard: '!', junction: 'Y', photo: 'P', note: 'N' }[w.kind] ?? 'N'),
        h('div', { class: 'grow' }, h('b', {}, labelForKind(w.kind)), w.text && h('div', {}, w.text)),
        w.photo && h('img', { src: w.photo, alt: `${labelForKind(w.kind)} photo`, loading: 'lazy' }))))
      : h('p', { class: 'muted' }, 'No waypoints on this trail.'),
  );
  const paint = () => {
    drawMap(map, { points: pts, waypoints: trail.waypoints });
    drawElevation(elev, pts);
  };
  requestAnimationFrame(paint);
  return { redraw: paint };
}

async function guideView(root, ctx, kind, id, query) {
  const loaded = await loadTrail(kind, id).catch((err) => ({ error: err.message }));
  if (!loaded || loaded.error) {
    add(root, h('h1', {}, 'Trail not found'), h('a', { class: 'btn', href: '#/' }, 'Back'));
    return;
  }
  const reverse = query.get('reverse') === '1';
  const trail = reverse ? reverseTrail(loaded.trail) : loaded.trail;
  const pts = toPoints(trail);
  const back = `#/trail/${kind}/${id}`;

  const gate = h('div', { class: 'stack' });
  const live = h('div');
  add(root, gate, live);

  const voiceBox = h('input', { type: 'checkbox', checked: voice.enabled && voice.available(), disabled: !voice.synth, onchange: (e) => { voice.enabled = e.target.checked; settings.set('voice', voice.enabled); } });
  const compassBox = h('input', { type: 'checkbox', checked: settings.get('compass', true) });
  const simBox = h('input', { type: 'checkbox', checked: simEnabled(), onchange: (e) => settings.set('sim', e.target.checked) });

  gate.append(
    h('a', { href: back, class: 'muted small' }, '← Back to trail'),
    h('h1', {}, reverse ? 'Follow in reverse' : 'Follow trail'),
    h('div', { class: 'card' },
      h('div', { class: 'trail-title' }, trail.name),
      h('div', { class: 'meta' }, `${fmtKm(trail.stats.distance)} · ↑ ${trail.stats.ascent} m · ${trail.waypoints.length} waypoints`)),
    h('div', { class: 'card stack' },
      h('label', { class: 'toggle' }, voiceBox, 'Spoken cues (plays through paired Meta glasses)'),
      h('label', { class: 'toggle' }, compassBox, 'Use phone compass for the arrow (otherwise it follows your direction of travel)'),
      h('label', { class: 'toggle' }, simBox, 'Simulate GPS (demo on a desktop)')),
    h('button', { class: 'btn primary big', onclick: () => start() }, 'Start guidance'),
    h('p', { class: 'muted small' }, 'Keep the screen on and stay on the marked path. This is a navigation aid, not a substitute for judgement, a map and enough water.'),
  );

  async function start() {
    gate.remove();
    voice.enabled = voiceBox.checked;
    const sim = simBox.checked;
    const useCompass = compassBox.checked && !sim;
    settings.set('compass', compassBox.checked);
    settings.set('sim', sim);
    refreshChip();

    const guide = new Guide(pts, trail.waypoints);
    const compass = new Compass();
    const filter = new HeadingFilter(0.2);
    let compassOk = false;
    if (useCompass) compassOk = await compass.start(); // inside the click gesture: iOS shows its permission prompt
    ctx.onCleanup(() => compass.stop());

    const hudBox = h('div', { class: 'hud', role: 'img', 'aria-label': 'Guidance arrow' });
    const hud = createHud(hudBox);
    const bridge = new GlassesBridge([voice, haptic, new PreviewAdapter(hud), metaDisplay]);
    const toggleFull = async () => {
      const on = document.body.classList.toggle('hud-full');
      try {
        if (on) await document.documentElement.requestFullscreen?.();
        else if (document.fullscreenElement) await document.exitFullscreen();
      } catch { /* fullscreen is optional */ }
    };
    ctx.onCleanup(() => {
      document.body.classList.remove('hud-full');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      voice.synth?.cancel();
    });

    const line = h('div', { class: 'guide-line' }, 'Finding GPS…');
    const sub = h('div', { class: 'muted small', style: { textAlign: 'center' } });
    const bar = h('i');
    const nextWp = h('div', { class: 'card small' }, 'No waypoints ahead');
    const banner = h('div', { class: 'banner', hidden: true });
    const map = h('canvas', { class: 'map short', role: 'img', 'aria-label': 'Map of your position on the trail' });
    let zoomFit = false;

    let state = { status: 'acquiring', events: [] };
    let lastFix = null;
    let headingInfo = { deg: null, source: 'none' };

    const currentHeading = () => {
      headingInfo = pickHeading({
        glasses: bridge.glassesHeading(),
        compass: compassOk ? filter.value : null,
        course: lastFix?.heading ?? null,
        speedMps: sim ? 3 : lastFix?.speed,
      });
      return headingInfo.deg;
    };

    const render = (events = []) => {
      const frame = hudFrame(state, currentHeading());
      bridge.push(frame, events);
      line.textContent = [frame.headline, frame.distance].filter(Boolean).join(' ');
      const eta = state.remaining != null ? Math.max(1, Math.round(state.remaining / 66)) : null; // ~4 km/h
      sub.textContent = [
        frame.remaining,
        eta && state.status !== 'arrived' ? `≈ ${eta} min` : null,
        headingInfo.source === 'compass' ? 'arrow follows phone compass' : headingInfo.source === 'gps-course' ? 'arrow follows your direction of travel' : headingInfo.source === 'glasses' ? 'arrow follows your head' : state.targetBearing != null ? `north-up arrow: ${compassName(state.targetBearing)}` : '',
        lastFix?.accuracy != null ? `GPS ±${Math.round(lastFix.accuracy)} m` : null,
      ].filter(Boolean).join(' · ');
      bar.style.setProperty('width', `${Math.round((state.progress ?? 0) * 100)}%`);
      const nw = state.nextWaypoint;
      nextWp.replaceChildren(nw ? h('span', {}, h('b', {}, `Next: ${labelForKind(nw.waypoint.kind)}`), ` in ${formatDistance(nw.distance)}`, nw.waypoint.text ? ` · ${nw.waypoint.text}` : '') : 'No waypoints ahead');
      banner.hidden = !['off-trail', 'arrived', 'weak-gps'].includes(state.status);
      banner.className = `banner ${state.status === 'arrived' ? 'ok' : ''}`;
      banner.textContent = { 'off-trail': `You are ${formatDistance(state.offDistance ?? 0)} off the trail. Follow the arrow back.`, arrived: 'You have reached the end of the trail.', 'weak-gps': 'GPS signal is weak: guidance paused until it improves.' }[state.status] ?? '';
      drawMap(map, { points: pts, waypoints: trail.waypoints, position: lastFix, heading: headingInfo.deg ?? undefined, along: state.along, follow: zoomFit || !lastFix ? undefined : 140 });
    };

    const onFix = (fix) => {
      lastFix = fix;
      state = guide.update(fix);
      if (state.events.length) {
        const first = state.events[0];
        if (first.type === 'off-trail') toast('Off trail: follow the arrow back', 'warn');
      }
      render(state.events);
    };
    const onError = (err) => {
      banner.hidden = false;
      banner.className = 'banner';
      banner.textContent = gpsErrorText(err);
    };

    const src = startFixes({ sim, points: pts, onFix, onError, walkerOpts: { noiseM: 2.5, seed: 21, speedMps: 3 } });
    const release = await keepAwake();
    ctx.onCleanup(() => {
      src.stop();
      release();
    });
    if (useCompass) {
      let queued = false;
      const off = compass.onChange((deg) => {
        filter.push(deg);
        if (!queued) {
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            const frame = hudFrame(state, currentHeading());
            if (state.status !== 'acquiring') hud.update(frame);
          });
        }
      });
      ctx.onCleanup(off);
      if (!compassOk) toast('Compass unavailable: the arrow will follow your direction of travel', 'warn', 4500);
    }

    const simControls = sim && src.walker && h('div', { class: 'card stack' },
      h('b', {}, 'Simulator'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { src.walker.lateralM = 70; toast('Walker is wandering 70 m off the trail'); } }, 'Wander off'),
        h('button', { class: 'btn', onclick: () => { src.walker.lateralM = 0; } }, 'Return to trail'),
        h('button', { class: 'btn', onclick: () => { src.walker.along = Math.min(src.walker.path.total - 30, src.walker.along + 250); } }, 'Skip ahead 250 m')));

    add(live, 
      h('div', { class: 'hud-wrap' }, hudBox, h('button', { class: 'btn hud-exit', onclick: toggleFull }, 'Exit glasses view')),
      line, sub,
      h('div', { class: 'progress', style: { margin: '12px 0' } }, bar),
      banner,
      h('div', { class: 'stack', style: { marginTop: '12px' } },
        nextWp,
        map,
        simControls,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: toggleFull }, 'Glasses view'),
          h('button', { class: 'btn', onclick: (e) => { zoomFit = !zoomFit; e.target.textContent = zoomFit ? 'Follow me' : 'Whole trail'; render(); } }, 'Whole trail'),
          h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: voice.enabled, disabled: !voice.synth, onchange: (e) => { voice.enabled = e.target.checked; settings.set('voice', voice.enabled); if (!voice.enabled) voice.synth?.cancel(); } }), 'Voice'),
          h('a', { class: 'btn danger', href: back }, 'End'))),
    );
    render();
    voice.speak(`Starting ${trail.name}. ${fmtKm(trail.stats.distance)}.`);
  }
}

/* ───────────────────────── router ───────────────────────── */

let cleanups = [];
let renderToken = 0;

async function route() {
  const token = ++renderToken;
  for (const fn of cleanups.splice(0)) {
    try { fn(); } catch { /* ignore */ }
  }
  const ctx = {
    cancelled: false,
    onCleanup: (fn) => cleanups.push(fn),
    rerender: () => route(),
  };
  cleanups.push(() => { ctx.cancelled = true; });
  document.body.classList.remove('hud-full');
  $app.replaceChildren();

  const raw = location.hash.replace(/^#\/?/, '');
  const [pathStr, queryStr = ''] = raw.split('?');
  const parts = pathStr.split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(queryStr);
  const box = h('div');
  $app.append(box);
  try {
    let view;
    if (parts[0] === 'record') view = await recordView(box, ctx, query);
    else if (parts[0] === 'trail' && parts[2]) view = await trailView(box, ctx, parts[1], parts[2]);
    else if (parts[0] === 'guide' && parts[2]) view = await guideView(box, ctx, parts[1], parts[2], query);
    else view = await homeView(box, ctx);
    if (token !== renderToken) return;
    ctx.view = view;
    currentView = view;
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    box.replaceChildren(h('h1', {}, 'Something went wrong'), h('p', { class: 'muted' }, err.message), h('a', { class: 'btn', href: '#/' }, 'Back to trails'));
  }
}
let currentView = null;

window.addEventListener('hashchange', route);
window.addEventListener('resize', () => currentView?.redraw?.());
refreshChip();
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

