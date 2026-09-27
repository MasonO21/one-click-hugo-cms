"""Crop a slimmed Meshy OBJ to a box, dropping anything outside it (Meshy sometimes adds a plinth or scenery).

Usage:  python crop_obj.py path/to/model.obj xmin xmax ymin ymax zmin zmax

Keeps only faces whose vertices all sit inside the box, then drops unused vertices. Coordinates are the OBJ's own.
"""
import sys


def main():
    path = sys.argv[1]
    lo = [float(sys.argv[2]), float(sys.argv[4]), float(sys.argv[6])]
    hi = [float(sys.argv[3]), float(sys.argv[5]), float(sys.argv[7])]
    lines = open(path, encoding="ascii").read().splitlines()
    v, vn, vt, faces = [], [], [], []
    for l in lines:
        if l.startswith("v "): v.append(l)
        elif l.startswith("vn "): vn.append(l)
        elif l.startswith("vt "): vt.append(l)
        elif l.startswith("f "): faces.append([int(c.split("/")[0]) for c in l.split()[1:]])

    def inside(i):
        p = [float(c) for c in v[i - 1].split()[1:4]]
        return all(lo[k] <= p[k] <= hi[k] for k in range(3))

    kept = [f for f in faces if all(inside(i) for i in f)]
    remap = {}
    for f in kept:
        for i in f:
            if i not in remap: remap[i] = len(remap) + 1
    order = sorted(remap, key=remap.get)
    out = ["# Cropped by tools/meshy/crop_obj.py"]
    out += [v[i - 1] for i in order]
    out += [vn[i - 1] for i in order] if len(vn) == len(v) else []
    out += [vt[i - 1] for i in order] if len(vt) == len(v) else []
    for f in kept:
        out.append("f " + " ".join("{0}/{0}/{0}".format(remap[i]) for i in f))
    open(path, "w", encoding="ascii", newline="\n").write("\n".join(out) + "\n")
    print("kept %d of %d faces, %d of %d vertices" % (len(kept), len(faces), len(remap), len(v)))


if __name__ == "__main__":
    main()
