from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "social-preview.png"
W, H = 1200, 630
image = Image.new("RGB", (W, H), "#f2f5f5")
draw = ImageDraw.Draw(image)

FONT_ROOT = Path("/usr/share/fonts/truetype/dejavu")
regular = ImageFont.truetype(str(FONT_ROOT / "DejaVuSans.ttf"), 19)
small = ImageFont.truetype(str(FONT_ROOT / "DejaVuSans.ttf"), 15)
label = ImageFont.truetype(str(FONT_ROOT / "DejaVuSans-Bold.ttf"), 14)
wordmark = ImageFont.truetype(str(FONT_ROOT / "DejaVuSans-Bold.ttf"), 25)
headline = ImageFont.truetype(str(FONT_ROOT / "DejaVuSans-Bold.ttf"), 57)

ink = "#172a34"
muted = "#53656e"
accent = "#a6491f"
teal = "#75c9ca"
dark = "#12232d"

# Split the card into a quiet editorial block and a diagram block.
draw.rectangle((0, 0, 735, H), fill="#f2f5f5")
draw.rectangle((735, 0, W, H), fill=dark)

# Small brand mark.
draw.ellipse((59, 49, 85, 75), outline="#d47a47", width=3)
draw.ellipse((66, 49, 92, 75), outline="#55aeb4", width=3)
draw.ellipse((72, 58, 79, 65), fill=accent)
draw.text((106, 48), "gm°", font=wordmark, fill=ink)

draw.rounded_rectangle((60, 143, 317, 178), radius=17, fill="#e1ebec")
draw.text((77, 151), "OPENMC GEOMETRY STUDIO", font=label, fill="#3d5863")
draw.text((59, 218), "Model.", font=headline, fill=ink)
draw.text((59, 284), "Inspect.", font=headline, fill=ink)
draw.text((59, 350), "Export.", font=headline, fill=accent)
draw.text((63, 449), "A browser workspace for OpenMC geometry.", font=regular, fill=muted)
draw.text((63, 486), "Local edits · linked views · starter XML", font=small, fill=muted)
draw.line((63, 548, 345, 548), fill="#c9d4d8", width=2)
draw.text((63, 568), "gm.keff.uk", font=label, fill=ink)

# Technical drafting grid.
for x in range(766, W, 31):
    draw.line((x, 0, x, H), fill="#243843", width=1)
for y in range(0, H, 31):
    draw.line((735, y, W, y), fill="#243843", width=1)

# Concentric fuel-pin section. This is a diagram, not a computed result.
cx, cy = 968, 305
for radius, color, width in [(203, "#46616c", 2), (157, teal, 4), (119, "#d8e2df", 3), (105, "#e5a06c", 2), (100, "#e88b4e", 0)]:
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    if width:
        draw.ellipse(box, outline=color, width=width)
    else:
        draw.ellipse(box, fill=color)

# Crosshair and labeled leaders.
draw.line((cx - 235, cy, cx + 235, cy), fill="#314a55", width=1)
draw.line((cx, cy - 228, cx, cy + 228), fill="#314a55", width=1)
draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill="#f6e7cd")

def leader(start, end_x, text, color):
    end = (end_x, start[1])
    draw.line((start, end), fill=color, width=2)
    draw.ellipse((start[0] - 4, start[1] - 4, start[0] + 4, start[1] + 4), fill=color)
    draw.text((end_x + 9, start[1] - 12), text, font=small, fill="#d9e4e6")

leader((cx + 96, cy - 24), 1083, "FUEL", "#e8a36d")
leader((cx + 117, cy + 48), 1104, "GAP", "#d8e2df")
leader((cx + 154, cy + 116), 1083, "CLAD", teal)

draw.rounded_rectangle((778, 514, 1154, 560), radius=12, fill="#1c333e", outline="#34515c", width=1)
draw.text((798, 529), "PIN CELL  /  XY SECTION", font=label, fill="#dce8e9")
draw.text((1146, 529), "01", font=label, fill="#85cfd0", anchor="ra")

image.save(OUTPUT, format="PNG", optimize=True)
print(f"Wrote {OUTPUT} ({W}×{H})")
