"""Independent coordinate probes for the native wave and turbulence stages."""
from pathlib import Path
import xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parent.parent
REF=ROOT/'reference/tutorial'; NS='http://www.adobe.com/products/aftereffects';E.register_namespace('',NS)
T=lambda s:'{'+NS+'}'+s
for stage in ['wave','turbulence']:
 for axis in [0,1]:
  tree=E.parse(REF/f'map-{axis}.aepx');r=tree.getroot();layer=r.find('.//'+T('Layr'))
  for g in layer.iter():
   ch=list(g)
   for i,e in enumerate(ch[:-1]):
    if e.tag==T('tdmn'):
     name=bytes.fromhex(e.get('bdata')).rstrip(b'\0').decode('utf8','replace')
     if name==('ADBE Turbulent Displace' if stage=='wave' else 'ADBE Wave Warp'):g.remove(e);g.remove(ch[i+1])
  tree.write(REF/f'{stage}-{axis}.aepx',encoding='utf-8',xml_declaration=True)
