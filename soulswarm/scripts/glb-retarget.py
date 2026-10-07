#!/usr/bin/env python3
"""Copies animation clips between auto-rigged GLBs that share bone names (no dependencies; scripts/hero-models.sh).

usage: glb-retarget.py target.glb out.glb [--pin BONE:BOX|CAPSULE] ... [--clip NAME=source.glb[#INDEX][@GAIN][~LEAN]] ...
                       [--drop-native]

--clip          adds the source's clip (its first, or #INDEX) to the target, retargeted bone by bone as kind() below
  says. @GAIN scales the arms' swing (@LEFT,RIGHT: each arm, e.g. a steadier weapon arm); ~LEAN tilts the upper body
  forward (degrees). Translation channels other than the hips' and all scale channels are dropped (they would carry
  the source's proportions). Rigs must share bone names and face the same way (one auto-rigger, every model
  turned to face +Z first: glb-turn.py).
--drop-native   removes the clips the target came with (after any --clip has used them).
--pin BONE:x0,x1,y0,y1,z0,z1 | BONE:x0,y0,z0,x1,y1,z1,r[,fade]   binds every vertex inside the box, or the capsule
  around the segment, wholly to BONE (rest pose, model units): weapons the auto-rigger weighted to a leg or the head (a
  staff's foot, a spear's blade) then stay rigid in the hand that holds them. With `fade`, a capsule's hold grows from
  nothing at its first end to whole `fade` units along it (a staff whose foot is fused with a robe's hem bends there
  instead of tearing the hem).
"""
import json, math, struct, sys

# ---------------------------------------------------------------- GLB io
def read_glb(path):
    data = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, path + ': not a GLB'
    off, gltf, binc = 12, None, b''
    while off < total:
        ln, typ = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + ln]
        if typ == 0x4E4F534A: gltf = json.loads(chunk.decode('utf8'))
        elif typ == 0x004E4942: binc = bytes(chunk)
        off += 8 + ln
    return gltf, bytearray(binc)

def write_glb(path, gltf, binc):
    while len(binc) % 4: binc.append(0)
    if gltf.get('buffers'): gltf['buffers'][0]['byteLength'] = len(binc)
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8'); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + bytes(binc)
    open(path, 'wb').write(out)

NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
CTYPE = {5126: ('f', 4, None), 5120: ('b', 1, 127.0), 5121: ('B', 1, 255.0), 5122: ('h', 2, 32767.0), 5123: ('H', 2, 65535.0)}

def read_acc(gltf, binc, i):
    a = gltf['accessors'][i]; bv = gltf['bufferViews'][a['bufferView']]
    n, (fmt, size, norm) = NCOMP[a['type']], CTYPE[a['componentType']]
    stride = bv.get('byteStride') or n * size
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for k in range(a['count']):
        v = struct.unpack_from('<%d%s' % (n, fmt), binc, base + k * stride)
        if a.get('normalized') and norm: v = tuple(max(x / norm, -1.0) for x in v)
        out.append(v if n > 1 else v[0])
    return out

def add_acc(gltf, binc, values, typ, minmax=False):
    while len(binc) % 4: binc.append(0)
    n = NCOMP[typ]; flat = [x for v in values for x in (v if n > 1 else (v,))]
    off = len(binc); binc.extend(struct.pack('<%df' % len(flat), *flat))
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(flat) * 4})
    acc = {'bufferView': len(gltf['bufferViews']) - 1, 'componentType': 5126, 'count': len(values), 'type': typ}
    if minmax:
        cols = [[(v if n > 1 else (v,))[j] for v in values] for j in range(n)]
        acc['min'] = [min(c) for c in cols]; acc['max'] = [max(c) for c in cols]
    gltf['accessors'].append(acc)
    return len(gltf['accessors']) - 1

# ---------------------------------------------------------------- math (quaternions are (x, y, z, w))
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
def qinv(q): return (-q[0], -q[1], -q[2], q[3])
def qnorm(q):
    l = math.sqrt(sum(x * x for x in q)) or 1.0
    return tuple(x / l for x in q)
def qrot(q, v):
    p = qmul(qmul(q, (v[0], v[1], v[2], 0.0)), qinv(q)); return p[:3]
