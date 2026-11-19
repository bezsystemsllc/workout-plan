"""Stage only browser assets for local serving and Netlify publishing."""
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def stage(destination):
    assets = json.loads((ROOT / "scripts/public-assets.json").read_text())
    for name in [*assets, "_headers"]:
        source = ROOT / name
        if source.resolve() != source or not source.is_file():
            raise ValueError(f"Invalid public asset: {name}")
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


if __name__ == "__main__":
    # Build into a fresh directory so stale files cannot be published.
    import tempfile
    destination = ROOT / "dist"
    with tempfile.TemporaryDirectory(dir=ROOT) as work:
        output = Path(work) / "site"
        stage(output)
        if destination.exists():
            # Only replace directories created by this builder.
            marker = destination / ".tempo-build"
            if not marker.is_file():
                raise SystemExit("dist exists and was not created by Tempo")
            shutil.rmtree(destination)
        (output / ".tempo-build").touch()
        output.rename(destination)
