#!/usr/bin/env python3
"""Writes the catalog into Safari's Bookmarks.plist, inside ONE managed top-level folder (default "StewardOS"). Never touches anything else.
Safe by default: without --apply it only prints what it would do. With --apply it refuses unless Safari is closed, backs up the plist,
writes to a temp file, replaces atomically, then reads it back and checks. Only the managed folder is replaced; no other bookmark is touched or deleted.
  python3 scripts/safari_sync.py [--apply] [--only "Pinned"] [--folder StewardOS] [--plist PATH] [--catalog PATH] [--no-safari-check]"""
import sys, os, json, uuid, shutil, subprocess, plistlib, argparse, tempfile, datetime
ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true"); ap.add_argument("--status", action="store_true", help="print test | pending | current and exit"); ap.add_argument("--only", help="only this top-level catalog folder (for tests)")
ap.add_argument("--folder", default="StewardOS"); ap.add_argument("--no-safari-check", action="store_true")
home = os.path.expanduser("~")
ap.add_argument("--plist", default=os.path.join(home, "Library/Safari/Bookmarks.plist"))
ap.add_argument("--catalog", default=os.path.join(home, "Organized/_Bookmarks/catalog.json"))
ap.add_argument("--backups", default=os.path.join(home, "Organized/_Bookmarks/backups"))
ap.add_argument("--state", default=os.path.join(home, "Organized/_Bookmarks/sync-state.json"))
a = ap.parse_args()

import hashlib
def load_state():
    try: return json.load(open(a.state))
    except Exception: return {}
def cat_sha(): return hashlib.sha256(open(a.catalog, "rb").read()).hexdigest()
if a.status:
    st = load_state().get("safari", {})
    print("test" if not st.get("test_ok") else ("current" if st.get("catalog_sha") == cat_sha() else "pending")); sys.exit(0)

def uid(): return str(uuid.uuid4()).upper()
def leaf(e): return {"WebBookmarkType": "WebBookmarkTypeLeaf", "WebBookmarkUUID": uid(), "URLString": e["url"], "URIDictionary": {"title": e.get("title") or e["host"]}}
def folder(name, kids): return {"WebBookmarkType": "WebBookmarkTypeList", "WebBookmarkUUID": uid(), "Title": name, "Children": kids}

def build(cat, only):
    root = {}
    def node(path):
        n = root
        for p in path.split(" › "): n = n.setdefault("k", {}).setdefault(p, {})
        return n
    for p in cat["tree"]:
        if only and p.split(" › ")[0] != only: continue
        node(p)
    n = 0
    for e in cat["entries"]:
        if e.get("status", "active") != "active": continue
        for f in [e["folder"]] + e.get("also", []):
            if only and f.split(" › ")[0] != only: continue
            node(f).setdefault("items", []).append(e); n += 1
    def conv(d):
        kids = [leaf(e) for e in sorted(d.get("items", []), key=lambda e: (e.get("title") or "").lower())]
        for name, sub in sorted(d.get("k", {}).items(), key=lambda kv: (kv[0] != "Pinned", kv[0].lower())): kids.append(folder(name, conv(sub)))
        return kids
    return conv(root), n

def count_leaves(x):
    if x.get("WebBookmarkType") == "WebBookmarkTypeLeaf": return 1
    return sum(count_leaves(c) for c in x.get("Children", []))

cat = json.load(open(a.catalog))
kids, n = build(cat, a.only)
with open(a.plist, "rb") as f: pl = plistlib.load(f)
before = count_leaves(pl)
existing = [c for c in pl.get("Children", []) if c.get("Title") == a.folder and c.get("WebBookmarkType") == "WebBookmarkTypeList"]
print(f"Catalog: {n} placements{' (only ' + a.only + ')' if a.only else ''}. Safari file has {before} bookmarks; managed folder '{a.folder}' {'exists with ' + str(count_leaves(existing[0])) + ' bookmarks and will be replaced' if existing else 'does not exist yet and will be created'}.")
if not a.apply: print("DRY RUN: nothing written. Add --apply to write (Safari must be closed)."); sys.exit(0)

if not a.no_safari_check and subprocess.run(["pgrep", "-x", "Safari"], capture_output=True).returncode == 0:
    print("WAITING: Safari is open, so nothing was written. Quit Safari (⌘Q) and run again."); sys.exit(2)
ts = datetime.datetime.utcnow().strftime("%Y-%m-%d-%H-%M-%S-%f"); bdir = os.path.join(a.backups, "safari-sync-" + ts)
os.makedirs(bdir); shutil.copy2(a.plist, os.path.join(bdir, "Bookmarks.plist"))
new_folder = folder(a.folder, kids)
pl["Children"] = [new_folder if c in existing else c for c in pl["Children"]] if existing else pl["Children"] + [new_folder]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(a.plist), suffix=".tmp"); os.close(fd)
with open(tmp, "wb") as f: plistlib.dump(pl, f, fmt=plistlib.FMT_BINARY)
os.replace(tmp, a.plist)
with open(a.plist, "rb") as f: back = plistlib.load(f)
mf = [c for c in back["Children"] if c.get("Title") == a.folder]
others_before = before - (count_leaves(existing[0]) if existing else 0); others_after = count_leaves(back) - (count_leaves(mf[0]) if mf else 0)
ok = len(mf) == 1 and count_leaves(mf[0]) == n and others_before == others_after
print(f"{'PASS' if ok else 'PROBLEM'} — wrote '{a.folder}' with {count_leaves(mf[0]) if mf else 0} bookmarks; all other bookmarks unchanged ({others_before} -> {others_after}). Backup: {bdir}")
if ok:
    stt = load_state(); sf = stt.setdefault("safari", {})
    if a.only: sf["test_ok"] = True
    else: sf["catalog_sha"] = cat_sha(); sf["at"] = datetime.datetime.utcnow().isoformat() + "Z"
    json.dump(stt, open(a.state, "w"), indent=1)
sys.exit(0 if ok else 1)
