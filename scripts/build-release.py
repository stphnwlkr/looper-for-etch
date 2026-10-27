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
dest = root / "dist"
dest.mkdir(exist_ok=True)
package = dest / "looper-for-etch.zip"
files = [root / p for p in ("looper-for-etch.php", "query-support.php", "query-options.json", "updater.php", "LICENSE", "readme.txt")]
files += sorted((root / "assets").glob("*"))
with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        if path.is_file():
            archive.write(path, "looper-for-etch/" + str(path.relative_to(root)))
manifest = {"version": version, "requires": field("Requires at least"), "requires_php": field("Requires PHP"), "package": f"https://github.com/stphnwlkr/looper-for-etch/releases/download/v{version}/looper-for-etch.zip", "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}
(dest / "looper-for-etch-update.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(package)
