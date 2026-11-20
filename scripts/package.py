"""Create the Community plugins installation ZIP from the built distribution."""
from pathlib import Path
import json
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
manifest = json.loads((dist / "manifest.json").read_text())
files = ["manifest.json", manifest["main"], manifest["backend"], manifest["styles"], "PDFJS-LICENSE"]
output = root / "downloads" / f"{manifest['id']}-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(dist / name, f"{manifest['id']}/dist/{name}")
print(output)
