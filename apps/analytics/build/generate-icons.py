#!/usr/bin/env python3
"""Reproduce the original Analytics application icon with Pillow (source tooling)."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent
s=1024
im=Image.new('RGBA',(s,s),(0,0,0,0)); d=ImageDraw.Draw(im)
d.rounded_rectangle((35,35,989,989),radius=204,fill='#112532')
d.rounded_rectangle((73,73,951,951),radius=172,outline='#224253',width=10)
# A shelf with four analysis columns: the retained-record/role lineage is suggested,
# without relying on the Reader's icon or any outside image.
d.line((215,752,821,752),fill='#95A9B5',width=28)
for x,top,color in [(226,442,'#5DAEFF'),(382,300,'#F7C568'),(538,369,'#73DCA0'),(694,220,'#A694EE')]:
 d.rounded_rectangle((x,top,x+101,719),radius=22,fill=color)
 d.line((x+22,top+42,x+79,top+42),fill='#112532',width=9)
d.line((262,357,419,214,582,280,743,139),fill='#DDE8EC',width=17)
for pt in [(262,357),(419,214),(582,280),(743,139)]:
 d.ellipse((pt[0]-18,pt[1]-18,pt[0]+18,pt[1]+18),fill='#DDE8EC')
(root/'icons').mkdir(exist_ok=True)
for size in [16,24,32,48,64,128,256,512]:
 im.resize((size,size),Image.Resampling.LANCZOS).save(root/'icons'/f'{size}x{size}.png')
im.save(root/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
