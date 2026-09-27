"""Generate hero models with Meshy's Text to 3D API and drop them into Resources/Models/Meshy.

Usage:  python meshy_generate.py [name ...]      (no names: every model in models.json)
        python meshy_generate.py --balance       (show remaining credits; free)

The API key is read from the MESHY_API_KEY environment variable (on Windows, the user-level variable is used even if
this shell started before it was set). The key is never printed or written anywhere.

Each model costs a preview (mesh) plus a refine (texture). Task ids are recorded in meshy_tasks.json as soon as they
exist, so re-running resumes finished or in-flight work instead of paying for it again.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "Assets", "_Project", "Resources", "Models", "Meshy"))
TASKS = os.path.join(HERE, "meshy_tasks.json")
API = "https://api.meshy.ai/openapi/v2/text-to-3d"
STYLE = ("Stylized low-poly game asset, chunky cosy proportions, clean simple shapes, hand-painted look, "
         "just the object by itself standing directly on the ground: no pedestal, plinth, display base, diorama, "
         "terrain, plants or scenery. ")


def api_key():
    key = os.environ.get("MESHY_API_KEY")
    if not key and os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                key = winreg.QueryValueEx(k, "MESHY_API_KEY")[0]
        except OSError:
            key = None
    if not key:
        sys.exit("MESHY_API_KEY isn't set. Set it yourself (see tools/meshy/README.md); never paste it into a chat.")
    return key


def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("Authorization", "Bearer " + api_key())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit("Meshy %s %s failed: HTTP %d %s" % (method, url.replace(API, ""), e.code, e.read().decode(errors="replace")[:300]))


def load_tasks():
    if os.path.exists(TASKS):
        with open(TASKS, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_tasks(tasks):
    with open(TASKS, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)


def wait(task_id, label):
    last = -1
    while True:
        t = call("GET", API + "/" + task_id)
        if t["status"] == "SUCCEEDED":
            print("  %s done (%s credits)" % (label, t.get("consumed_credits", "?")))
            return t
        if t["status"] in ("FAILED", "CANCELED"):
            sys.exit("  %s %s: %s" % (label, t["status"], (t.get("task_error") or {}).get("message", "")))
        if t.get("progress", 0) != last:
            last = t.get("progress", 0)
            print("  %s %s%%" % (label, last))
        time.sleep(8)


def download(url, path):
    with urllib.request.urlopen(url, timeout=300) as r, open(path, "wb") as f:
        f.write(r.read())
    print("  saved %s (%.1f MB)" % (os.path.relpath(path, HERE), os.path.getsize(path) / 1e6))


def generate(spec, tasks):
    name = spec["name"]
    state = tasks.setdefault(name, {})
    print(name)
    if "preview" not in state:
        state["preview"] = call("POST", API, {
            "mode": "preview",
            "prompt": STYLE + spec["prompt"],
            "ai_model": "meshy-6",
            "should_remesh": True,
            "topology": "triangle",
            "target_polycount": spec.get("polycount", 6000),
            "origin_at": "bottom",
            "target_formats": ["fbx"],
        })["result"]
        save_tasks(tasks)
    wait(state["preview"], "mesh")
    if "refine" not in state:
        state["refine"] = call("POST", API, {
            "mode": "refine",
            "preview_task_id": state["preview"],
            "enable_pbr": False,
            "texture_resolution": "2k",
            "texture_prompt": spec.get("texture", spec["prompt"]),
            "target_formats": ["fbx"],
        })["result"]
        save_tasks(tasks)
    t = wait(state["refine"], "texture")
    os.makedirs(OUT, exist_ok=True)
    download(t["model_urls"]["fbx"], os.path.join(OUT, name + ".fbx"))
    tex = (t.get("texture_urls") or [{}])[0].get("base_color")
    if tex:
        download(tex, os.path.join(OUT, name + "_basecolor.png"))
    state["done"] = True
    save_tasks(tasks)


def main():
    if "--balance" in sys.argv:
        req = urllib.request.Request("https://api.meshy.ai/openapi/v1/balance")
        req.add_header("Authorization", "Bearer " + api_key())
        with urllib.request.urlopen(req, timeout=30) as r:
            print("Balance: %s credits" % json.load(r)["balance"])
        return
    with open(os.path.join(HERE, "models.json"), encoding="utf-8") as f:
        specs = json.load(f)
    wanted = [a for a in sys.argv[1:] if not a.startswith("-")]
    tasks = load_tasks()
    for spec in specs:
        if wanted and spec["name"] not in wanted:
            continue
        if tasks.get(spec["name"], {}).get("done") and os.path.exists(os.path.join(OUT, spec["name"] + ".fbx")):
            print(spec["name"] + ": already generated")
            continue
        generate(spec, tasks)


if __name__ == "__main__":
    main()
