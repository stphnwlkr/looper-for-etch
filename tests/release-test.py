"""Ensure releases cannot bypass changelog/version checks or package development files."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
with tempfile.TemporaryDirectory() as directory:
    stage = Path(directory) / "plugin"
    shutil.copytree(root, stage, ignore=shutil.ignore_patterns(".git", "node_modules", "dist"))
    def run():
        return subprocess.run(["python3", str(stage / "scripts/build-release.py"), version], capture_output=True, text=True)
    assert run().returncode == 0
    with zipfile.ZipFile(stage / "dist/looper-for-etch.zip") as archive:
        names = archive.namelist()
        assert "looper-for-etch/changelog.json" in names
        assert "looper-for-etch/native-queries.php" in names
        assert all(name.startswith("looper-for-etch/") for name in names)
        assert not any("/tests/" in name or "/.git" in name or "/node_modules/" in name for name in names)
    original = (stage / "changelog.json").read_text()
    history = json.loads(original)
    for label, bad in [("missing current version", history[1:]), ("duplicate version", [history[0]] + history), ("empty summary", [{**history[0], "summary": ""}] + history[1:])]:
        (stage / "changelog.json").write_text(json.dumps(bad))
        assert run().returncode != 0, label
    (stage / "changelog.json").write_text(original)
    package = json.loads((stage / "package.json").read_text())
    package["version"] = "0.0.0"
    (stage / "package.json").write_text(json.dumps(package))
    assert run().returncode != 0
print("PASS release packaging and changelog/version gates")
