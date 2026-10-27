"""Build a stable plugin ZIP and checksum manifest from an explicit runtime allowlist."""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
version = sys.argv[1]
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise SystemExit("Use a stable X.Y.Z version")
header = (root / "looper-for-etch.php").read_text()
def field(name):
    match = re.search(r"^ \* " + re.escape(name) + r": (.+)$", header, re.M)
    if not match:
        raise SystemExit("Missing header: " + name)
    return match[1].strip()
if field("Version") != version:
    raise SystemExit("Tag does not match plugin version")
# Every release must carry a new, complete, newest-first changelog entry.
try:
    history = json.loads((root / "changelog.json").read_text())
except (ValueError, OSError) as error:
    raise SystemExit("Invalid changelog.json: " + str(error))
if not isinstance(history, list) or not history or history[0].get("version") != version:
    raise SystemExit("Add the current version as the newest changelog entry")
seen = set()
previous = None
for entry in history:
    release_version = entry.get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", release_version) or release_version in seen:
        raise SystemExit("Invalid or duplicate changelog version")
    current = tuple(map(int, release_version.split(".")))
    if previous is not None and current >= previous:
        raise SystemExit("Changelog entries must be newest first")
    seen.add(release_version)
    previous = current
    if not isinstance(entry.get("summary"), str) or not entry["summary"].strip():
        raise SystemExit("Every changelog entry needs a summary")
    changes = entry.get("changes")
    if not isinstance(changes, dict) or not changes:
        raise SystemExit("Every changelog entry needs categorized changes")
    for category, items in changes.items():
        if not isinstance(items, list) or not items or any(not isinstance(item, str) or not item.strip() for item in items):
            raise SystemExit("Change categories need nonempty string lists")
for name in ("package.json", "package-lock.json"):
    package_data = json.loads((root / name).read_text())
    if package_data.get("version") != version or (name == "package-lock.json" and package_data.get("packages", {}).get("", {}).get("version") != version):
        raise SystemExit("Version mismatch in " + name)
if not re.search(r"^Stable tag: " + re.escape(version) + r"$", (root / "readme.txt").read_text(), re.M):
    raise SystemExit("Version mismatch in readme.txt")
dest = root / "dist"
dest.mkdir(exist_ok=True)
package = dest / "looper-for-etch.zip"
files = [root / p for p in ("looper-for-etch.php", "query-support.php", "native-queries.php", "preferences.php", "query-options.json", "updater.php", "LICENSE", "readme.txt", "changelog.json")]
files += sorted((root / "assets").glob("*"))
with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        if path.is_file():
            archive.write(path, "looper-for-etch/" + str(path.relative_to(root)))
manifest = {"version": version, "requires": field("Requires at least"), "requires_php": field("Requires PHP"), "package": f"https://github.com/stphnwlkr/looper-for-etch/releases/download/v{version}/looper-for-etch.zip", "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}
(dest / "looper-for-etch-update.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(package)

entry = history[0]
notes = ["## " + version, "", entry["summary"], ""]
for category, changes in entry["changes"].items():
    notes.extend(["### " + category.capitalize(), ""] + ["- " + change for change in changes] + [""])
(dest / "release-notes.md").write_text("\n".join(notes))
(dest / "changelog.json").write_bytes((root / "changelog.json").read_bytes())
