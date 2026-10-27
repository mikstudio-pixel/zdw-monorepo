"""Measure every reference edge and fit the shared premultiplied optical filter.

Profiles are sampled normal to each edge, normalized to its local interior,
and aligned at half intensity. This measures softness, not whole-video similarity.
"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.optimize import minimize

def edge_profiles(rgb,frame):
 h,w=rgb.shape[:2];scale=1920/w
 value=rgb.max(-1).astype(np.float32)
 mask=(value>45).astype(np.uint8)
 contours,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
 points=np.vstack([c[:,0] for c in contours if len(c)>30])[::4] if any(len(c)>30 for c in contours) else np.empty((0,2))
 if len(points)>240:points=points[np.linspace(0,len(points)-1,240).astype(int)]
 if not len(points):return [],[]
 smooth=cv2.GaussianBlur(value,(0,0),1.2);iy,ix=np.gradient(smooth)
 grad=np.stack([ix[points[:,1],points[:,0]],iy[points[:,1],points[:,0]]],-1)
 norm=np.linalg.norm(grad,axis=-1);points=points[norm>1.5];grad=grad[norm>1.5];norm=norm[norm>1.5]
 normals=grad/norm[:,None];offsets=np.arange(-24,32.01,.5,dtype=np.float32)/scale
 coord=(points[:,None]+normals[:,None]*offsets[None,:,None]).astype(np.float32)
 sample=cv2.remap(rgb.astype(np.float32),coord,None,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
 base=np.median(sample[:,offsets*scale>20],axis=1)
 alpha=(sample*base[:,None]).sum(-1)/np.maximum((base*base).sum(-1)[:,None],1)
 alpha=gaussian_filter1d(alpha,1,axis=1)
 records=[];profiles=[];axis=offsets*scale
 for i,curve in enumerate(alpha):
  if sample[i,:8].max()>20 or base[i].max()<65 or curve.max()>1.3:continue
  # Reject nearby second edges and color boundaries; retain monotonic ramps.
  neg=-np.minimum(np.diff(curve),0).sum()
  if neg>.25 or curve[-1]<.8:continue
  curve=np.maximum.accumulate(curve)
  crossings=np.interp([.1,.5,.9],curve,axis)
  width=crossings[2]-crossings[0]
  if width<1 or width>50 or abs(crossings[1])>18:continue
  aligned=np.interp(np.arange(-20,20.01,.5)+crossings[1],axis,alpha[i])
  x,y=points[i]*scale;nx,ny=normals[i];radius=np.hypot(x-960,y-540)
  angular=abs(nx*(-(y-540))+ny*(x-960))
  records.append([frame,x,y,nx,ny,width,radius,angular]);profiles.append(aligned)
 return records,profiles

def teacher_edges(reference, work):
    destination = work / 'teacher-edges.npz'
    manifest = work / 'teacher-manifest.json'
    if manifest.exists() and json.loads(manifest.read_text())['sha256'] != hashlib.sha256(reference.read_bytes()).hexdigest():
        raise ValueError('Work directory belongs to a different reference')
    if destination.exists():
        return np.load(destination)
    capture = cv2.VideoCapture(str(reference))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    records, profiles = [], []
    for index in range(count):
        ok, image = capture.read()
        if not ok:
            raise ValueError('Unexpected end of reference')
        image = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), (960, 540), interpolation=cv2.INTER_AREA)
        values, ramps = edge_profiles(image, index)
        records.extend(values)
        profiles.extend(ramps)
        if index % 120 == 0:
            print('Measured reference edges', index, '/', count, flush=True)
    capture.release()
    np.savez_compressed(destination, records=np.array(records), profiles=np.array(profiles))
    return np.load(destination)


def filter_image(image, sigma, angle, kernel, rotations):
    # Exact discrete bilinear-tap approximation of the shared WebGL pass.
    if sigma > 0:
        distances = np.arange(-8, 9) * sigma / 6
        weights = np.exp(-.5 * np.arange(-8, 9) ** 2 / 9)
        weights /= weights.sum()
        radius = int(np.ceil(abs(distances).max()))
        coefficients = np.zeros(radius * 2 + 1, np.float32)
        for delta, weight in zip(distances, weights):
            start = int(np.floor(delta))
            fraction = delta - start
            coefficients[start + radius] += weight * (1 - fraction)
            if fraction > 0:
                coefficients[start + 1 + radius] += weight * fraction
        identity = np.array([1], np.float32)
        image = cv2.sepFilter2D(image, -1, coefficients, identity, borderType=cv2.BORDER_REPLICATE)
        image = cv2.sepFilter2D(image, -1, identity, coefficients, borderType=cv2.BORDER_REPLICATE)
    if angle > 0:
        key = round(float(angle), 8)
        if key not in rotations:
            y, x = np.mgrid[:540, :960].astype(np.float32)
            x, y = x - 479.5, y - 269.5
            rotations[key] = [np.stack([np.cos(a) * x - np.sin(a) * y + 479.5,
                                       np.sin(a) * x + np.cos(a) * y + 269.5], -1).astype(np.float32)
                              for a in np.linspace(-angle, angle, 17)]
        total = np.zeros_like(image, dtype=np.float32)
        weights = np.ones(17) if kernel == 'box' else np.exp(-.5 * np.arange(-8, 9) ** 2 / 9)
        for uv, weight in zip(rotations[key], weights):
            total += cv2.remap(image, uv, None, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE) * weight
        image = np.rint(total / weights.sum()).astype(np.uint8)
    return image


def fit_filter(raw, teacher, work, kernel):
    records, profiles = teacher['records'], teacher['profiles']
    count = int(records[:, 0].max()) + 1
    indices = list(range(0, count, 24))
    images = {i: cv2.cvtColor(cv2.imread(str(raw / f'{i:04d}.png')), cv2.COLOR_BGR2RGB) for i in indices}
    targets = {i: (np.percentile(records[records[:, 0] == i, 5], [10, 25, 50, 75, 90]),
                   profiles[records[:, 0] == i].mean(0)) for i in indices}
    history, rotations = [], {}

    def objective(parameters):
        sigma, angle = parameters
        if sigma < 0 or angle < .005 or sigma > 6 or angle > .12:
            return 1000
        widths, ramps = [], []
        for index in indices:
            image = filter_image(images[index], sigma, angle, kernel, rotations)
            values, ramp = edge_profiles(image, index)
            if len(values) < 10:
                return 1000
            quantiles = np.percentile(np.array(values)[:, 5], [10, 25, 50, 75, 90])
            target_width, target_ramp = targets[index]
            widths.append(np.mean(abs(np.log(quantiles / target_width))))
            ramps.append(np.mean(abs(np.mean(ramp, axis=0) - target_ramp)))
        record = {'sigma': float(sigma), 'angle': float(angle), 'kernel': kernel,
                  'loss': float(np.mean(widths) + 4 * np.mean(ramps)),
                  'widthLogError': float(np.mean(widths)), 'profileMAE': float(np.mean(ramps))}
        history.append(record)
        print(record, flush=True)
        return record['loss']

    for sigma in [.4, .8, 1.6, 2.4]:
        for angle in ([.025, .035, .045, .055] if kernel == 'box' else [.045, .055, .065, .075]):
            objective([sigma, angle])
    best = min(history, key=lambda value: value['loss'])
    minimize(objective, [best['sigma'], best['angle']], method='Nelder-Mead',
             options={'maxiter': 12, 'xatol': .04, 'fatol': .0005})
    best = min(history, key=lambda value: value['loss'])
    report = {'best': best, 'trainingFrames': indices, 'validationRule': 'frame % 24 == 12',
              'meaning': 'Normalized edge-ramp error; not whole-video similarity', 'evaluations': history}
    (work / f'softness-{kernel}-fit.json').write_text(json.dumps(report, indent=2))


def evaluate(rendered, teacher, work):
    reference, target_profiles = teacher['records'], teacher['profiles']
    frames, records, profiles = [], [], []
    for index in range(int(reference[:, 0].max()) + 1):
        image = cv2.cvtColor(cv2.imread(str(rendered / f'{index:04d}.png')), cv2.COLOR_BGR2RGB)
        image = cv2.resize(image, (960, 540), interpolation=cv2.INTER_AREA)
        values, ramp = edge_profiles(image, index)
        values, ramp = np.array(values), np.array(ramp)
        records.extend(values)
        profiles.extend(ramp)
        selected = reference[:, 0] == index
        target_widths = np.percentile(reference[selected, 5], [10, 25, 50, 75, 90])
        widths = np.percentile(values[:, 5], [10, 25, 50, 75, 90])
        frames.append({'frame': index, 'widths': widths.tolist(), 'referenceWidths': target_widths.tolist(),
                       'profileMAE': float(abs(ramp.mean(0) - target_profiles[selected].mean(0)).mean()),
                       'widthLogError': float(abs(np.log(widths / target_widths)).mean())})
    records = np.array(records)
    np.savez_compressed(work / 'evaluated-edges.npz', records=records, profiles=np.array(profiles))
    report = {'frames': frames, 'referenceQuantiles': np.percentile(reference[:, 5], [10, 25, 50, 75, 90]).tolist(),
              'generatedQuantiles': np.percentile(records[:, 5], [10, 25, 50, 75, 90]).tolist(),
              'profileMAE': float(np.mean([value['profileMAE'] for value in frames])),
              'validationProfileMAE': float(np.mean([value['profileMAE'] for value in frames if value['frame'] % 24 == 12]))}
    (work / 'edge-evaluation.json').write_text(json.dumps(report, indent=2))
    print({key: value for key, value in report.items() if key != 'frames'}, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('work', type=Path)
    parser.add_argument('--fit-raw', type=Path, help='Directory with 0000.png through 0803.png')
    parser.add_argument('--kernel', choices=['box', 'gaussian'], default='box')
    parser.add_argument('--evaluate', type=Path)
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(2)
    teacher = teacher_edges(args.reference, args.work)
    if args.fit_raw:
        fit_filter(args.fit_raw, teacher, args.work, args.kernel)
    if args.evaluate:
        evaluate(args.evaluate, teacher, args.work)


if __name__ == '__main__':
    main()
