#!/usr/bin/env python3
"""Create Night Precinct's in-app purchases in App Store Connect through the App Store Connect API.

  python3 tools/asc_iap.py check    # read only: finds the app, lists what exists, checks the price points
  python3 tools/asc_iap.py create   # creates whatever is missing; safe to run again

Reads appstore/iap.json (the 15 one-time products, the Chief's Club subscription group and its weekly
subscription), the excluded countries in appstore/store.json and the App Review screenshots in
appstore/iap-review/<suffix>.png.
Credentials come from the environment: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the GitHub secrets).
Needs: pip install pyjwt cryptography requests

Product IDs and types are permanent in App Store Connect, so nothing here ever deletes or retypes a product.
Names, descriptions and prices can be changed later in App Store Connect.
"""
import base64, hashlib, json, os, pathlib, re, sys, time

import jwt
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = 'https://api.appstoreconnect.apple.com'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'check'
if MODE not in ('check', 'create'):
    sys.exit('usage: asc_iap.py check|create')
CREATE = MODE == 'create'


def die(msg):
    print('::error::' + msg)
    sys.exit(1)


# ---------- credentials (same clean-up as the TestFlight workflow) ----------
def load_key():
    raw = os.environ.get('ASC_KEY_P8', '')
    kid = re.sub(r'\s+', '', os.environ.get('ASC_KEY_ID', '')).strip('"\'').upper()
    iss = re.sub(r'\s+', '', os.environ.get('ASC_ISSUER_ID', '')).strip('"\'')
    if not (raw and kid and iss):
        die('Missing secrets ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 (see docs/BUILD_WITHOUT_A_MAC.md).')
    s = raw.replace('\\n', '\n').replace('\r', '').strip().strip('"\'')
    body = re.sub(r'\s+', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', s))
    der = base64.b64decode(body + '=' * (-len(body) % 4))
    b64 = base64.b64encode(der).decode()
    pem = '-----BEGIN PRIVATE KEY-----\n' + '\n'.join(b64[i:i + 64] for i in range(0, len(b64), 64)) + '\n-----END PRIVATE KEY-----\n'
    return kid, iss, pem


KID, ISS, PEM = load_key()
_token = {'value': None, 'exp': 0}


def token():
    now = int(time.time())
    if now > _token['exp'] - 60:
        _token['exp'] = now + 15 * 60
        _token['value'] = jwt.encode({'iss': ISS, 'iat': now, 'exp': _token['exp'], 'aud': 'appstoreconnect-v1'},
                                     PEM, algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
    return _token['value']


class ApiError(Exception):
    def __init__(self, status, text):
        self.status = status
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
                             data=json.dumps(body) if body is not None else None, timeout=60)
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


def rel(type_, id_):
    return {'data': {'type': type_, 'id': id_}}


# ---------- what we want ----------
SPEC = json.loads((ROOT / 'appstore' / 'iap.json').read_text())
EXCLUDED = sorted({t for group in json.loads((ROOT / 'appstore' / 'store.json').read_text())['excluded_territories'].values() for t in group})
CFG = json.loads((ROOT / 'release.config.json').read_text())
BUNDLE = CFG['BUNDLE_ID']
if 'yourcompany' in BUNDLE:
    die('Set BUNDLE_ID in release.config.json first.')
SHOTS = ROOT / 'appstore' / 'iap-review'
problems = []


def note(msg):
    print('  ' + msg)


def warn(msg):
    print('::warning::' + msg)
    problems.append(msg)


# ---------- the app ----------
apps = call('GET', '/v1/apps', params={'filter[bundleId]': BUNDLE}).get('data', [])
apps = [a for a in apps if a['attributes'].get('bundleId') == BUNDLE]
if not apps:
    die('No app with bundle ID %s in App Store Connect. Create it first: Apps > + > New App (docs/BUILD_WITHOUT_A_MAC.md step 4).' % BUNDLE)
APP = apps[0]['id']
print('App: %s (%s), id %s' % (apps[0]['attributes'].get('name'), BUNDLE, APP))

territories = sorted(t['id'] for t in get_all('/v1/territories', {'limit': 200}))
available = [t for t in territories if t not in EXCLUDED]
print('Territories: %d, selling in %d (not in %s)' % (len(territories), len(available), ', '.join(EXCLUDED)))


def screenshot_file(suffix):
    f = SHOTS / (suffix + '.png')
    return f if f.exists() else None


def upload_screenshot(kind, owner_rel, owner_type, owner_id, f):
    """kind: inAppPurchaseAppStoreReviewScreenshots or subscriptionAppStoreReviewScreenshots"""
    data = f.read_bytes()
    res = call('POST', '/v1/' + kind, {'data': {'type': kind, 'attributes': {'fileName': f.name, 'fileSize': len(data)},
                                                'relationships': {owner_rel: rel(owner_type, owner_id)}}})
    sid, ops = res['data']['id'], res['data']['attributes'].get('uploadOperations') or []
    for op in ops:
        chunk = data[op['offset']:op['offset'] + op['length']]
        hdrs = {h['name']: h['value'] for h in op.get('requestHeaders', [])}
        r = requests.request(op['method'], op['url'], headers=hdrs, data=chunk, timeout=120)
        if r.status_code >= 400:
            raise ApiError(r.status_code, r.text)
    call('PATCH', '/v1/%s/%s' % (kind, sid), {'data': {'type': kind, 'id': sid, 'attributes': {
        'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})


def pick_price(points, usd, what):
    """points: list of price point resources with attributes.customerPrice"""
    want = float(usd)
    prices = sorted({float(p['attributes']['customerPrice']): p for p in points}.items())
    exact = [p for v, p in prices if abs(v - want) < 0.001]
    if exact:
        return exact[0], usd
    near = min(prices, key=lambda vp: abs(vp[0] - want))
    print('::notice::%s: USD %s is not an App Store price point; the nearest is USD %.2f.' % (what, usd, near[0]))
    return near[1], '%.2f' % near[0]


# ---------- one-time products ----------
existing = {p['attributes']['productId']: p for p in get_all('/v1/apps/%s/inAppPurchasesV2' % APP, {'limit': 200})}
app_points = []
if not CREATE:
    try:   # the app's own US price points: the same price grid in-app purchases use
        app_points = get_all('/v1/apps/%s/appPricePoints' % APP, {'filter[territory]': 'USA', 'limit': 200})
        print('US price points available: %d' % len(app_points))
    except ApiError as e:
        print('(could not list price points: %s)' % e)
print('\nOne-time products (%d exist already)' % len(existing))
for p in SPEC['products']:
    pid = '%s.%s' % (BUNDLE, p['suffix'])
    print('- %s  [%s, USD %s]' % (pid, p['type'], p['usd']))
    iap = existing.get(pid)
    if iap and iap['attributes'].get('inAppPurchaseType') != p['type']:
        warn('%s exists with type %s, not %s. Types cannot be changed; check it in App Store Connect.' % (pid, iap['attributes'].get('inAppPurchaseType'), p['type']))
        continue
    if not iap:
        if not CREATE:
            note('missing: would create it (name, description, price, availability, review screenshot)')
            if app_points:
                pick_price(app_points, p['usd'], pid)
            if not screenshot_file(p['suffix']):
                warn('No review screenshot appstore/iap-review/%s.png' % p['suffix'])
            continue
        iap = call('POST', '/v2/inAppPurchases', {'data': {'type': 'inAppPurchases', 'attributes': {
            'name': p['reference'], 'productId': pid, 'inAppPurchaseType': p['type'],
            'reviewNote': 'Where to find it: %s. Tap the price button to open the purchase screen.' % p['where'],
            'familySharable': False}, 'relationships': {'app': rel('apps', APP)}}})['data']
        note('created (id %s)' % iap['id'])
    iid = iap['id']
    try:
        locs = get_all('/v2/inAppPurchases/%s/inAppPurchaseLocalizations' % iid)
        if not any(l['attributes'].get('locale') == 'en-US' for l in locs):
            if CREATE:
                call('POST', '/v1/inAppPurchaseLocalizations', {'data': {'type': 'inAppPurchaseLocalizations', 'attributes': {
                    'locale': 'en-US', 'name': p['name'], 'description': p['description']},
                    'relationships': {'inAppPurchaseV2': rel('inAppPurchases', iid)}}})
                note('English name and description added')
            else:
                note('missing: English name and description')
        prices = call('GET', '/v1/inAppPurchasePriceSchedules/%s/manualPrices' % iid, ok404=True)
        if not (prices and prices.get('data')):
            points = get_all('/v2/inAppPurchases/%s/pricePoints' % iid, {'filter[territory]': 'USA', 'limit': 8000})
            point, used = pick_price(points, p['usd'], pid)
            if CREATE:
                call('POST', '/v1/inAppPurchasePriceSchedules', {
                    'data': {'type': 'inAppPurchasePriceSchedules', 'relationships': {
                        'inAppPurchase': rel('inAppPurchases', iid), 'baseTerritory': rel('territories', 'USA'),
                        'manualPrices': {'data': [{'type': 'inAppPurchasePrices', 'id': '${price0}'}]}}},
                    'included': [{'type': 'inAppPurchasePrices', 'id': '${price0}', 'attributes': {'startDate': None},
                                  'relationships': {'inAppPurchasePricePoint': rel('inAppPurchasePricePoints', point['id'])}}]})
                note('price set: USD %s (other countries follow Apple\'s equalized prices)' % used)
            else:
                note('missing: price (USD %s available)' % used)
        avail = call('GET', '/v2/inAppPurchases/%s/inAppPurchaseAvailability' % iid, ok404=True)
        if not (avail and avail.get('data')):
            if CREATE:
                call('POST', '/v1/inAppPurchaseAvailabilities', {'data': {'type': 'inAppPurchaseAvailabilities',
                    'attributes': {'availableInNewTerritories': False}, 'relationships': {
                        'inAppPurchase': rel('inAppPurchases', iid),
                        'availableTerritories': {'data': [{'type': 'territories', 'id': t} for t in available]}}}})
                note('availability set (%d countries)' % len(available))
            else:
                note('missing: availability')
        shot = call('GET', '/v2/inAppPurchases/%s/appStoreReviewScreenshot' % iid, ok404=True)
        if not (shot and shot.get('data')):
            f = screenshot_file(p['suffix'])
            if not f:
                warn('No review screenshot appstore/iap-review/%s.png' % p['suffix'])
            elif CREATE:
                upload_screenshot('inAppPurchaseAppStoreReviewScreenshots', 'inAppPurchaseV2', 'inAppPurchases', iid, f)
                note('review screenshot uploaded')
            else:
                note('missing: review screenshot')
        if iap.get('attributes', {}).get('state'):
            note('state: %s' % iap['attributes']['state'])
    except ApiError as e:
        warn('%s: %s' % (pid, e))

# ---------- subscription group and the weekly subscription ----------
g, sub = SPEC['subscription_group'], SPEC['subscription']
sid_full = '%s.%s' % (BUNDLE, sub['suffix'])
print('\nSubscription: %s  [%s, USD %s per week]' % (sid_full, sub['period'], sub['usd']))
try:
    groups = get_all('/v1/apps/%s/subscriptionGroups' % APP, {'limit': 200})
    group = next((x for x in groups if x['attributes'].get('referenceName') == g['reference']), None)
    if not group:
        if CREATE:
            group = call('POST', '/v1/subscriptionGroups', {'data': {'type': 'subscriptionGroups', 'attributes': {
                'referenceName': g['reference']}, 'relationships': {'app': rel('apps', APP)}}})['data']
            note('group "%s" created' % g['reference'])
        else:
            note('missing: subscription group "%s"' % g['reference'])
    if group:
        gl = get_all('/v1/subscriptionGroups/%s/subscriptionGroupLocalizations' % group['id'])
        if not any(l['attributes'].get('locale') == 'en-US' for l in gl):
            if CREATE:
                call('POST', '/v1/subscriptionGroupLocalizations', {'data': {'type': 'subscriptionGroupLocalizations',
                    'attributes': {'locale': 'en-US', 'name': g['name']},
                    'relationships': {'subscriptionGroup': rel('subscriptionGroups', group['id'])}}})
                note('group English name added')
            else:
                note('missing: group English name')
        subs = get_all('/v1/subscriptionGroups/%s/subscriptions' % group['id'], {'limit': 200})
        s = next((x for x in subs if x['attributes'].get('productId') == sid_full), None)
    else:
        s = None
    if not s and CREATE:
        s = call('POST', '/v1/subscriptions', {'data': {'type': 'subscriptions', 'attributes': {
            'name': sub['reference'], 'productId': sid_full, 'subscriptionPeriod': sub['period'],
            'familySharable': False, 'groupLevel': 1,
            'reviewNote': 'Where to find it: %s. Tap the price to open the purchase screen. No free trial or introductory offer.' % sub['where']},
            'relationships': {'group': rel('subscriptionGroups', group['id'])}}})['data']
        note('subscription created (id %s)' % s['id'])
    elif not s:
        note('missing: would create the subscription (name, description, price in every country, availability, review screenshot)')
        if not screenshot_file(sub['suffix']):
            warn('No review screenshot appstore/iap-review/%s.png' % sub['suffix'])
    if s:
        sid = s['id']
        sl = get_all('/v1/subscriptions/%s/subscriptionLocalizations' % sid)
        if not any(l['attributes'].get('locale') == 'en-US' for l in sl):
            if CREATE:
                call('POST', '/v1/subscriptionLocalizations', {'data': {'type': 'subscriptionLocalizations', 'attributes': {
                    'locale': 'en-US', 'name': sub['name'], 'description': sub['description']},
                    'relationships': {'subscription': rel('subscriptions', sid)}}})
                note('English name and description added')
            else:
                note('missing: English name and description')
        avail = call('GET', '/v1/subscriptions/%s/subscriptionAvailability' % sid, ok404=True)
        if not (avail and avail.get('data')):
            if CREATE:
                call('POST', '/v1/subscriptionAvailabilities', {'data': {'type': 'subscriptionAvailabilities',
                    'attributes': {'availableInNewTerritories': False}, 'relationships': {
                        'subscription': rel('subscriptions', sid),
                        'availableTerritories': {'data': [{'type': 'territories', 'id': t} for t in available]}}}})
                note('availability set (%d countries)' % len(available))
            else:
                note('missing: availability')
        have = get_all('/v1/subscriptions/%s/prices' % sid, {'limit': 200, 'include': 'territory'})
        if not have:
            points = get_all('/v1/subscriptions/%s/pricePoints' % sid, {'filter[territory]': 'USA', 'limit': 8000})
            point, used = pick_price(points, sub['usd'], sid_full)
            if CREATE:
                # Apple's equivalent price in every other country, the same thing App Store Connect fills in.
                eq = get_all('/v1/subscriptionPricePoints/%s/equalizations' % point['id'], {'limit': 8000, 'include': 'territory'})
                per = {'USA': point['id']}
                for e in eq:
                    t = e.get('relationships', {}).get('territory', {}).get('data', {}).get('id')
                    if t and t in available:
                        per[t] = e['id']
                for t, ppid in sorted(per.items()):
                    call('POST', '/v1/subscriptionPrices', {'data': {'type': 'subscriptionPrices',
                        'attributes': {'startDate': None, 'preserveCurrentPrice': False}, 'relationships': {
                            'subscription': rel('subscriptions', sid), 'subscriptionPricePoint': rel('subscriptionPricePoints', ppid),
                            'territory': rel('territories', t)}}})
                note('price set: USD %s per week, and the equivalent in %d other countries' % (used, len(per) - 1))
                if len(per) < len(available) * 0.8:
                    warn('Only %d countries got a subscription price; set the rest in App Store Connect (Subscription Prices).' % len(per))
            else:
                note('missing: price (USD %s per week available)' % used)
        shot = call('GET', '/v1/subscriptions/%s/appStoreReviewScreenshot' % sid, ok404=True)
        if not (shot and shot.get('data')):
            f = screenshot_file(sub['suffix'])
            if not f:
                warn('No review screenshot appstore/iap-review/%s.png' % sub['suffix'])
            elif CREATE:
                upload_screenshot('subscriptionAppStoreReviewScreenshots', 'subscription', 'subscriptions', sid, f)
                note('review screenshot uploaded')
            else:
                note('missing: review screenshot')
        st = s.get('attributes', {}).get('state')
        if st:
            note('state: %s' % st)
        if st and st != 'READY_TO_SUBMIT':
            # Show each piece Apple looks at, so a "Missing Metadata" can be traced.
            fresh = call('GET', '/v1/subscriptions/%s' % sid)['data']['attributes']
            note('details: period %s, level %s, family sharing %s' % (fresh.get('subscriptionPeriod'), fresh.get('groupLevel'), fresh.get('familySharable')))
            for l in get_all('/v1/subscriptionGroups/%s/subscriptionGroupLocalizations' % group['id']):
                note('group name [%s] "%s" state %s' % (l['attributes'].get('locale'), l['attributes'].get('name'), l['attributes'].get('state')))
            for l in get_all('/v1/subscriptions/%s/subscriptionLocalizations' % sid):
                note('name [%s] "%s" / "%s" state %s' % (l['attributes'].get('locale'), l['attributes'].get('name'), l['attributes'].get('description'), l['attributes'].get('state')))
            note('prices: %d countries' % len(get_all('/v1/subscriptions/%s/prices' % sid, {'limit': 200})))
            av = call('GET', '/v1/subscriptions/%s/subscriptionAvailability' % sid, ok404=True)
            note('availability: %s' % ('set' if av and av.get('data') else 'missing'))
            sh = call('GET', '/v1/subscriptions/%s/appStoreReviewScreenshot' % sid, ok404=True)
            sa = (sh or {}).get('data') or {}
            note('review screenshot: %s' % (json.dumps((sa.get('attributes') or {}).get('assetDeliveryState')) if sa else 'missing'))
except ApiError as e:
    warn('subscription: %s' % e)

print()
if problems:
    print('%d problem(s), see the warnings above.' % len(problems))
    sys.exit(1)
print('Check finished: nothing is wrong. Run with "create" to add what is missing.' if not CREATE else
      'Done. In App Store Connect each product should now show "Ready to Submit" (Apple can take a few minutes).')
