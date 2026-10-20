"""Refine the reconstructed path with blur before turbulence, using two tutorial frames.
Offline fitting utility only; it does not run in either product renderer.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates, convolve1d
from scipy.optimize import least_squares
from scipy.special import expit
ROOT=Path(__file__).resolve().parent.parent; REF=ROOT/'reference/tutorial'
W,H=480,270
y,x=np.mgrid[:H,:W];screen=np.stack([(x+.5)*4-960,(y+.5)*4-540],-1)
wave=2*((screen[...,0]+960+.1377)/444%1)-1
q=screen.copy();q[...,1]+=88.9598*(2*np.sqrt(np.maximum(0,1-wave*wave))-1)-.2167
q=q.reshape(-1,2)
start=np.array([[-744,30],[-534,-80],[-386,-108],[-166,-68],[104,-13],[440,110],[710,-120]],float)
end=np.array(json.loads((REF/'fitted-path.json').read_text())['points'])
t=np.linspace(0,1,160)[:,None];b=np.hstack([(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3])
fields=np.load(REF/'turbulence-coordinates.npy')
rotation=[]
for angle in np.linspace(-8,8,25)*np.pi/180:
 c=np.cos(angle);s=np.sin(angle);p=screen@np.array([[c,s],[-s,c]])
 rotation.append([(p[...,1]+540)/4-.5,(p[...,0]+960)/4-.5])

def ease(time):
 x=np.clip(time/3.6,0,1);lo=0;hi=1
 for _ in range(24):
  t=(lo+hi)/2;bx=3*(1-t)**2*t*.6+3*(1-t)*t*t*.4+t**3
  if bx<x:lo=t
  else:hi=t
 return t*t*(3-2*t)

scenes=[]
for stamp,time in [(705,5.04),(745,3.04)]:
 im=np.asarray(Image.open(REF/f'tutorial-{stamp}.png').crop((650,227,1370,632)).resize((W,H),Image.Resampling.LANCZOS))
 mask=im.max(-1)>16
 frame=np.clip(time*10,0,44);idx=int(frame);f=fields[idx]*(1-(frame-idx))+fields[min(idx+1,44)]*(frame-idx)
 coords=[(f[...,1]+540)/4-.5,(f[...,0]+960)/4-.5]
 # The tutorial artwork is contained within this rectangle; keep its holes.
 roi=(x>90)&(x<365)&(y>10)&(y<255)
 scenes.append((mask,coords,roi,ease(time)))

def unpack(v):
 p=v[:6].reshape(3,2)*100;direction=np.array([np.cos(v[6]),np.sin(v[6])])
 return np.array([p[0],p[1],p[2]-direction*v[7]*100,p[2],p[2]+direction*v[8]*100,v[9:11]*100,v[11:13]*100])

def alpha(points,coords):
 curves=np.vstack([b@points[:4],b@points[3:7]])
 d,idx=cKDTree(curves).query(q);sdf=d-129.5
 for index,origin,direction in [(0,points[0],points[1]-points[0]),(319,points[-1],points[-2]-points[-1])]:
  dots=(q-origin)@(direction/np.linalg.norm(direction));selected=idx==index;sdf[selected]=np.maximum(sdf[selected],-dots[selected])
 a=np.clip(.5-sdf/4,0,1).reshape(H,W)
 for _ in range(3):
  for axis in (0,1):a=convolve1d(a,np.array([.875,1,.875])/2.75,axis=axis,mode='nearest')
 a=sum(map_coordinates(a,uv,order=1,mode='constant',cval=0,prefilter=False) for uv in rotation)/25
 return map_coordinates(a,coords,order=1,mode='constant',cval=0,prefilter=False)

count=0
def error(v):
 global count
 pts=unpack(v);result=[]
 for target,coords,roi,progress in scenes:
  a=alpha(start*(1-progress)+pts*progress,coords)
  result.append((expit((a-.072)/.045)-target)[roi])
 result.append((pts-end).ravel()*.00003)
 count+=1
 if count%100==0: print('Evaluations',count,flush=True)
 return np.concatenate(result)

if __name__=='__main__':
 dir=end[4]-end[3]
 v=np.r_[end[[0,1,3]].ravel()/100,np.arctan2(dir[1],dir[0]),np.linalg.norm(end[3]-end[2])/100,np.linalg.norm(dir)/100,end[[5,6]].ravel()/100]
 lo=np.full(13,-15.);hi=np.full(13,15.);lo[6]=-np.pi;hi[6]=np.pi;lo[7:9]=.05;hi[7:9]=12
 fit=least_squares(error,v,bounds=(lo,hi),max_nfev=65,diff_step=.001,ftol=2e-5,verbose=1)
 pts=unpack(fit.x)
 for target,coords,roi,progress in scenes:
  pred=alpha(start*(1-progress)+pts*progress,coords)>.072
  print('IoU:',(target&pred).sum()/(target|pred).sum())
 print(pts)
 (REF/'fitted-filtered-path.json').write_text(json.dumps({'points':pts.tolist(),'method':'Joint fit to tutorial 3.04 and 5.04 s, smooth middle tangent, box and Scratch filtering before turbulence. Reconstructed rather than original author data.'},indent=2))
