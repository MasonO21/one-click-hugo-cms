// GPX 1.1 export/import so trails can move in and out of other apps (Gaia, Komoot, watches...).
// The parser is regex-based on purpose: it runs identically in the browser and in Node tests,
// and GPX track/waypoint structure is simple and regular.

import { KINDS, makeTrail } from './trail.js';

const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function trailToGpx(trail) {
  const trkpts = trail.points
    .map(([lat, lng, ele, t]) => {
      const inner = (ele != null ? `<ele>${ele}</ele>` : '') + (t != null ? `<time>${new Date(t).toISOString()}</time>` : '');
      return `      <trkpt lat="${lat}" lon="${lng}">${inner}</trkpt>`;
    })
    .join('\n');
  const wpts = trail.waypoints
    .map(
      (w) =>
        `  <wpt lat="${w.lat}" lon="${w.lng}">${w.ele != null ? `<ele>${w.ele}</ele>` : ''}<name>${esc(w.text || w.kind)}</name><type>${esc(w.kind)}</type></wpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Waypath" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(trail.name)}</name>${trail.description ? `<desc>${esc(trail.description)}</desc>` : ''}</metadata>
${wpts}${wpts ? '\n' : ''}  <trk>
    <name>${esc(trail.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[2] ?? m[3]) : null;
};
const child = (body, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(body);
  return m ? unesc(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()) : null;
};

/** Every <tag lat=".." lon=".."> ... </tag> (or self-closing) element, in document order. */
function* elements(xml, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    const open = m[1] ?? '';
    const lat = parseFloat(attr(open, 'lat'));
    const lng = parseFloat(attr(open, 'lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const body = m[2] ?? '';
    const ele = parseFloat(child(body, 'ele'));
    const time = child(body, 'time');
    const t = time ? Date.parse(time) : NaN;
    yield {
      lat,
      lng,
      ele: Number.isFinite(ele) ? ele : undefined,
      t: Number.isFinite(t) ? t : undefined,
      name: child(body, 'name'),
      type: child(body, 'type'),
      desc: child(body, 'desc'),
    };
  }
}

export function gpxToTrail(xml, { author = '' } = {}) {
  if (!/<gpx[\s>]/.test(xml)) throw new Error('Not a GPX file');
  let points = [...elements(xml, 'trkpt')];
  if (points.length < 2) points = [...elements(xml, 'rtept')];
  if (points.length < 2) throw new Error('GPX file has no track or route points');
  const waypoints = [...elements(xml, 'wpt')].map((w) => {
    const kind = KINDS.includes(w.type) ? w.type : 'note';
    return { lat: w.lat, lng: w.lng, ele: w.ele, kind, text: w.name || w.desc || '' };
  });
  const name = child(xml.match(/<trk>[\s\S]*?<\/trk>|<rte>[\s\S]*?<\/rte>/)?.[0] ?? '', 'name') || child(xml, 'name') || 'Imported trail';
  return makeTrail({ name, author, source: 'gpx', points, waypoints });
}
