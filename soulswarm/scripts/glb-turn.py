#!/usr/bin/env python3
"""Turns a GLB's meshes about the vertical axis by baking the rotation into its float POSITION/NORMAL/TANGENT data.

usage: glb-turn.py in.glb out.glb DEGREES
The image-to-3D models come out facing +X; the rigging service assumes the glTF convention (facing +Z) and builds a
sideways skeleton otherwise, so they are turned by -90 before rigging (scripts/hero-models.sh).
"""
import json, math, struct, sys

def main(src, dst, deg):
    data = open(src, 'rb').read()
    jl = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + jl])
    bl = struct.unpack_from('<I', data, 20 + jl)[0]
    binc = bytearray(data[28 + jl: 28 + jl + bl])
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    done = set()
    for n in g['nodes']:
        assert not any(k in n for k in ('rotation', 'matrix', 'translation', 'scale')), 'node transforms are not supported'
    for m in g['meshes']:
        for p in m['primitives']:
            for key in ('POSITION', 'NORMAL', 'TANGENT'):
                i = p['attributes'].get(key)
                if i is None or i in done: continue
                done.add(i)
                a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
                assert a['componentType'] == 5126, key + ' must be float'
                n = 4 if a['type'] == 'VEC4' else 3
                stride = bv.get('byteStride') or n * 4
                base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
                lo, hi = [math.inf] * 3, [-math.inf] * 3
                for k in range(a['count']):
                    o = base + k * stride
                    x, y, z = struct.unpack_from('<3f', binc, o)
                    x, z = x * c + z * s, -x * s + z * c  # yaw by `deg` (right-handed, +Y up)
                    struct.pack_into('<3f', binc, o, x, y, z)
                    for j, v in enumerate((x, y, z)): lo[j] = min(lo[j], v); hi[j] = max(hi[j], v)
                if 'min' in a: a['min'][:3], a['max'][:3] = lo, hi
    js = json.dumps(g, separators=(',', ':')).encode('utf8'); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(binc))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + bytes(binc)
    open(dst, 'wb').write(out)

if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]))
