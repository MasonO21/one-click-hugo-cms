#!/usr/bin/env python3
"""Fill in release.config.json everywhere and produce the ready-to-use release folder.

  python3 tools/apply_config.py            # render everything, warn about placeholder values
  python3 tools/apply_config.py --strict   # exit 1 if any value is still a placeholder (use before submitting)

Outputs (all git-ignored, safe to regenerate):
  release/legal/*.html          upload these to your website (they must be at the URLs in release.config.json)
  release/appstore/**           text to paste into App Store Connect (metadata length limits are checked)
  ios/project.yml               XcodeGen spec
  ios/NightPrecinct/Products.storekit   local StoreKit test file for Xcode
  game/www/index.html           the game, built for the app
"""
import argparse, html, json, pathlib, re, shutil, subprocess, sys, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKEN = re.compile(r"\{\{([A-Z_]+)\}\}")

# App Store Connect limits (characters)
LIMITS = {"name.txt": 30, "subtitle.txt": 30, "promotional_text.txt": 170, "keywords.txt": 100,
          "description.txt": 4000, "release_notes.txt": 4000, "review_notes.txt": 4000,
          "copyright.txt": 200, "support_url.txt": 255, "marketing_url.txt": 255, "privacy_url.txt": 255}

PLACEHOLDER = re.compile(r"\[[A-Z ,/']+\]|example\.com|yourcompany|XXXXXXXXXX")


def load():
    cfg = json.loads((ROOT / "release.config.json").read_text())
    cfg.pop("_comment", None)
    cfg["YEAR"] = str(datetime.date.today().year)
    return cfg


def render(text, cfg, where):
    lenient = str(where).endswith(".md")  # prose docs may mention tokens by name
    esc = str(where).endswith(".html")    # values are placed into HTML: escape &, <, > and quotes

    def rep(m):
        k = m.group(1)
        if k not in cfg:
            if lenient:
                return m.group(0)
            sys.exit("apply_config: unknown token {{%s}} in %s" % (k, where))
        v = str(cfg[k])
        return html.escape(v, quote=True) if esc else v
    return TOKEN.sub(rep, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--no-build", action="store_true")
    a = ap.parse_args()
    cfg = load()

    placeholders = {k: v for k, v in cfg.items() if isinstance(v, str) and PLACEHOLDER.search(v)}
    problems = []

    out = ROOT / "release"
    for sub in ("legal", "appstore"):
        shutil.rmtree(out / sub, ignore_errors=True)

    # legal pages
    n = 0
    for src in sorted((ROOT / "legal").glob("*")):
        if src.is_file():
            dst = out / "legal" / src.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.suffix in (".html", ".css", ".txt", ".md"):
                dst.write_text(render(src.read_text(), cfg, str(src)))
            else:
                shutil.copy(src, dst)
            n += 1
    print("legal:    %d files -> release/legal/" % n)

    # app store text
    n = 0
    for src in sorted((ROOT / "appstore").rglob("*")):
        if src.is_file() and src.suffix in (".txt", ".md", ".json"):
            rel = src.relative_to(ROOT / "appstore")
            dst = out / "appstore" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            txt = render(src.read_text(), cfg, str(src))
            dst.write_text(txt)
            lim = LIMITS.get(src.name)
            if lim and "metadata" in rel.parts:
                cnt = len(txt.rstrip("\n"))
                if cnt > lim:
                    problems.append("%s is %d characters (limit %d)" % (rel, cnt, lim))
            n += 1
        elif src.is_file():
            dst = out / "appstore" / src.relative_to(ROOT / "appstore")
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)
    print("appstore: %d text files -> release/appstore/" % n)

    # ios templates
    for tmpl in sorted((ROOT / "ios").rglob("*.tmpl")):
        dst = tmpl.with_suffix("")
        dst.write_text(render(tmpl.read_text(), cfg, str(tmpl)))
        print("ios:      %s -> %s" % (tmpl.relative_to(ROOT), dst.relative_to(ROOT)))

    # game
    if not a.no_build:
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build.py"), "--target", "native"])

    # sanity checks that catch the classic first-submission mistakes
    if not re.fullmatch(r"[A-Za-z0-9.-]+\.[A-Za-z0-9.-]+", cfg["BUNDLE_ID"]):
        problems.append("BUNDLE_ID looks invalid: %r" % cfg["BUNDLE_ID"])
    if not re.fullmatch(r"\d+\.\d+(\.\d+)?", cfg["VERSION"]):
        problems.append("VERSION must look like 1.0.0")
    for k in ("PRIVACY_URL", "SUPPORT_URL", "TERMS_URL", "PURCHASE_TERMS_URL", "ODDS_URL", "NOTICES_URL", "WEBSITE_URL"):
        if not cfg[k].startswith("https://"):
            problems.append("%s must be an https:// URL" % k)
    for f in (ROOT / "game" / "www" / "index.html",):
        if f.exists() and TOKEN.search(f.read_text()):
            problems.append("unresolved tokens remain in %s" % f.relative_to(ROOT))
    if len(cfg["APP_NAME"]) > 30:
        problems.append("APP_NAME is longer than 30 characters")

    print()
    for p in problems:
        print("PROBLEM: " + p)
    if placeholders:
        print("Still placeholders in release.config.json (fine for testing, NOT for submission):")
        for k, v in placeholders.items():
            print("   %-20s %s" % (k, v))
    if problems or (a.strict and placeholders):
        sys.exit(1)
    if not placeholders:
        print("Config looks complete.")


if __name__ == "__main__":
    main()
