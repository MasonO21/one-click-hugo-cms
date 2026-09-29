#!/usr/bin/env python3
"""Build the game into one self-contained HTML file.

  python3 tools/build.py --target native            -> game/www/index.html   (bundled in the iOS app)
  python3 tools/build.py --target preview           -> release/preview/night_precinct.html (web preview fragment)
  python3 tools/build.py --target native --debug    -> keeps window.__np test hooks (used only by tests/)

Fonts are embedded as base64 data URIs, so the game makes no network requests.
Tokens like {{APP_NAME}} come from release.config.json.
"""
import argparse, base64, json, pathlib, re, sys, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "game" / "src"
FONTS = ROOT / "game" / "fonts"

FONT_FACES = [
    ("Big Shoulders Display", 700, "big-shoulders-display-latin-700-normal.woff2"),
    ("Big Shoulders Display", 800, "big-shoulders-display-latin-800-normal.woff2"),
    ("Big Shoulders Display", 900, "big-shoulders-display-latin-900-normal.woff2"),
    ("Barlow Semi Condensed", 400, "barlow-semi-condensed-latin-400-normal.woff2"),
    ("Barlow Semi Condensed", 500, "barlow-semi-condensed-latin-500-normal.woff2"),
    ("Barlow Semi Condensed", 600, "barlow-semi-condensed-latin-600-normal.woff2"),
    ("Barlow Semi Condensed", 700, "barlow-semi-condensed-latin-700-normal.woff2"),
    ("Share Tech Mono", 400, "share-tech-mono-latin-400-normal.woff2"),
]


def load_config():
    cfg = json.loads((ROOT / "release.config.json").read_text())
    cfg.pop("_comment", None)
    cfg["YEAR"] = str(datetime.date.today().year)
    return cfg


def font_css():
    out = []
    for family, weight, fname in FONT_FACES:
        b64 = base64.b64encode((FONTS / fname).read_bytes()).decode()
        out.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}" % (family, weight, b64)
        )
    return "\n".join(out)


def subst(text, cfg):
    def rep(m):
        key = m.group(1)
        if key not in cfg:
            sys.exit("build.py: unknown token {{%s}}" % key)
        return str(cfg[key])
    return re.sub(r"\{\{([A-Z_]+)\}\}", rep, text)


def build(target, debug, out_override=None):
    cfg = load_config()
    css = (SRC / "styles.css").read_text()
    markup = (SRC / "markup.html").read_text()
    js_files = sorted(SRC.glob("[0-9][0-9]-*.js"))
    js = "\n".join(p.read_text() for p in js_files)
    if not debug:
        js = re.sub(r"/\*DEBUG_HOOK_START\*/.*?/\*DEBUG_HOOK_END\*/", "", js, flags=re.S)
        if "__np" in js:
            sys.exit("build.py: debug hook leaked into a release build")
    js = subst(js, cfg)
    markup = subst(markup, cfg)
    css = subst(css, cfg)
    js = js.replace("</script", "<\\/script")  # never let script text close the tag

    style = font_css() + "\n" + css
    if target == "native":
        html = (
            "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover\">\n"
            "<meta name=\"color-scheme\" content=\"dark\">\n<meta name=\"format-detection\" content=\"telephone=no\">\n"
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; "
            "style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; media-src 'none'; "
            "base-uri 'none'; form-action 'none'\">\n"
            "<title>%s</title>\n<style>\n:root{--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px)}\n"
            "html,body{margin:0;height:100%%;background:#070a19}\n%s\n</style>\n</head>\n<body>\n%s\n<script>\n%s\n</script>\n</body>\n</html>\n"
            % (cfg["APP_NAME"], style, markup, js)
        )
        out = pathlib.Path(out_override) if out_override else ROOT / "game" / "www" / "index.html"
    else:
        # The web preview loads its fonts from Google Fonts (smaller page); the native build embeds them.
        links = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                 '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600;700&family=Big+Shoulders+Display:wght@700;800;900&family=Share+Tech+Mono&display=swap">\n')
        html = "<title>%s</title>\n%s<style>\n%s\n</style>\n%s\n<script>\n%s\n</script>\n" % (cfg["APP_NAME"], links, css, markup, js)
        out = pathlib.Path(out_override) if out_override else ROOT / "release" / "preview" / "night_precinct.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    return out, len(html)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["native", "preview"], required=True)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--out", help="override output path")
    a = ap.parse_args()
    path, size = build(a.target, a.debug, a.out)
    print("built %s (%d KB)%s" % (path, size // 1024, " [debug hooks]" if a.debug else ""))
