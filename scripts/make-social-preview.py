"""Build the link card from an actual GM workspace screenshot."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (1200,630), '#17191e')
draw = ImageDraw.Draw(image)
font_dir = Path('/usr/share/fonts/truetype/dejavu')
font = lambda name, size: ImageFont.truetype(str(font_dir/name), size)
regular = font('DejaVuSans.ttf',22)
large = font('DejaVuSans.ttf',44)
brand = font('DejaVuSans-Bold.ttf',32)
# The card uses application geometry rather than a fabricated rendering.
shot = Image.open(root/'output/workspace-local.jpg').convert('RGB').crop((230,101,1280,646))
shot.thumbnail((850,480), Image.Resampling.LANCZOS)
image.paste(shot,(330,90))
draw.line((330,90,1180,90),fill='#343740',width=1)
draw.text((44,46),'gm',font=brand,fill='#eeeef2')
draw.text((44,204),'OpenMC',font=large,fill='#eeeef2')
draw.text((44,264),'geometry',font=large,fill='#eeeef2')
draw.text((44,324),'studio',font=large,fill='#eeeef2')
draw.text((44,560),'gm.keff.uk',font=regular,fill='#a9acb7')
image.save(root/'public/social-preview.png',optimize=True)
