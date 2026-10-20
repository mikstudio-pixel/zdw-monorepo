"""Fit an explicitly approximate source curve to the tutorial's final silhouette."""
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from scipy.optimize import least_squares
from scipy.special import expit
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
REF=ROOT/'reference/tutorial'
coords=np.load(REF/'deformation-coordinates.npy')[-1,::2,::2].reshape(-1,2)
im=np.asarray(Image.open(REF/'tutorial-705.png').crop((650,227,1370,632)).resize((240,135),Image.Resampling.BILINEAR))
mask=im.max(-1)>32
# Exclude distant background while keeping all displaced lobes and negative space.
use=(np.abs(coords[:,0])<900)&(np.abs(coords[:,1])<650)
q=coords[use];target=mask.ravel()[use].astype(float)
t=np.linspace(0,1,96)[:,None]
b=np.hstack([(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3])
initial=np.array([(872,526),(927,472),(996,485),(1072,490),(1090,500),(931,419),(978,337)],float)
initial=(initial-[1010,429.5])/.375

def distance(points):
 curves=np.vstack([b@points[:4],b@points[3:7]])
 d,idx=cKDTree(curves).query(q)
 sdf=d-129.5
 # AE's default stroke uses butt caps.
 for index,origin,direction in [(0,points[0],points[1]-points[0]),(191,points[-1],points[-2]-points[-1])]:
  dots=(q-origin)@(direction/np.linalg.norm(direction))
  selected=idx==index;sdf[selected]=np.maximum(sdf[selected],-dots[selected])
 return sdf

def unpack(v):
 p=v[:6].reshape(3,2)*100
 direction=np.array([np.cos(v[6]),np.sin(v[6])])
 return np.array([p[0],p[1],p[2]-direction*v[7]*100,p[2],p[2]+direction*v[8]*100,v[9:11]*100,v[11:13]*100])

def error(values):
 pts=unpack(values)
 d=distance(pts)
 return np.concatenate([expit(-d/10)-target,(pts-initial).ravel()*.00006])

v=np.r_[initial[[0,1,3]].ravel()/100,.12,3.,.8,initial[[5,6]].ravel()/100]
lo=np.full(13,-15.);hi=np.full(13,15.);lo[6]=-np.pi;hi[6]=np.pi;lo[7:9]=.05;hi[7:9]=12
fit=least_squares(error,v,bounds=(lo,hi),max_nfev=200,diff_step=.001,verbose=1,ftol=1e-5)
pts=unpack(fit.x)
pred=distance(pts)<0
print('IoU',np.sum(pred&target.astype(bool))/np.sum(pred|target.astype(bool)))
print(pts)
(REF/'fitted-path.json').write_text(json.dumps({'points':pts.tolist(),'method':'Silhouette fit against 5.04 s tutorial preview, native coordinate probes, approximate blur. Not source-author control points.'},indent=2))
