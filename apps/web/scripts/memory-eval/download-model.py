"""Download public, pinned evaluation artifacts; verify bytes before installing them."""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--model-dir", type=Path, required=True)
args = parser.parse_args()
manifest = json.loads((Path(__file__).parent / "model-manifest.json").read_text())
for name, expected in manifest["files"].items():
    destination = args.model_dir / name
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected["sha256"]:
        print("Verified", name)
        continue
    url = f'https://huggingface.co/{manifest["model"]}/resolve/{manifest["revision"]}/{name}'
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read(expected["bytes"] + 1)
    if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
        raise RuntimeError("Artifact checksum mismatch: " + name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    print("Downloaded and verified", name)
