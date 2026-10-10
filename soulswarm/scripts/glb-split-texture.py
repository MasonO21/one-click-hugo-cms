#!/usr/bin/env python3
"""Moves the painted (base colour) image out of a GLB: writes it to its own file and strips every image, texture and sampler
from the GLB (the game textures the hero itself, so the web build never needs blob: URLs to decode one).
usage: python3 scripts/glb-split-texture.py in.glb out.glb out-texture.webp
Works on uncompressed GLBs (run it before meshopt / quantize)."""
import json, struct, sys

src, dst, tex = sys.argv[1:4]
data = open(src, 'rb').read()
magic, version, _ = struct.unpack_from('<III', data, 0)
assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
off, chunks = 12, {}
while off < len(data):
    n, kind = struct.unpack_from('<II', data, off)
    chunks[kind] = data[off + 8:off + 8 + n]
    off += 8 + n
gltf = json.loads(chunks[0x4E4F534A])
bin_ = chunks[0x004E4942]
views = gltf['bufferViews']

images = gltf.get('images', [])
# the first material's base colour (a rig with a normal and a roughness map may list those first); else the first image
pick = 0
mats = gltf.get('materials', [])
bct = mats[0].get('pbrMetallicRoughness', {}).get('baseColorTexture') if mats else None
if bct is not None:
    t = gltf['textures'][bct['index']]
    pick = t.get('extensions', {}).get('EXT_texture_webp', {}).get('source', t.get('source', 0))
assert images and 'bufferView' in images[pick], 'no embedded image'
img_view = images[pick]['bufferView']
v = views[img_view]
o = v.get('byteOffset', 0)
open(tex, 'wb').write(bin_[o:o + v['byteLength']])

# drop the image views and repack the binary chunk (4-byte aligned)
drop = {im['bufferView'] for im in images if 'bufferView' in im}
remap, keep, out = {}, [], bytearray()
for i, bv in enumerate(views):
    if i in drop: continue
    o = bv.get('byteOffset', 0)
    while len(out) % 4: out.append(0)
    piece = bin_[o:o + bv['byteLength']]
    bv = dict(bv, byteOffset=len(out))
    out += piece
    remap[i] = len(keep)
    keep.append(bv)
while len(out) % 4: out.append(0)
gltf['bufferViews'] = keep
for acc in gltf.get('accessors', []):
    if 'bufferView' in acc: acc['bufferView'] = remap[acc['bufferView']]
    sp = acc.get('sparse')
    if sp:
        sp['indices']['bufferView'] = remap[sp['indices']['bufferView']]
        sp['values']['bufferView'] = remap[sp['values']['bufferView']]
gltf['buffers'][0]['byteLength'] = len(out)
for k in ('images', 'textures', 'samplers'): gltf.pop(k, None)
for m in gltf.get('materials', []):
    pbr = m.get('pbrMetallicRoughness', {})
    for k in ('baseColorTexture', 'metallicRoughnessTexture'): pbr.pop(k, None)
    for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): m.pop(k, None)
for key in ('extensionsUsed', 'extensionsRequired'):
    if key in gltf:
        gltf[key] = [e for e in gltf[key] if e not in ('EXT_texture_webp', 'KHR_texture_transform')]
        if not gltf[key]: gltf.pop(key)

js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)
print(f'{dst}: {12 + len(body)} bytes, texture {len(open(tex, "rb").read())} bytes')