def slerp(a, b, t):
    d = sum(x * y for x, y in zip(a, b))
    if d < 0: b, d = tuple(-x for x in b), -d
    if d > 0.9995: return qnorm(tuple(x + (y - x) * t for x, y in zip(a, b)))
    th = math.acos(d); s = math.sin(th)
    wa, wb = math.sin((1 - t) * th) / s, math.sin(t * th) / s
    return tuple(wa * x + wb * y for x, y in zip(a, b))
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))

class Rig:
    """Node hierarchy, rest TRS and world transforms of a GLB (TRS nodes only; the exporters used write no matrices)."""
    def __init__(self, gltf):
        nodes = gltf['nodes']
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get('children', []): self.parent[c] = i
        self.rest = [(tuple(n.get('translation', (0, 0, 0))), qnorm(tuple(n.get('rotation', (0, 0, 0, 1)))), tuple(n.get('scale', (1, 1, 1)))) for n in nodes]
        for n in nodes: assert 'matrix' not in n, 'matrix nodes are not supported'
        skin = gltf['skins'][0]
        self.joints = skin['joints']; self.jset = set(self.joints)
        self.byname = {nodes[j].get('name'): j for j in self.joints}
        # parents before children
        depth = lambda i: 0 if i not in self.parent else 1 + depth(self.parent[i])
        self.order = sorted(range(len(nodes)), key=depth)
        self.root = next(j for j in self.joints if self.parent.get(j) not in self.jset)

    def world(self, local):
        """local: {node: (t, r, s)} overrides on the rest pose -> {node: (pos, rot, scale)} (scale treated as per-axis, no shear)."""
        W = {}
        for i in self.order:
            t, r, s = local.get(i, self.rest[i])
            p = self.parent.get(i)
            if p is None: W[i] = (t, r, s); continue
            pt, pr, ps = W[p]
            st = (t[0] * ps[0], t[1] * ps[1], t[2] * ps[2])
            W[i] = (tuple(a + b for a, b in zip(pt, qrot(pr, st))), qnorm(qmul(pr, r)), tuple(a * b for a, b in zip(ps, s)))
        return W

