"""Copy an unmodified workspace screenshot, preserving its actual image format."""
import argparse
from pathlib import Path
import shutil
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("screenshot", type=Path, help="PNG or JPEG captured from the GM workspace")
args = parser.parse_args()
with Image.open(args.screenshot) as image:
    if image.size != (1280, 720) or image.format not in ('PNG','JPEG'):
        parser.error("Capture a 1280 x 720 PNG or JPEG screenshot.")
    extension = 'jpg' if image.format == 'JPEG' else 'png'
root = Path(__file__).resolve().parent.parent
shutil.copyfile(args.screenshot, root / ('public/social-preview.'+extension))
