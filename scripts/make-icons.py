"""Render the GM cube mark as install icons. Requires Pillow, only for regeneration."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'public' / 'icons'
root.mkdir(exist_ok=True)
for name, size in [('icon-192',192),('icon-512',512),('maskable-512',512),('apple-touch-icon',180)]:
    scale = size * 3
    image = Image.new('RGB', (scale,scale), '#17191e')
    draw = ImageDraw.Draw(image)
    points = [(0.5,0.22),(0.74,0.36),(0.74,0.64),(0.5,0.78),(0.26,0.64),(0.26,0.36),(0.5,0.22)]
    line = lambda pts: draw.line([(round(x*scale),round(y*scale)) for x,y in pts], fill='#c2c6ff', width=round(scale*0.025),joint='curve')
    line(points)
    line([(0.26,0.36),(0.5,0.5),(0.74,0.36)])
    line([(0.5,0.5),(0.5,0.78)])
    image.resize((size,size),Image.Resampling.LANCZOS).save(root/(name+'.png'))