def sample(times, vals, t, rot):
    if t <= times[0]: return vals[0]
    if t >= times[-1]: return vals[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if times[m] <= t: lo = m
        else: hi = m
    u = (t - times[lo]) / max(times[hi] - times[lo], 1e-9)
    return slerp(vals[lo], vals[hi], u) if rot else lerp(vals[lo], vals[hi], u)

def read_clip(gltf, binc, index):
    an = gltf['animations'][index]; ch = {}
    times = set()
    for c in an['channels']:
        s = an['samplers'][c['sampler']]
        tt = read_acc(gltf, binc, s['input']); vv = read_acc(gltf, binc, s['output'])
        if s.get('interpolation') == 'CUBICSPLINE': vv = vv[1::3]
        ch[(c['target']['node'], c['target']['path'])] = (tt, vv)
        times.update(round(x, 5) for x in tt)
    return an.get('name', 'clip'), sorted(times), ch

# How each bone takes the source's motion (by name). An auto-rigger places bones loosely (one rig's thighs rest 40
# degrees forward in a model standing straight) and bakes those offsets into its clips, so nothing is taken from the
# source's rest pose: every bone moves *around the clip's average pose*, and each hero keeps the stance it was
# sculpted in.
#   body  hips, spine, neck, head, thighs, feet: the world-space rotation away from the clip's average;
#   knee  the shins: only how much more the knee bends than at the clip's straightest moment (never hyperextends);
#   arm   relative to the chest, scaled by the clip's arm gain (a weapon arm swings less);
#   keep  the hands and head tips stay as sculpted on their parent.
# The hips are then raised or lowered so the lower foot meets the ground when the source's does (and lifts as far
# off it, scaled by the hip heights, in a run's flight); --clip ...~LEAN tilts the upper body forward by LEAN degrees.
def kind(name):
    if name.endswith('Hand') or name in ('head_end', 'headfront'): return 'keep'
    if name.endswith(('Shoulder', 'Arm')): return 'arm'
    if name in ('LeftLeg', 'RightLeg'): return 'knee'
    return 'body'

UPPER = ('Spine02', 'Spine01', 'Spine', 'neck', 'Head')
FEET = ('LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase')

def slerp_id(q, g):
    """q scaled by g (0 = no rotation, 1 = q)."""
    return slerp((0.0, 0.0, 0.0, 1.0), q, g)

def qmean(qs):
    """Average of nearby rotations (sign-aligned sum, normalised)."""
    m = [0.0, 0.0, 0.0, 0.0]
    for q in qs:
        if sum(a * b for a, b in zip(m, q)) < 0: q = tuple(-x for x in q)
        m = [a + b for a, b in zip(m, q)]
    return qnorm(tuple(m))

def source_poses(S, ch, times):
    out = []
    for t in times:
        local = {}
        for (node, path), (tt, vv) in ch.items():
            if path not in ('rotation', 'translation'): continue
            r = local.get(node, S.rest[node])
            v = sample(tt, vv, t, path == 'rotation')
            local[node] = (tuple(v), r[1], r[2]) if path == 'translation' else (r[0], qnorm(v), r[2])
        out.append((local, S.world(local)))
    return out

def retarget(tg, tb, sg, sb, index, name, arm_gain, lean=0.0):
    _, times, ch = read_clip(sg, sb, index)
    S, T = Rig(sg), Rig(tg)
    Ws0, Wt0 = S.world({}), T.world({})
    sroot, troot = S.root, T.root
    poses = source_poses(S, ch, times)
    # hip height above the rig's top node, in world units, scales the hips' travel and the feet's lift
    k = (Wt0[troot][0][1] - Wt0[T.order[0]][0][1]) / max(Ws0[sroot][0][1] - Ws0[S.order[0]][0][1], 1e-6)
    nm = lambda g, j: g['nodes'][j].get('name')
    smap = {j: S.byname[nm(tg, j)] for j in T.joints if nm(tg, j) in S.byname}
    missing = [nm(tg, j) for j in T.joints if j not in smap]
    kinds = {j: kind(nm(tg, j)) for j in smap}
    chest_s, chest_t = S.byname.get('Spine'), T.byname.get('Spine')
    if chest_s is None or chest_t is None: kinds = {j: ('body' if v == 'arm' else v) for j, v in kinds.items()}
    for j, v in list(kinds.items()):  # a knee needs its thigh
        if v == 'knee' and (T.parent.get(j) not in smap or S.parent.get(smap[j]) != smap[T.parent[j]]): kinds[j] = 'body'
    # the clip's average pose: world rotations (body), chest-space rotations (arms)
    mean = {j: qmean([W[smap[j]][1] for _, W in poses]) for j, v in kinds.items() if v in ('body', 'knee')}
    amean = {j: qmean([qmul(qinv(W[chest_s][1]), W[smap[j]][1]) for _, W in poses]) for j, v in kinds.items() if v == 'arm'}
    K = qmul(qinv(Wt0[chest_t][1]), Ws0[chest_s][1]) if amean else None  # source chest coords -> target's
    # each knee's straightest moment (smallest angle between thigh and shin) and its bend then, in the thigh's frame
    def bend(W, knee):
        th = S.parent[knee]; return qmul(qinv(W[th][1]), W[knee][1])
    def flex(W, knee):
        th, ft = S.parent[knee], next((c for c in sg['nodes'][knee].get('children', []) if c in S.jset), None)
        if ft is None: return 0.0
        a = [y - x for x, y in zip(W[th][0], W[knee][0])]; b = [y - x for x, y in zip(W[knee][0], W[ft][0])]
        la, lb = math.sqrt(sum(x * x for x in a)) or 1, math.sqrt(sum(x * x for x in b)) or 1
        return math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b)) / (la * lb))))
    straight = {j: bend(min((W for _, W in poses), key=lambda W: flex(W, smap[j])), smap[j]) for j, v in kinds.items() if v == 'knee'}
    # the hips' average position (parent space) and the source's lowest foot over time
    hmean = [sum(l.get(sroot, S.rest[sroot])[0][c] for l, _ in poses) / len(poses) for c in range(3)]
    sfeet = [S.byname[n] for n in FEET if n in S.byname]; tfeet = [T.byname[n] for n in FEET if n in T.byname]
    slow = [min(W[f][0][1] for f in sfeet) for _, W in poses] if sfeet and tfeet else None
    sground = min(slow) if slow else 0.0
    tground = min(Wt0[f][0][1] for f in tfeet) if slow else 0.0
    tilt = (math.sin(math.radians(lean) / 2), 0.0, 0.0, math.cos(math.radians(lean) / 2))  # about +X: the top toward +Z
    rot_out = {j: [] for j in smap if kinds[j] != 'keep'}; pos_out = []
    tp = T.parent.get(troot)
    def to_parent(d):  # a world offset into the target hips' parent space
        if tp is None: return d
        ps = Wt0[tp][2]; d = qrot(qinv(Wt0[tp][1]), d); return (d[0] / ps[0], d[1] / ps[1], d[2] / ps[2])
    sp = S.parent.get(sroot)
    for f, (local, Ws) in enumerate(poses):
        WR = {}  # target world rotations, parents first
        for i in T.order:
            p = T.parent.get(i)
            pr = WR[p] if p is not None else (0.0, 0.0, 0.0, 1.0)
            kd = kinds.get(i, 'keep')
            if kd == 'body':
                WR[i] = qnorm(qmul(qmul(Ws[smap[i]][1], qinv(mean[i])), Wt0[i][1]))
                if lean and nm(tg, i) in UPPER: WR[i] = qnorm(qmul(tilt, WR[i]))
            elif kd == 'knee':
                sj = smap[i]; M = qmul(qinv(mean[p]), Wt0[p][1])  # target thigh frame -> source thigh frame
                d = qmul(bend(Ws, sj), qinv(straight[i]))
                WR[i] = qnorm(qmul(WR[p], qmul(qmul(qmul(qinv(M), d), M), qmul(qinv(Wt0[p][1]), Wt0[i][1]))))
            elif kd == 'arm':
                A = qmul(qinv(Ws[chest_s][1]), Ws[smap[i]][1])
                gain = arm_gain[1] if nm(tg, i).startswith('Right') else arm_gain[0]
                d = slerp_id(qnorm(qmul(qmul(K, qmul(A, qinv(amean[i]))), qinv(K))), gain)
                WR[i] = qnorm(qmul(WR[chest_t], qmul(d, qmul(qinv(Wt0[chest_t][1]), Wt0[i][1]))))
            else:
                WR[i] = qnorm(qmul(pr, T.rest[i][1]))
        tl = {}
        for i in T.order:
            p = T.parent.get(i)
            if i in WR and p is not None and p in WR: tl[i] = (T.rest[i][0], qnorm(qmul(qinv(WR[p]), WR[i])), T.rest[i][2])
            elif i in WR and i in T.jset: tl[i] = (T.rest[i][0], WR[i], T.rest[i][2])
        # hips: the source's sway around its average position, in world space, scaled
        d = [a - b for a, b in zip(local.get(sroot, S.rest[sroot])[0], hmean)]
        if sp is not None:
            ps = Ws0[sp][2]; d = qrot(Ws0[sp][1], (d[0] * ps[0], d[1] * ps[1], d[2] * ps[2]))
        d = [x * k for x in d]
        if slow:  # height: the lower foot as far off the ground as the source's
            d[1] = 0.0
            hp = tuple(a + b for a, b in zip(T.rest[troot][0], to_parent(tuple(d))))
            tl[troot] = (hp, tl[troot][1], tl[troot][2])
            Wt = T.world(tl)
            d[1] = tground + k * (slow[f] - sground) - min(Wt[x][0][1] for x in tfeet)
        hp = tuple(a + b for a, b in zip(T.rest[troot][0], to_parent(tuple(d))))
        pos_out.append(hp)
        for j in rot_out:
            q = tl[j][1]
            prev = rot_out[j][-1] if rot_out[j] else None
            if prev and sum(a * b for a, b in zip(prev, q)) < 0: q = tuple(-x for x in q)  # keep the track continuous
            rot_out[j].append(q)
    t0 = times[0]
    inp = add_acc(tg, tb, [x - t0 for x in times], 'SCALAR', minmax=True)
    an = {'name': name, 'samplers': [], 'channels': []}
    def channel(node, path, values, typ):
        an['samplers'].append({'input': inp, 'output': add_acc(tg, tb, values, typ), 'interpolation': 'LINEAR'})
        an['channels'].append({'sampler': len(an['samplers']) - 1, 'target': {'node': node, 'path': path}})
    for j in rot_out: channel(j, 'rotation', rot_out[j], 'VEC4')
    channel(troot, 'translation', pos_out, 'VEC3')
    tg.setdefault('animations', []).append(an)
    return len(times), times[-1] - t0, missing, k

