"""Install an unmodified 1280 x 720 workspace screenshot as the social preview."""
import argparse
from pathlib import Path
import shutil
import struct

parser = argparse.ArgumentParser()
parser.add_argument("screenshot", type=Path, help="PNG captured from the GM workspace")
args = parser.parse_args()
header = args.screenshot.read_bytes()[:24]
if header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (1280, 720):
    parser.error("Capture a 1280 x 720 PNG screenshot.")
root = Path(__file__).resolve().parent.parent
shutil.copyfile(args.screenshot, root / "public/social-preview.png")
