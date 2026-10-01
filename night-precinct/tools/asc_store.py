#!/usr/bin/env python3
"""Fill in the App Store page of Night Precinct in App Store Connect, and put the newest build in TestFlight.

  python3 tools/asc_store.py check   # read only: shows what is set and what would change
  python3 tools/asc_store.py apply   # makes the changes; safe to run again

What it sets (from where):
  TestFlight    newest build of VERSION: export compliance answered, added to every internal tester group
  Version       copyright, release type, the build to submit     (metadata/en-US/copyright.txt, store.json)
  Store text    description, keywords, promotional text, support and marketing URLs   (metadata/en-US/*.txt)
  App info      subtitle, privacy policy URL, categories, age rating                   (metadata/en-US, store.json)
  App Review    contact name and email, no sign-in needed, review notes  (store.json, release.config.json, review_notes.txt)
  Pricing       free; available everywhere except the excluded countries; no automatic new countries   (store.json)
  App           content rights answer                                                                  (store.json)
The store text is filled in from release.config.json first (tools/apply_config.py --no-build).
It never submits anything for review. The App Privacy answers and the review contact's phone number cannot be
set through Apple's API; the summary at the end lists what is left for you.
Credentials: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8. Needs: pip install pyjwt cryptography requests
"""
import base64, json, os, pathlib, re, subprocess, sys, time

import jwt
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = os.environ.get('ASC_API_BASE', 'https://api.appstoreconnect.apple.com')   # override only for tests
MODE = sys.argv[1] if len(sys.argv) > 1 else 'check'
if MODE not in ('check', 'apply'):
    sys.exit('usage: asc_store.py check|apply')
APPLY = MODE == 'apply'
LOCALE = 'en-US'
EDITABLE = {'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'}
problems, todo = [], []


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
        self.status = status
        try:
            errs = json.loads(text).get('errors', [])
            text = '; '.join('%s: %s%s' % (e.get('title', ''), e.get('detail', ''),
                                            ' (%s)' % e['source']['pointer'] if (e.get('source') or {}).get('pointer') else '')
                             for e in errs) or text
        except Exception:
            pass
        self.text = text
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
    return {'data': {'type': t, 'id': i} if i else None}


def patch(kind, rid, attributes=None, relationships=None):
    d = {'type': kind, 'id': rid}
    if attributes:
        d['attributes'] = attributes
    if relationships:
        d['relationships'] = relationships
    return call('PATCH', '/v1/%s/%s' % (kind, rid), {'data': d})


def short(v):
    if isinstance(v, str) and len(v) > 60:
        return '%d characters' % len(v)
    return json.dumps(v)


def changes(current, wanted, same=lambda a, b: a == b):
    """The wanted attributes whose current value differs."""
    out = {}
    for k, v in wanted.items():
        cur, want = current.get(k), v
        if isinstance(v, str) and isinstance(cur, str):
            cur, want = cur.replace('\r\n', '\n').strip(), v.strip()
        if not same(cur, want):
            out[k] = v
    return out


def report(what, diff, current):
    if not diff:
        note('%s: up to date' % what)
        return False
    for k, v in diff.items():
        note('%s %s: %s -> %s' % (what, k, short(current.get(k)), short(v)))
    if not APPLY:
        note('(check mode: not changed)')
    return APPLY


