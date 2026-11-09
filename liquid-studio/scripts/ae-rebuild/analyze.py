"""Compare every native RGBA frame at i/25 to the same app frame.

The portrait crop follows the renderer coordinate transform exactly.
SSIM is reported around the material, never as percent identical pixels.
"""
from pathlib import Path
import cv2,numpy as np,json,subprocess,importlib.util
import argparse
p=argparse.ArgumentParser(description='Compare native AE material with exact app frames. No fitted alignment.');p.add_argument('native',type=Path);p.add_argument('captures',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
ROOT=Path(__file__).resolve().parents[2];WORK=args.native;OUT=args.output.parent;OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('metric',ROOT/'scripts/reference-study/compare-frames.py');metric=importlib.util.module_from_spec(spec);spec.loader.exec_module(metric)
x,y=np.meshgrid(960+((np.arange(540)+.5)/540-.5)*607.5-.5,(np.arange(960)+.5)/960*1080-.5);x=x.astype('float32');y=y.astype('float32');rows=[]
for kind in ['edge','merge','separate']:
 source=WORK/f'{kind}-material.mov';pipe=subprocess.Popen([str(ROOT/'desktop/node_modules/ffmpeg-static/ffmpeg'),'-v','error','-i',str(source),'-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE);previous=None
 (OUT/'native'/kind/'material').mkdir(parents=True,exist_ok=True)
 for frame in range(125):
  data=pipe.stdout.read(1920*1080*4)
  if len(data)!=1920*1080*4:raise ValueError((kind,frame,len(data)))
  native=np.frombuffer(data,np.uint8).reshape(1080,1920,4);a=cv2.remap(native,x,y,cv2.INTER_LINEAR);b=cv2.cvtColor(cv2.imread(str(args.captures/kind/'material'/f'{frame:04d}.png'),-1),cv2.COLOR_BGRA2RGBA)
  scores,previous=metric.frame_metrics(a[...,:3],b[...,:3],previous);am=a[...,3]>.5*255;bm=b[...,3]>.5*255;scores['alphaIoU']=float((am&bm).sum()/max(1,(am|bm).sum()));scores['alphaMAE255']=float(abs(a[...,3].astype(float)-b[...,3]).mean());rows.append({'case':kind,'frame':frame,'time':frame/25,**scores})
  if frame in [0,14,25,50,75,100,124]:cv2.imwrite(str(OUT/'native'/kind/'material'/f'{frame:04d}.png'),cv2.cvtColor(a,cv2.COLOR_RGBA2BGRA))
 pipe.stdout.close();pipe.wait()
 sel=[r for r in rows if r['case']==kind];print(kind,{k:float(np.mean([r[k] for r in sel])) for k in ['ssimForeground','maeForeground255','alphaIoU','alphaMAE255']},flush=True)
report={'frames':len(rows),'fps':25,'materialSize':[540,960],'alignment':'Same time i/25 and fixed centered portrait crop; no fitted registration or time shift','source':'Original AE effect stack applied to the same rasterized union; true native alpha','perFrame':rows,'cases':{kind:{k:{'mean':float(np.mean([r[k] for r in rows if r['case']==kind and k in r])),'min':float(np.min([r[k] for r in rows if r['case']==kind and k in r])),'max':float(np.max([r[k] for r in rows if r['case']==kind and k in r]))} for k in ['ssimForeground','maeForeground255','alphaIoU','alphaMAE255','temporalDeltaMAE255']} for kind in ['edge','merge','separate']}}
args.output.write_text(json.dumps(report,indent=2))