def holding(shape):
    """p -> how wholly the shape holds p (0 outside, 1 inside; a faded capsule ramps up along its axis)."""
    if len(shape) == 6:
        x0, x1, y0, y1, z0, z1 = shape
        return lambda p: 1.0 if x0 <= p[0] <= x1 and y0 <= p[1] <= y1 and z0 <= p[2] <= z1 else 0.0
    a, c, r = shape[:3], shape[3:6], shape[6]
    fade = shape[7] if len(shape) > 7 else 0.0
    ab = [y - x for x, y in zip(a, c)]; ll = sum(x * x for x in ab) or 1.0
    def f(p):
        t = max(0.0, min(1.0, sum((p[k] - a[k]) * ab[k] for k in range(3)) / ll))
        if math.dist(p, [a[k] + t * ab[k] for k in range(3)]) > r: return 0.0
        if fade <= 0: return 1.0
        u = min(1.0, t * math.sqrt(ll) / fade)
        return u * u * (3 - 2 * u)
    return f

def pin(g, b, bone, shape):
    """Rebinds the vertices inside `shape` (box or capsule) to `bone` alone (float weights, 8/16-bit joints)."""
    joints = g['skins'][0]['joints']
    k = next(i for i, j in enumerate(joints) if g['nodes'][j].get('name') == bone)
    hold = holding(shape); n = 0
    for prim in g['meshes'][0]['primitives']:
        at = prim['attributes']
        P = read_acc(g, b, at['POSITION'])
        ja, wa = g['accessors'][at['JOINTS_0']], g['accessors'][at['WEIGHTS_0']]
        assert wa['componentType'] == 5126 and ja['componentType'] in (5121, 5123), 'unsupported skin attribute format'
        jf, js = ('<4B', 4) if ja['componentType'] == 5121 else ('<4H', 8)
        jv, wv = g['bufferViews'][ja['bufferView']], g['bufferViews'][wa['bufferView']]
        jb, jstride = jv.get('byteOffset', 0) + ja.get('byteOffset', 0), jv.get('byteStride') or js
        wb, wstride = wv.get('byteOffset', 0) + wa.get('byteOffset', 0), wv.get('byteStride') or 16
        for i, p in enumerate(P):
            h = hold(p)
            if h <= 0: continue
            n += 1
            if h >= 1:
                struct.pack_into(jf, b, jb + i * jstride, k, 0, 0, 0)
                struct.pack_into('<4f', b, wb + i * wstride, 1.0, 0.0, 0.0, 0.0)
                continue
            # blend: the bone takes share h, the others keep (1 - h) of theirs (the weakest one gives up its slot)
            jj = list(struct.unpack_from(jf, b, jb + i * jstride)); ww = list(struct.unpack_from('<4f', b, wb + i * wstride))
            ww = [w * (1 - h) for w in ww]
            if k in jj and ww[jj.index(k)] + h > 0: ww[jj.index(k)] += h
            else:
                m = ww.index(min(ww)); jj[m], ww[m] = k, h
            tot = sum(ww) or 1.0
            struct.pack_into(jf, b, jb + i * jstride, *jj)
            struct.pack_into('<4f', b, wb + i * wstride, *[w / tot for w in ww])
    return n

