# Offline test of scripts/safari_sync.py with a synthetic plist and catalog. Touches no real Safari file.
import plistlib, json, os, subprocess, tempfile
d = tempfile.mkdtemp(); pl = os.path.join(d, "Bookmarks.plist")
leaf = lambda t, u: {"WebBookmarkType": "WebBookmarkTypeLeaf", "WebBookmarkUUID": t, "URLString": u, "URIDictionary": {"title": t}}
plistlib.dump({"WebBookmarkType": "WebBookmarkTypeList", "Title": "", "Children": [{"WebBookmarkType": "WebBookmarkTypeList", "Title": "Favorites", "Children": [leaf("keep1", "https://k1.com"), leaf("keep2", "https://k2.com")]}, leaf("loose", "https://l.com")]}, open(pl, "wb"), fmt=plistlib.FMT_BINARY)
cat = {"tree": ["Pinned", "Money", "Money › Crypto & Markets"], "entries": [{"url": "https://a.com", "title": "A", "host": "a.com", "folder": "Pinned", "also": ["Money › Crypto & Markets"]}, {"url": "https://b.com", "title": "B", "host": "b.com", "folder": "Money › Crypto & Markets", "also": []}]}
cp = os.path.join(d, "catalog.json"); json.dump(cat, open(cp, "w"))
here = os.path.dirname(os.path.abspath(__file__))
run = lambda *x: subprocess.run(["python3", os.path.join(here, "safari_sync.py"), "--plist", pl, "--catalog", cp, "--backups", os.path.join(d, "bk"), "--state", os.path.join(d, "st.json"), "--no-safari-check", *x], capture_output=True, text=True)
titles = lambda: [c.get("Title") for c in plistlib.load(open(pl, "rb"))["Children"]]
assert run("--status").stdout.strip() == "test"
r = run(); assert r.returncode == 0 and "DRY RUN" in r.stdout and "StewardOS" not in titles(), "dry run must not write"
r = run("--apply", "--only", "Pinned"); assert "PASS" in r.stdout and run("--status").stdout.strip() == "pending"  # test passed, full sync still due
r = run("--apply"); print(r.stdout); assert r.returncode == 0 and "PASS" in r.stdout and titles().count("StewardOS") == 1 and run("--status").stdout.strip() == "current"
json.dump({**cat, "entries": cat["entries"] + [{"url": "https://c.com", "title": "C", "host": "c.com", "folder": "Pinned", "also": []}]}, open(cp, "w")); assert run("--status").stdout.strip() == "pending", "catalog changed -> pending"
r = run("--apply"); print(r.stdout); assert "PASS" in r.stdout and titles().count("StewardOS") == 1, "re-run replaces, never duplicates"
back = plistlib.load(open(pl, "rb")); fav = [c for c in back["Children"] if c.get("Title") == "Favorites"][0]; assert len(fav["Children"]) == 2, "other folders untouched"
assert any(c.get("URLString") == "https://l.com" for c in back["Children"]), "loose bookmark untouched"
r = run("--apply", "--only", "Pinned"); print(r.stdout); assert "PASS" in r.stdout
assert len(os.listdir(os.path.join(d, "bk"))) == 4, "a backup per write"
r = subprocess.run(["python3", os.path.join(here, "safari_sync.py"), "--plist", pl, "--catalog", cp, "--backups", os.path.join(d, "bk"), "--state", os.path.join(d, "st.json"), "--apply"], capture_output=True, text=True)
print("safari-check run:", r.stdout.strip()[:80], "| code", r.returncode)
print("SAFARI SYNC TEST PASS")