# ---------- inputs ----------
r = subprocess.run([sys.executable, str(ROOT / 'tools' / 'apply_config.py'), '--no-build'], cwd=ROOT, capture_output=True, text=True)
if r.returncode != 0:
    die('tools/apply_config.py failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])
TEXT = ROOT / 'release' / 'appstore' / 'metadata' / LOCALE


def text(name):
    s = (TEXT / (name + '.txt')).read_text().strip()
    if '{{' in s or '[YOUR' in s:
        die('%s.txt still has a placeholder. Fill in release.config.json first.' % name)
    return s


CFG = json.loads((ROOT / 'release.config.json').read_text())
STORE = json.loads((ROOT / 'appstore' / 'store.json').read_text())
EXCLUDED = sorted({t for group in STORE['excluded_territories'].values() for t in group})
BUNDLE, VERSION = CFG['BUNDLE_ID'], CFG['VERSION']

apps = [a for a in call('GET', '/v1/apps', params={'filter[bundleId]': BUNDLE}).get('data', []) if a['attributes'].get('bundleId') == BUNDLE]
if not apps:
    die('No app with bundle ID %s in App Store Connect.' % BUNDLE)
APP, app_attrs = apps[0]['id'], apps[0]['attributes']
print('App: %s (%s)' % (app_attrs.get('name'), BUNDLE))


def section(title, fn):
    print('\n' + title)
    try:
        fn()
    except ApiError as e:
        warn('%s: %s' % (title, e))


# ---------- builds ----------
builds = call('GET', '/v1/builds', params={'filter[app]': APP, 'filter[preReleaseVersion.version]': VERSION,
                                           'sort': '-uploadedDate', 'limit': 20}).get('data', [])
valid = [b for b in builds if b['attributes'].get('processingState') == 'VALID' and not b['attributes'].get('expired')]
BUILD = valid[0] if valid else None


def testflight():
    if not builds:
        warn('No build of version %s has been uploaded yet. Run Actions > Night Precinct iOS with "Upload to TestFlight".' % VERSION)
        return
    newest = builds[0]['attributes']
    note('newest upload: build %s (%s)' % (newest.get('version'), newest.get('processingState')))
    if not BUILD:
        warn('No processed build of version %s yet; Apple is still processing it, run this again in a few minutes.' % VERSION)
        return
    bid, battrs = BUILD['id'], BUILD['attributes']
    if BUILD is not builds[0]:
        note('using build %s, the newest one Apple has finished processing' % battrs.get('version'))
    if battrs.get('usesNonExemptEncryption') is None:
        note('export compliance not answered yet: %s "no non-exempt encryption" (Info.plist says the same)' % ('answering' if APPLY else 'would answer'))
        if APPLY:
            patch('builds', bid, {'usesNonExemptEncryption': False})
            note('export compliance answered')
    groups = [g for g in get_all('/v1/apps/%s/betaGroups' % APP, {'limit': 200}) if g['attributes'].get('isInternalGroup')]
    if not groups:
        note('no internal tester group yet: would create "Team" (gets every build) with the App Store Connect users as testers')
        if APPLY:
            g = call('POST', '/v1/betaGroups', {'data': {'type': 'betaGroups', 'attributes': {
                'name': 'Team', 'isInternalGroup': True, 'hasAccessToAllBuilds': True},
                'relationships': {'app': rel('apps', APP)}}})['data']
            groups = [g]
            note('internal group "Team" created')
    for g in groups:
        gid, ga = g['id'], g['attributes']
        testers = call('GET', '/v1/betaGroups/%s/betaTesters' % gid, params={'limit': 200}).get('data', [])
        note('internal group "%s": %d tester(s)' % (ga.get('name'), len(testers)))
        if not testers:
            users = get_all('/v1/users', {'limit': 100})
            note('no testers: would add the %d App Store Connect user(s)' % len(users))
            if APPLY:
                added = 0
                for u in users:
                    ua = u['attributes']
                    try:
                        call('POST', '/v1/betaTesters', {'data': {'type': 'betaTesters', 'attributes': {
                            'email': ua.get('username'), 'firstName': ua.get('firstName'), 'lastName': ua.get('lastName')},
                            'relationships': {'betaGroups': {'data': [{'type': 'betaGroups', 'id': gid}]}}}})
                        added += 1
                    except ApiError as e:
                        note('one user could not be added (HTTP %s)' % e.status)   # no details: the logs are public
                note('%d tester(s) added; each gets an e-mail invitation to TestFlight' % added)
        if ga.get('hasAccessToAllBuilds'):
            note('this group gets every build automatically, build %s included' % battrs.get('version'))
            continue
        in_group = {b['id'] for b in get_all('/v1/betaGroups/%s/builds' % gid, {'limit': 200})}
        if bid in in_group:
            note('build %s is in this group' % battrs.get('version'))
        else:
            note('build %s is not in this group yet%s' % (battrs.get('version'), '' if APPLY else ': would add it'))
            if APPLY:
                call('POST', '/v1/betaGroups/%s/relationships/builds' % gid, {'data': [{'type': 'builds', 'id': bid}]})
                note('build %s added' % battrs.get('version'))
    detail = call('GET', '/v1/builds/%s/buildBetaDetail' % bid, ok404=True)
    state = ((detail or {}).get('data') or {}).get('attributes', {}).get('internalBuildState')
    if state:
        note('TestFlight status for internal testers: %s' % state)
        if state == 'MISSING_EXPORT_COMPLIANCE' and not APPLY:
            note('(apply answers it)')


section('TestFlight', testflight)

# ---------- the version ----------
versions = get_all('/v1/apps/%s/appStoreVersions' % APP, {'filter[platform]': 'IOS', 'limit': 50})
open_v = [v for v in versions if v['attributes'].get('appStoreState') in EDITABLE or v['attributes'].get('appVersionState') in ('PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_REJECTED')]
if not open_v:
    die('No iOS version that can still be edited. States: %s' % ', '.join('%s %s' % (v['attributes'].get('versionString'), v['attributes'].get('appStoreState')) for v in versions))
VER = open_v[0]
VID = VER['id']


def version():
    va = VER['attributes']
    note('version %s (%s)' % (va.get('versionString'), va.get('appStoreState')))
    if va.get('versionString') != VERSION:
        warn('The version in App Store Connect is %s but the build is %s. Run the store screenshots workflow in upload mode (it renames it) or rename it in App Store Connect.' % (va.get('versionString'), VERSION))
    want = {'copyright': text('copyright'), 'releaseType': STORE['release_type']}
    diff = changes(va, want)
    if report('version', diff, va):
        patch('appStoreVersions', VID, diff)
        note('version updated')
    cur = call('GET', '/v1/appStoreVersions/%s/build' % VID, ok404=True)
    cur = (cur or {}).get('data')
    cur_label = 'build %s' % cur['attributes'].get('version') if cur else 'none'
    if not BUILD:
        note('build for review: %s (no processed build to pick yet)' % cur_label)
    elif cur and cur['id'] == BUILD['id']:
        note('build for review: %s, up to date' % cur_label)
    else:
        note('build for review: %s -> build %s' % (cur_label, BUILD['attributes'].get('version')))
        if APPLY:
            call('PATCH', '/v1/appStoreVersions/%s/relationships/build' % VID, {'data': {'type': 'builds', 'id': BUILD['id']}})
            note('build selected')


section('Version', version)


def store_text():
    locs = get_all('/v1/appStoreVersions/%s/appStoreVersionLocalizations' % VID)
    loc = next((l for l in locs if l['attributes'].get('locale') == LOCALE), None)
    if not loc:
        warn('The version has no %s page.' % LOCALE)
        return
    want = {'description': text('description'), 'keywords': text('keywords'), 'promotionalText': text('promotional_text'),
            'supportUrl': text('support_url'), 'marketingUrl': text('marketing_url')}
    if len(versions) > 1:   # "What's New" is only allowed once the app has been released before
        want['whatsNew'] = text('release_notes')
    diff = changes(loc['attributes'], want)
    if report('store text', diff, loc['attributes']):
        patch('appStoreVersionLocalizations', loc['id'], diff)
        note('store text updated')


section('Store text (English, U.S.)', store_text)

# ---------- app information ----------
infos = get_all('/v1/apps/%s/appInfos' % APP)
INFO = next((i for i in infos if (i['attributes'].get('state') or i['attributes'].get('appStoreState')) not in ('READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_INFO')), infos[0] if infos else None)
if not INFO:
    die('The app has no App Information record.')
IID = INFO['id']


def app_info_text():
    locs = get_all('/v1/appInfos/%s/appInfoLocalizations' % IID)
    loc = next((l for l in locs if l['attributes'].get('locale') == LOCALE), None)
    if not loc:
        warn('App Information has no %s localization.' % LOCALE)
        return
    want = {'name': text('name'), 'subtitle': text('subtitle'), 'privacyPolicyUrl': text('privacy_url')}
    diff = changes(loc['attributes'], want)
    if report('app info', diff, loc['attributes']):
        patch('appInfoLocalizations', loc['id'], diff)
        note('name, subtitle and privacy policy URL updated')


section('App information: name, subtitle, privacy policy', app_info_text)

CATS = ['primaryCategory', 'primarySubcategoryOne', 'primarySubcategoryTwo', 'secondaryCategory', 'secondarySubcategoryOne', 'secondarySubcategoryTwo']


def categories():
    info = call('GET', '/v1/appInfos/%s' % IID, params={'include': ','.join(CATS)})['data']
    current = {k: ((info.get('relationships', {}).get(k) or {}).get('data') or {}).get('id') for k in CATS}
    want = {k: STORE['categories'].get(k) for k in CATS}
    diff = {k: v for k, v in want.items() if current.get(k) != v}
    if report('category', diff, current):
        patch('appInfos', IID, relationships={k: rel('appCategories', v) for k, v in diff.items()})
        note('categories updated')


section('Categories', categories)

LOOSE = {'INFREQUENT_OR_MILD': 'INFREQUENT', 'FREQUENT_OR_INTENSE': 'FREQUENT'}
OTHER_SPELLING = {'INFREQUENT': 'INFREQUENT_OR_MILD', 'INFREQUENT_OR_MILD': 'INFREQUENT', 'FREQUENT': 'FREQUENT_OR_INTENSE', 'FREQUENT_OR_INTENSE': 'FREQUENT'}


def age_rating():
    decl = call('GET', '/v1/appInfos/%s/ageRatingDeclaration' % IID)['data']
    want = {k: v for k, v in STORE['age_rating'].items() if not k.startswith('_')}
    if decl['attributes'].get('kidsAgeBand') is not None:
        want['kidsAgeBand'] = None
    diff = changes(decl['attributes'], want, same=lambda a, b: LOOSE.get(a, a) == LOOSE.get(b, b))
    if report('age rating', diff, decl['attributes']):
        try:
            patch('ageRatingDeclarations', decl['id'], diff)
        except ApiError as e:
            # Apple spells "infrequent" differently for older and newer questions; retry the rejected ones the other way.
            bad = [k for k in diff if k in e.text and diff[k] in OTHER_SPELLING]
            if not bad:
                raise
            for k in bad:
                diff[k] = OTHER_SPELLING[diff[k]]
            note('retrying %s with the other spelling' % ', '.join(bad))
            patch('ageRatingDeclarations', decl['id'], diff)
        note('age rating answers saved')
    info = call('GET', '/v1/appInfos/%s' % IID)['data']['attributes']
    note('rating Apple shows: %s%s' % (info.get('appStoreAgeRating') or 'not calculated yet',
                                       ', Australia %s' % info['australiaAgeRating'] if info.get('australiaAgeRating') else ''))


section('Age rating', age_rating)


def content_rights():
    want = {'contentRightsDeclaration': STORE['content_rights']}
    diff = changes(app_attrs, want)
    if report('content rights', diff, app_attrs):
        patch('apps', APP, diff)
        note('content rights answered')


section('Content rights', content_rights)


def review_details():
    want = {'contactFirstName': STORE['review_contact']['first_name'], 'contactLastName': STORE['review_contact']['last_name'],
            'contactEmail': CFG['CONTACT_EMAIL'], 'demoAccountRequired': False, 'notes': text('review_notes')}
    if len(want['notes']) > 4000:
        warn('review_notes.txt is %d characters; App Review allows 4,000.' % len(want['notes']))
        return
    cur = call('GET', '/v1/appStoreVersions/%s/appStoreReviewDetail' % VID, ok404=True)
    cur = (cur or {}).get('data')
    if not cur:
        note('no App Review details yet: %s contact name, e-mail, "no sign-in needed" and the review notes (%d characters)' % ('adding' if APPLY else 'would add', len(want['notes'])))
        if APPLY:
            cur = call('POST', '/v1/appStoreReviewDetails', {'data': {'type': 'appStoreReviewDetails', 'attributes': want,
                                                                      'relationships': {'appStoreVersion': rel('appStoreVersions', VID)}}})['data']
            note('App Review details added')
    else:
        diff = changes(cur['attributes'], want)
        if report('review', diff, cur['attributes']):
            patch('appStoreReviewDetails', cur['id'], diff)
            note('App Review details updated')
    if not (cur and cur['attributes'].get('contactPhone')):
        todo.append('App Review contact phone number: App Store Connect > the 1.0.0 version page > App Review Information > Phone number. '
                    'Apple only uses it to reach you during review; it is not shown in the store.')


section('App Review information', review_details)


def price():
    sched = call('GET', '/v1/apps/%s/appPriceSchedule' % APP, ok404=True)
    sid = ((sched or {}).get('data') or {}).get('id')
    prices = []
    if sid:
        manual = call('GET', '/v1/appPriceSchedules/%s/manualPrices' % sid, params={'include': 'appPricePoint', 'limit': 50}, ok404=True) or {}
        prices = [float(i['attributes'].get('customerPrice') or 0) for i in manual.get('included', []) if i.get('type') == 'appPricePoints']
    if prices and all(p == 0 for p in prices):
        note('price: free, up to date')
        return
    note('price: %s -> free' % ('USD %.2f' % max(prices) if prices else 'not set'))
    if not APPLY:
        note('(check mode: not changed)')
        return
    points = get_all('/v1/apps/%s/appPricePoints' % APP, {'filter[territory]': 'USA', 'limit': 200})
    free = next((p for p in points if float(p['attributes'].get('customerPrice') or 0) == 0), None)
    if not free:
        warn('Could not find the free price point. Set the price to Free in App Store Connect > Pricing and Availability.')
        return
    call('POST', '/v1/appPriceSchedules', {
        'data': {'type': 'appPriceSchedules', 'relationships': {
            'app': rel('apps', APP), 'baseTerritory': rel('territories', 'USA'),
            'manualPrices': {'data': [{'type': 'appPrices', 'id': '${price0}'}]}}},
        'included': [{'type': 'appPrices', 'id': '${price0}', 'attributes': {'startDate': None},
                      'relationships': {'appPricePoint': rel('appPricePoints', free['id'])}}]})
    note('price set to free')


section('Price', price)


def availability():
    territories = sorted(t['id'] for t in get_all('/v1/territories', {'limit': 200}))
    unknown = [t for t in EXCLUDED if t not in territories]
    if unknown:
        warn('store.json excludes territories Apple does not list: %s' % ', '.join(unknown))
    want_on = [t for t in territories if t not in EXCLUDED]
    note('%d App Store countries and regions; selling in %d, not in %d (%s)' % (len(territories), len(want_on), len(territories) - len(want_on), ', '.join(EXCLUDED)))
    av = call('GET', '/v1/apps/%s/appAvailabilityV2' % APP, ok404=True)
    av = (av or {}).get('data')
    new_ok = STORE['available_in_new_territories']
    if not av:
        note('availability not set yet: would set it')
        if APPLY:
            call('POST', '/v2/appAvailabilities', {
                'data': {'type': 'appAvailabilities', 'attributes': {'availableInNewTerritories': new_ok},
                         'relationships': {'app': rel('apps', APP), 'territoryAvailabilities': {
                             'data': [{'type': 'territoryAvailabilities', 'id': '${%s}' % t} for t in territories]}}},
                'included': [{'type': 'territoryAvailabilities', 'id': '${%s}' % t,
                              'attributes': {'available': t not in EXCLUDED, 'preOrderEnabled': False},
                              'relationships': {'territory': rel('territories', t)}} for t in territories]})
            note('availability set')
        return
    if av['attributes'].get('availableInNewTerritories') != new_ok:
        todo.append('Automatic availability in new countries: App Store Connect > Pricing and Availability > Country or Region Availability > '
                    'turn %s "make available in new countries automatically" (this script only sets it the first time).' % ('on' if new_ok else 'off'))
        note('automatic availability in new countries: %s (wanted %s)' % (av['attributes'].get('availableInNewTerritories'), new_ok))
    tas = get_all('/v2/appAvailabilities/%s/territoryAvailabilities' % av['id'], {'limit': 200, 'include': 'territory'})
    seen, flips = set(), []
    for ta in tas:
        t = ((ta.get('relationships', {}).get('territory') or {}).get('data') or {}).get('id')
        if not t:
            continue
        seen.add(t)
        want = t not in EXCLUDED
        if bool(ta['attributes'].get('available')) != want:
            flips.append((t, want, ta['id']))
    missing = [t for t in want_on if t not in seen]
    if missing:
        warn('Not in the app\'s availability list at all: %s. Tick them in App Store Connect > Pricing and Availability.' % ', '.join(missing))
    if not flips:
        note('availability: up to date')
        return
    on = [t for t, w, _ in flips if w]
    off = [t for t, w, _ in flips if not w]
    if on:
        note('would turn on: %s' % ', '.join(on))
    if off:
        note('would turn off: %s' % ', '.join(off))
    if APPLY:
        for t, w, tid in flips:
            patch('territoryAvailabilities', tid, {'available': w})
        note('availability updated (%d changed)' % len(flips))


section('Availability', availability)


def purchases_state():
    counts = {}
    for p in get_all('/v1/apps/%s/inAppPurchasesV2' % APP, {'limit': 200}):
        counts[p['attributes'].get('state')] = counts.get(p['attributes'].get('state'), 0) + 1
    for g in get_all('/v1/apps/%s/subscriptionGroups' % APP, {'limit': 200}):
        for s in get_all('/v1/subscriptionGroups/%s/subscriptions' % g['id'], {'limit': 200}):
            st = s['attributes'].get('state')
            counts[st] = counts.get(st, 0) + 1
            if st not in ('READY_TO_SUBMIT', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'APPROVED'):
                note('subscription %s: %s' % (s['attributes'].get('productId'), st))
    note('in-app purchases and subscriptions by status: %s' % ', '.join('%s %d' % kv for kv in sorted(counts.items(), key=lambda kv: str(kv[0]))))


section('In-app purchases (read only)', purchases_state)


def legal_pages():
    for name in ('support_url', 'privacy_url', 'marketing_url'):
        url = text(name)
        try:
            code = requests.get(url, timeout=20).status_code
        except requests.RequestException as e:
            code = type(e).__name__
        note('%s: %s' % (url, code))
        if code != 200:
            todo.append('The legal pages are not online yet (%s gave %s). GitHub > Settings > Pages > Deploy from a branch > gh-pages, / (root) > Save.' % (url, code))
            return


section('Legal pages online', legal_pages)

print('\nStill for you in App Store Connect (the API cannot do these):')
todo += [
    'App Privacy: App Store Connect > your app > App Privacy > Get Started > "No, we do not collect data from this app" > Publish (appstore/APP_PRIVACY.md).',
    'Paid Apps agreement: App Store Connect > Business > Paid Apps, with bank account and tax forms, until it shows Active.',
    'When everything above is done: on the 1.0.0 version page, under In-App Purchases and Subscriptions, add all 16 products, then Add for Review > Submit for Review.',
]
for i, t in enumerate(todo, 1):
    print('  %d. %s' % (i, t))
print()
if problems:
    print('%d problem(s), see the warnings above.' % len(problems))
    sys.exit(1)
print('Done. Nothing was submitted for review.' if APPLY else 'Check finished. Run with "apply" to make the changes listed above.')
