#!/usr/bin/env python3
"""Upload the App Store screenshots and the app preview video to the app's version page in App Store Connect.

  python3 tools/asc_media.py check    # read only: reports the version, its sets and what would be uploaded
  python3 tools/asc_media.py upload   # uploads what is missing; safe to run again (skips files already there)

English (U.S.) page of the iOS version that is still being prepared:
  appstore/screenshots/iphone-6.9/*.png  -> 6.9" iPhone set (APP_IPHONE_67)
  appstore/screenshots/ipad-13/*.png     -> 13" iPad set (APP_IPAD_PRO_3GEN_129)
  appstore/trailer/app-preview-886x1920.mp4 -> iPhone app preview (IPHONE_67)
The version number in App Store Connect must equal the build's (VERSION in release.config.json) for the build
to be selectable; upload mode renames the version to match if it differs.
Credentials: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8. Needs: pip install pyjwt cryptography requests
"""
import base64, hashlib, json, pathlib, re, os, sys, time

import jwt
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = 'https://api.appstoreconnect.apple.com'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'check'
if MODE not in ('check', 'upload'):
    sys.exit('usage: asc_media.py check|upload')
UPLOAD = MODE == 'upload'
LOCALE = 'en-US'
SETS = [('APP_IPHONE_67', ROOT / 'appstore' / 'screenshots' / 'iphone-6.9', (1320, 2868)),
        ('APP_IPAD_PRO_3GEN_129', ROOT / 'appstore' / 'screenshots' / 'ipad-13', (2064, 2752))]
PREVIEW = ('IPHONE_67', ROOT / 'appstore' / 'trailer' / 'app-preview-886x1920.mp4', '00:00:10:00')   # poster: the bounty chase
EDITABLE = {'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'}
problems = []


def die(msg):
    print('::error::' + msg)
    sys.exit(1)


def warn(msg):
    print('::warning::' + msg)
    problems.append(msg)


def note(msg):
    print('  ' + msg)


