"""Fit Colorama colors to interior pixels of the tutorial (geometry kept fixed)."""
import importlib.util,json
import numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates,convolve1d
from scipy.optimize import lsq_linear
from PIL import Image
from pathlib import Path
p=Path(__file__).with_name('fit-liquid-filtered-path.py');spec=importlib.util.spec_from_file_location('reference_math',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
end=np.array(json.loads((m.REF/'fitted-filtered-path.json').read_text())['points'])
positions=np.array([0,.10,.42,.46,.64,.90,.99998]);colors=np.array([[201,191,145],[198,193,162],[162,185,235],[168,186,216],[242,205,83],[249,53,99],[247,50,99]])
phase=np.clip(1-np.linalg.norm(m.q-[-16,-58],axis=1)/688.72346,0,.99998)
weights=np.stack([np.interp(phase,positions,np.eye(7)[i]) for i in range(7)],axis=-1)
rows=[];values=[]
for stamp,(_,coords,roi,progress) in zip([705,745],m.scenes):
 pts=m.start*(1-progress)+end*progress
 curves=np.vstack([m.b@pts[:4],m.b@pts[3:7]])
 d,idx=cKDTree(curves).query(m.q);sdf=d-129.5
 for index,origin,direction in [(0,pts[0],pts[1]-pts[0]),(319,pts[-1],pts[-2]-pts[-1])]:
  dots=(m.q-origin)@(direction/np.linalg.norm(direction));selected=idx==index;sdf[selected]=np.maximum(sdf[selected],-dots[selected])
 alpha=np.clip(.5-sdf/4,0,1)
 channels=[]
 for i in range(7):
  a=(alpha*weights[:,i]).reshape(m.H,m.W)
  for _ in range(3):
   for axis in (0,1):a=convolve1d(a,np.array([.875,1,.875])/2.75,axis=axis,mode='nearest')
  a=sum(map_coordinates(a,uv,order=1,mode='constant',cval=0,prefilter=False) for uv in m.rotation)/25
  channels.append(map_coordinates(a,coords,order=1,mode='constant',cval=0,prefilter=False))
 A=np.stack(channels,axis=-1)
 im=np.asarray(Image.open(m.REF/f'tutorial-{stamp}.png').crop((650,227,1370,632)).resize((m.W,m.H),Image.Resampling.LANCZOS))
 use=(A.sum(-1)>.995)&(im.max(-1)>150)&roi
 rows.append(A[use]);values.append(im[use])
A=np.vstack(rows);Y=np.vstack(values)
# Keep under-observed palette stops close to the recorded palette approximation.
AA=np.vstack([A,np.eye(7)*8]);YY=np.vstack([Y,colors*8])
fit=np.stack([lsq_linear(AA,YY[:,i],bounds=(0,255)).x for i in range(3)],axis=1).round().astype(int)
print('Interior RGB MAE before',abs(A@colors-Y).mean(),'after',abs(A@fit-Y).mean(),'pixels',len(A))
print(fit)
(m.REF/'fitted-palette.json').write_text(json.dumps({'positions':positions.tolist(),'colors':fit.tolist(),'interiorSamples':len(A),'method':'Constrained linear Colorama fit to confident interior pixels in tutorial 3.04 and 5.04 s, fixed geometry; not author palette data.'},indent=2))