def main(argv):
    if len(argv) < 2: sys.exit(__doc__)
    tpath, out = argv[0], argv[1]
    tg, tb = read_glb(tpath)
    rest = argv[2:]
    native = len(tg.get('animations', []))
    i = 0
    while i < len(rest):
        flag = rest[i]
        if flag == '--drop-native':
            tg['animations'] = tg['animations'][native:]; native = 0; i += 1
            print('  dropped the native clips')
            continue
        val = rest[i + 1]; i += 2
        if flag == '--pin':
            bone, _, nums = val.partition(':')
            print('  pinned %d vertices to %s' % (pin(tg, tb, bone, [float(x) for x in nums.split(',')]), bone))
        elif flag == '--clip':
            name, spec = val.split('=', 1)
            spec, _, lean = spec.partition('~')
            spec, _, gain = spec.partition('@')
            path, _, idx = spec.partition('#')
            sg, sb = read_glb(path)
            gains = [float(x) for x in (gain or '1').split(',')]
            n, dur, missing, k = retarget(tg, tb, sg, sb, int(idx or 0), name, (gains[0], gains[-1]), float(lean or 0))
            print('  %s: %d keys, %.2fs, hips x%.2f%s' % (name, n, dur, k, (', unmatched bones: ' + ','.join(missing)) if missing else ''))
        else: sys.exit('unknown flag ' + flag)
    write_glb(out, tg, tb)

if __name__ == '__main__':
    main(sys.argv[1:])