def load_key():
    raw = os.environ.get('ASC_KEY_P8', '')
    kid = re.sub(r'\s+', '', os.environ.get('ASC_KEY_ID', '')).strip('"\'').upper()
    iss = re.sub(r'\s+', '', os.environ.get('ASC_ISSUER_ID', '')).strip('"\'')
    if not (raw and kid and iss):
        die('Missing secrets ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 (see docs/BUILD_WITHOUT_A_MAC.md).')
    s = raw.replace('\\n', '\n').replace('\r', '').strip().strip('"\'')
    body = re.sub(r'\s+', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', s))
    b64 = base64.b64encode(base64.b64decode(body + '=' * (-len(body) % 4))).decode()
    return kid, iss, '-----BEGIN PRIVATE KEY-----\n' + '\n'.join(b64[i:i + 64] for i in range(0, len(b64), 64)) + '\n-----END PRIVATE KEY-----\n'


KID, ISS, PEM = load_key()
_tok = {'v': None, 'exp': 0}


def token():
    now = int(time.time())
    if now > _tok['exp'] - 60:
        _tok['exp'] = now + 15 * 60
        _tok['v'] = jwt.encode({'iss': ISS, 'iat': now, 'exp': _tok['exp'], 'aud': 'appstoreconnect-v1'}, PEM,
                               algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
    return _tok['v']


class ApiError(Exception):
    def __init__(self, status, text):
        try:
            errs = json.loads(text).get('errors', [])
            text = '; '.join('%s: %s' % (e.get('title', ''), e.get('detail', '')) for e in errs) or text
        except Exception:
            pass
        super().__init__('HTTP %s %s' % (status, text[:800]))


def call(method, path, body=None, params=None, ok404=False):
    for attempt in range(4):
        r = requests.request(method, path if path.startswith('http') else API + path, params=params,
                             headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'},
                             data=json.dumps(body) if body is not None else None, timeout=120)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt * 3)
            continue
        break
    if ok404 and r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise ApiError(r.status_code, r.text)
    return r.json() if r.text else {}


def get_all(path, params=None):
    out, data = [], call('GET', path, params=params)
    while True:
        out += data.get('data', [])
        nxt = data.get('links', {}).get('next')
        if not nxt:
            return out
        data = call('GET', nxt)


def rel(t, i):
    return {'data': {'type': t, 'id': i}}


def upload_asset(kind, f, attrs, owner_rel, owner_type, owner_id):
    """Reserve, upload the parts, then commit. kind: appScreenshots or appPreviews."""
    data = f.read_bytes()
    res = call('POST', '/v1/' + kind, {'data': {'type': kind, 'attributes': dict({'fileName': f.name, 'fileSize': len(data)}, **attrs),
                                                'relationships': {owner_rel: rel(owner_type, owner_id)}}})['data']
    for op in res['attributes'].get('uploadOperations') or []:
        r = requests.request(op['method'], op['url'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])},
                             data=data[op['offset']:op['offset'] + op['length']], timeout=300)
        if r.status_code >= 400:
            raise ApiError(r.status_code, r.text)
    call('PATCH', '/v1/%s/%s' % (kind, res['id']), {'data': {'type': kind, 'id': res['id'], 'attributes': {
        'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    return res['id']


def png_size(f):
    b = f.read_bytes()[:24]
    return int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')


CFG = json.loads((ROOT / 'release.config.json').read_text())
BUNDLE, VERSION = CFG['BUNDLE_ID'], CFG['VERSION']
apps = [a for a in call('GET', '/v1/apps', params={'filter[bundleId]': BUNDLE}).get('data', []) if a['attributes'].get('bundleId') == BUNDLE]
if not apps:
    die('No app with bundle ID %s in App Store Connect.' % BUNDLE)
APP = apps[0]['id']
print('App: %s (%s)' % (apps[0]['attributes'].get('name'), BUNDLE))

versions = get_all('/v1/apps/%s/appStoreVersions' % APP, {'filter[platform]': 'IOS', 'limit': 50})
open_v = [v for v in versions if v['attributes'].get('appStoreState') in EDITABLE or v['attributes'].get('appVersionState') in ('PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_REJECTED')]
if not open_v:
    die('No iOS version that can still be edited. States: %s' % ', '.join('%s %s' % (v['attributes'].get('versionString'), v['attributes'].get('appStoreState')) for v in versions))
ver = open_v[0]
vid, vstr = ver['id'], ver['attributes'].get('versionString')
print('Version: %s (%s)' % (vstr, ver['attributes'].get('appStoreState')))
if vstr != VERSION:
    if UPLOAD:
        call('PATCH', '/v1/appStoreVersions/%s' % vid, {'data': {'type': 'appStoreVersions', 'id': vid, 'attributes': {'versionString': VERSION}}})
        note('renamed version %s -> %s so it matches the build' % (vstr, VERSION))
    else:
        note('version %s differs from the build version %s: upload mode will rename it' % (vstr, VERSION))

locs = get_all('/v1/appStoreVersions/%s/appStoreVersionLocalizations' % vid)
loc = next((l for l in locs if l['attributes'].get('locale') == LOCALE), None)
if not loc:
    die('The version has no %s page (found: %s). Was the app created with English (U.S.) as its primary language?'
        % (LOCALE, ', '.join(l['attributes'].get('locale') for l in locs) or 'none'))
lid = loc['id']

# ---------- screenshots ----------
sets = {s['attributes']['screenshotDisplayType']: s for s in get_all('/v1/appStoreVersionLocalizations/%s/appScreenshotSets' % lid)}
for dtype, folder, size in SETS:
    files = sorted(folder.glob('*.png'))
    print('\nScreenshots %s: %d files in %s' % (dtype, len(files), folder.relative_to(ROOT)))
    bad = [f.name for f in files if png_size(f) != size]
    if bad:
        warn('%s: not %dx%d: %s' % (dtype, size[0], size[1], ', '.join(bad)))
        continue
    try:
        st = sets.get(dtype)
        have = {s['attributes'].get('fileName'): s for s in get_all('/v1/appScreenshotSets/%s/appScreenshots' % st['id'])} if st else {}
        for n, s in have.items():
            note('there: %s (%s)' % (n, (s['attributes'].get('assetDeliveryState') or {}).get('state')))
        todo = [f for f in files if f.name not in have]
        if have and todo and len(have) + len(todo) > 10:
            warn('%s already has %d screenshots; uploading %d more would pass the limit of 10. Delete the old ones in App Store Connect first.' % (dtype, len(have), len(todo)))
            continue
        if not todo:
            note('nothing to upload')
            continue
        if not UPLOAD:
            note('would upload: %s' % ', '.join(f.name for f in todo))
            continue
        if not st:
            st = call('POST', '/v1/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': dtype},
                                                                 'relationships': {'appStoreVersionLocalization': rel('appStoreVersionLocalizations', lid)}}})['data']
        for f in todo:
            upload_asset('appScreenshots', f, {}, 'appScreenshotSet', 'appScreenshotSets', st['id'])
            note('uploaded %s' % f.name)
    except ApiError as e:
        warn('%s: %s' % (dtype, e))

# ---------- app preview ----------
ptype, pfile, poster = PREVIEW
print('\nApp preview %s: %s' % (ptype, pfile.relative_to(ROOT)))
try:
    psets = {s['attributes']['previewType']: s for s in get_all('/v1/appStoreVersionLocalizations/%s/appPreviewSets' % lid)}
    ps = psets.get(ptype)
    have = {p['attributes'].get('fileName'): p for p in get_all('/v1/appPreviewSets/%s/appPreviews' % ps['id'])} if ps else {}
    for n, p in have.items():
        note('there: %s (%s, video %s)' % (n, (p['attributes'].get('assetDeliveryState') or {}).get('state'), p['attributes'].get('videoDeliveryState', {}) and p['attributes']['videoDeliveryState'].get('state')))
    if pfile.name in have:
        note('nothing to upload')
    elif have and len(have) >= 3:
        warn('%s already has 3 previews (the limit). Delete one in App Store Connect first.' % ptype)
    elif not UPLOAD:
        note('would upload: %s (%.1f MB), poster frame at %s' % (pfile.name, pfile.stat().st_size / 1e6, poster))
    else:
        if not ps:
            ps = call('POST', '/v1/appPreviewSets', {'data': {'type': 'appPreviewSets', 'attributes': {'previewType': ptype},
                                                             'relationships': {'appStoreVersionLocalization': rel('appStoreVersionLocalizations', lid)}}})['data']
        upload_asset('appPreviews', pfile, {'mimeType': 'video/mp4', 'previewFrameTimeCode': poster}, 'appPreviewSet', 'appPreviewSets', ps['id'])
        note('uploaded %s; Apple now processes the video (usually a few minutes)' % pfile.name)
except ApiError as e:
    warn('preview: %s' % e)

print()
if problems:
    print('%d problem(s), see the warnings above.' % len(problems))
    sys.exit(1)
print('Done. Check the version page in App Store Connect: screenshots appear at once, the video after processing.'
      if UPLOAD else 'Check finished. Run with "upload" to upload what is missing.')
