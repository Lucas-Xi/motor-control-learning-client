from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "assets" / "generated"
QUALITY = 78
MAX_WIDTH = 1536


def optimize_png(path: Path) -> Path:
    out = path.with_suffix(".webp")
    with Image.open(path) as image:
        image = image.convert("RGB")
        if image.width > MAX_WIDTH:
            ratio = MAX_WIDTH / image.width
            target = (MAX_WIDTH, round(image.height * ratio))
            image = image.resize(target, Image.Resampling.LANCZOS)
        image.save(out, "WEBP", quality=QUALITY, method=6)
    return out


def main() -> None:
    if not ASSET_DIR.exists():
        raise SystemExit(f"Asset directory not found: {ASSET_DIR}")

    png_files = sorted(ASSET_DIR.glob("*.png"))
    if not png_files:
        raise SystemExit(f"No PNG assets found in {ASSET_DIR}")

    for png in png_files:
        webp = optimize_png(png)
        before = png.stat().st_size
        after = webp.stat().st_size
        ratio = after / before if before else 0
        print(f"{png.name} -> {webp.name} {before} -> {after} bytes ({ratio:.1%})")


if __name__ == "__main__":
    main()
