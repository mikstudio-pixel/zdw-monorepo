"""Create coordinate probes on disposable AE copies for deformation research."""
from pathlib import Path
import struct
import xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parent.parent
REF=ROOT/'reference/tutorial'
NS='http://www.adobe.com/products/aftereffects'
E.register_namespace('',NS)
def tag(s):return '{'+NS+'}'+s

def properties(root):
 for g in root.iter():
  ch=list(g)
  for i,e in enumerate(ch[:-1]):
   if e.tag==tag('tdmn'):
    yield bytes.fromhex(e.get('bdata')).rstrip(b'\0').decode('utf8','replace'),ch[i+1],g,e

def setval(p,values):
 c=p.find(tag('cdat')); old=bytes.fromhex(c.get('bdata'))
 data=struct.pack('>'+len(values)*'d',*values)
 c.set('bdata',(data+old[len(data):]).hex())

for axis in (0,1):
 tree=E.parse(REF/'liquid-calibrated.aepx');r=tree.getroot();layer=r.find('.//'+tag('Layr'))
 for name,p,g,e in list(properties(layer)):
  if name in ('APC Colorama','ADBE Box Blur2','CC Radial Blur'):
   g.remove(e);g.remove(p)
  elif name=='ADBE Vector Grad Type':setval(p,[1])
  elif name=='ADBE Vector Grad Start Pt':setval(p,[-1600,0] if axis==0 else [0,-1000])
  elif name=='ADBE Vector Grad End Pt':setval(p,[1600,0] if axis==0 else [0,1000])
  elif name=='ADBE Vector Stroke Width':setval(p,[6000])
 pts=[(-3000,0),(-2000,0),(-1000,0),(0,0),(1000,0),(2000,0),(3000,0),(3000,0),(-3000,0)]
 for shape in layer.iter(tag('shap')):
  shape.find(tag('shph')).set('bdata',(bytes.fromhex('b3de0209')+struct.pack('>4f',-3000,-1,3000,1)+bytes.fromhex('01000000')).hex())
  shape.find(tag('list')+'/'+tag('ldat')).set('bdata',struct.pack('>18f',*[v for x,y in pts for v in ((x+3000)/6000,.5)]).hex())
 for name in ['nhed','nnhd']:
  e=r.find(tag(name));b=bytearray.fromhex(e.get('bdata'));b[15 if name=='nhed' else 21]=1;e.set('bdata',b.hex())
 tree.write(REF/f'map-{axis}.aepx',encoding='utf-8',xml_declaration=True)
