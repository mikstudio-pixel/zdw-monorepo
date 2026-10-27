"""Distil a procedural velocity model from every adjacent reference frame pair.

Runtime exports contain spatial velocity modes and analytic temporal weights;
no RGB, alpha, masks, reference frames or frame-indexed displacement maps.
See README.md for isolated Python dependencies and reproducible commands.
"""
import argparse
import base64
import gzip
import hashlib
import itertools
import json
from pathlib import Path

import cv2
import numpy as np
from scipy.linalg import svd
from scipy.ndimage import distance_transform_edt, gaussian_filter


WIDTH, HEIGHT = 480, 270
MODEL_WIDTH, MODEL_HEIGHT = 96, 54


def extract(reference, work):
    digest = hashlib.sha256(reference.read_bytes()).hexdigest()
    capture = cv2.VideoCapture(str(reference))
    frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    source_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if abs(source_width / source_height - 16 / 9) > .001:
        raise ValueError('This calibration domain expects a 16:9 reference')
    manifest = {'sha256': digest, 'frames': frames, 'fps': fps,
                'sourceSize': [source_width, source_height], 'analysisSize': [WIDTH, HEIGHT]}
    existing = work / 'teacher-manifest.json'
    if existing.exists() and json.loads(existing.read_text()) != manifest:
        raise ValueError('Work directory belongs to a different reference; choose a new directory')
    existing.write_text(json.dumps(manifest, indent=2))
    flow = np.lib.format.open_memmap(work / 'flow.npy', mode='w+', dtype=np.float16,
                                    shape=(frames - 1, HEIGHT, WIDTH, 2))
    confidence = np.lib.format.open_memmap(work / 'confidence.npy', mode='w+', dtype=np.uint8,
                                          shape=(frames - 1, HEIGHT, WIDTH))
    algorithm = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    algorithm.setUseSpatialPropagation(True)
    algorithm.setFinestScale(0)
    y, x = np.mgrid[:HEIGHT, :WIDTH].astype(np.float32)
    grid = np.stack([x, y], -1)
    records = []

    def read():
        ok, image = capture.read()
        if not ok:
            raise ValueError('Unexpected end of reference')
        return cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), (WIDTH, HEIGHT),
                          interpolation=cv2.INTER_AREA)

    previous = read()
    for index in range(frames - 1):
        current = read()
        a, b = [cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) for image in [previous, current]]
        forward = algorithm.calc(a, b, None)
        backward = algorithm.calc(b, a, None)
        reverse = cv2.remap(backward, grid + forward, None, cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REPLICATE)
        warped = cv2.remap(current, grid + forward, None, cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REPLICATE)
        residual = np.abs(warped.astype(float) - previous).mean(-1)
        iy, ix = np.gradient(a.astype(float))
        gradient = np.hypot(ix, iy)
        reliable = ((previous.max(-1) > 35) & (gradient > 1.5)
                    & (np.linalg.norm(forward + reverse, axis=-1) < .45) & (residual < 10))
        weight = reliable * np.clip(gradient / 10, 0, 1)
        flow[index] = forward
        confidence[index] = np.rint(weight * 255)
        records.append({'frame': index, 'time': index / fps, 'samples': int(reliable.sum()),
                        'warpRgbMAE': float(residual[reliable].mean()),
                        'medianSpeed1080': float(np.median(np.linalg.norm(forward[reliable], axis=-1)) * fps * 4),
                        'meanVelocity1080': (forward[reliable].mean(0) * fps * 4).tolist()})
        previous = current
        if index % 60 == 0:
            print('Extracted pair', index, '/', frames - 1, flush=True)
    capture.release()
    (work / 'teacher-motion.json').write_text(json.dumps(records, indent=2))


def fit(work, tune):
    manifest = json.loads((work / 'teacher-manifest.json').read_text())
    flow = np.load(work / 'flow.npy', mmap_mode='r')
    confidence = np.load(work / 'confidence.npy', mmap_mode='r')
    count, fps = len(flow), manifest['fps']
    time = (np.arange(count) + .5) / fps
    train = np.arange(count) % 5 != 2
    numerator, denominator = np.zeros((HEIGHT, WIDTH, 2)), np.zeros((HEIGHT, WIDTH))
    # Even the prior excludes validation pairs. Held pairs never contribute
    # observations to the spatial modes, temporal fit or fill-in prior.
    for index in np.where(train)[0]:
        weight = confidence[index].astype(float) / 255
        numerator += flow[index].astype(float) * weight[..., None] * fps
        denominator += weight
    mean = numerator / np.maximum(denominator[..., None], .01)
    valid = denominator > 8
    nearest = distance_transform_edt(~valid, return_distances=False, return_indices=True)
    mean = mean[nearest[0], nearest[1]]
    distance = distance_transform_edt(~valid)
    blend = np.exp(-(distance / 35) ** 2)
    mean = mean * blend[..., None] + np.array([-5.2, 0.]) * (1 - blend[..., None])
    rng = np.random.default_rng(20261026)
    validation = []
    for index in np.where(~train)[0]:
        yy, xx = np.where((confidence[index] > 100)
                          & (np.linalg.norm(flow[index].astype(float), axis=-1) > .015))
        selected = rng.choice(len(yy), min(256, len(yy)), replace=False)
        yy, xx = yy[selected], xx[selected]
        validation.append((index, yy, xx, flow[index, yy, xx].astype(float) * fps))
    variants = [(1.5, .06), (.75, .025), (.4, .012)] if tune else [(.75, .025)]
    experiments, best = [], None
    for sigma, prior in variants:
        velocity = []
        for index in range(count):
            weight = confidence[index].astype(float) / 255
            value = flow[index].astype(float) * fps
            support = gaussian_filter(weight, sigma)
            observed = np.stack([gaussian_filter(value[..., axis] * weight, sigma) for axis in range(2)], -1)
            filled = (observed + mean * prior) / (support[..., None] + prior)
            velocity.append(cv2.resize(filled.astype(np.float32), (MODEL_WIDTH, MODEL_HEIGHT), interpolation=cv2.INTER_AREA))
        flat = np.array(velocity).reshape(count, -1)
        _, _, spatial = svd(flat[train], full_matrices=False, lapack_driver='gesdd')
        spatial = spatial[:64]
        amplitudes = flat @ spatial.T
        for rank, harmonics in itertools.product([32, 48, 64] if tune else [64],
                                                 [32, 48, 64] if tune else [64]):
            # Fixed reference domain is 26.8 s, including its final frame.
            frequencies = np.pi / (manifest['frames'] / fps) * np.arange(1, harmonics + 1) ** 1.015
            basis = np.column_stack([np.ones(count), *[function(time * frequency)
                                     for frequency in frequencies for function in [np.sin, np.cos]]])
            penalty = np.r_[.001, np.repeat(.002 + .03 * (frequencies / frequencies[-1]) ** 4, 2)]
            temporal = np.linalg.solve(basis[train].T @ basis[train] + np.diag(penalty),
                                       basis[train].T @ amplitudes[train, :rank])
            prediction = (basis @ temporal @ spatial[:rank]).reshape(count, MODEL_HEIGHT, MODEL_WIDTH, 2)
            errors, cosines = [], []
            for index, yy, xx, target in validation:
                value = cv2.resize(prediction[index].astype(np.float32), (WIDTH, HEIGHT))[yy, xx]
                errors.extend((np.linalg.norm(value - target, axis=-1) * 4).tolist())
                cosines.extend(((value * target).sum(-1) / np.maximum(np.linalg.norm(value, axis=-1)
                                * np.linalg.norm(target, axis=-1), .00001)).tolist())
            record = {'sigma': sigma, 'prior': prior, 'rank': rank, 'harmonics': harmonics,
                      'endpointError1080': float(np.mean(errors)), 'directionCosine': float(np.mean(cosines)),
                      'p95Error1080': float(np.percentile(errors, 95))}
            experiments.append(record)
            print(record, flush=True)
            if best is None or record['endpointError1080'] < best['endpointError1080']:
                best = record
                np.savez_compressed(work / 'velocity-model.npz',
                                    spatial=spatial[:rank].reshape(rank, MODEL_HEIGHT, MODEL_WIDTH, 2).astype(np.float32),
                                    temporal=temporal.astype(np.float32), frequencies=frequencies.astype(np.float32))
    report = {'trainingPairs': int(train.sum()), 'validationPairs': int((~train).sum()),
              'validationSamples': len(errors), 'best': best, 'experiments': experiments,
              'meaning': 'Velocity model agreement; not a percentage of video or appearance similarity'}
    (work / 'velocity-fit.json').write_text(json.dumps(report, indent=2))


def track_features(reference, work):
    capture = cv2.VideoCapture(str(reference))
    frames = []
    fps = capture.get(cv2.CAP_PROP_FPS)
    while True:
        ok, image = capture.read()
        if not ok:
            break
        rgb = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
        frames.append(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY))
    capture.release()
    lifetimes = []
    for start in range(0, len(frames) - 120, 30):
        points = cv2.goodFeaturesToTrack(frames[start], maxCorners=160, qualityLevel=.015, minDistance=7,
                                         mask=(frames[start] > 35).astype(np.uint8) * 255)
        if points is None:
            continue
        ages, active = np.zeros(len(points), int), np.ones(len(points), bool)
        for index in range(start + 1, min(start + 181, len(frames))):
            next_points, status, _ = cv2.calcOpticalFlowPyrLK(frames[index - 1], frames[index], points, None,
                                                            winSize=(15, 15), maxLevel=2)
            reverse, backward, _ = cv2.calcOpticalFlowPyrLK(frames[index], frames[index - 1], next_points, None,
                                                           winSize=(15, 15), maxLevel=2)
            good = ((status[:, 0] > 0) & (backward[:, 0] > 0)
                    & (np.linalg.norm(points[:, 0] - reverse[:, 0], axis=-1) < .5))
            xy = next_points[:, 0]
            good &= (xy[:, 0] >= 2) & (xy[:, 0] < WIDTH - 2) & (xy[:, 1] >= 2) & (xy[:, 1] < HEIGHT - 2)
            x, y = np.clip(xy[:, 0].astype(int), 0, WIDTH - 1), np.clip(xy[:, 1].astype(int), 0, HEIGHT - 1)
            good &= frames[index][y, x] > 25
            active &= good
            ages[active] += 1
            points = next_points
            if not active.any():
                break
        lifetimes.extend((ages / fps).tolist())
    values = np.array(lifetimes)
    if not len(values):
        raise ValueError('No reliable feature trajectories in reference')
    report = {'trackedFeatures': len(values), 'censoredAtSeconds': 6,
              'lifetimeQuantilesSeconds': np.percentile(values, [10, 25, 50, 75, 90]).tolist(),
              'survival': {str(time): float(np.mean(values >= time)) for time in [1, 2, 3, 4, 5]}}
    (work / 'feature-lifetimes.json').write_text(json.dumps(report, indent=2))
    print(report, flush=True)


def export(work, output):
    model = np.load(work / 'velocity-model.npz')
    spatial, temporal, frequencies = [model[name] for name in ['spatial', 'temporal', 'frequencies']]
    rank, height, width, _ = spatial.shape
    scale = float(abs(spatial).max() / 32760)
    quantized = np.rint(spatial / scale).astype('<i2')
    payload = quantized.tobytes() + temporal.astype('<f4').tobytes()
    packed = base64.b64encode(gzip.compress(payload, compresslevel=9, mtime=0)).decode()
    metadata = {'width': width, 'height': height, 'rank': rank, 'terms': len(temporal), 'spatialScale': scale,
                'frequencies': [round(float(value), 8) for value in frequencies],
                'sha256': hashlib.sha256(payload).hexdigest(),
                'referenceSha256': json.loads((work / 'teacher-manifest.json').read_text())['sha256']}
    lifetime = json.loads((work / 'feature-lifetimes.json').read_text())['lifetimeQuantilesSeconds'][2]
    metadata['coherenceSeconds'] = min(4.5, max(1., round(lifetime * 4) / 4))
    module = '''// Generated by scripts/reference-study/distill-motion.py from all adjacent
// reference frame pairs (every fifth pair held out during fitting).
// Spatial velocity modes + analytic temporal weights; no RGB, alpha, masks,
// video frames or frame-indexed displacement maps.
export const flowModel = ''' + json.dumps(metadata, separators=(',', ':')) + ''';
const packed=Uint8Array.from(atob(''' + repr(packed) + '''),c=>c.charCodeAt(0));
const decoded=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
export const flowSpatial=new Int16Array(decoded,0,flowModel.rank*flowModel.height*flowModel.width*2);
export const flowTemporal=new Float32Array(decoded,flowSpatial.byteLength,flowModel.terms*flowModel.rank);
'''
    output.write_text(module)
    print('Exported', output, len(module), 'bytes', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('work', type=Path)
    parser.add_argument('--stage', choices=['all', 'extract', 'features', 'fit', 'export'], default='all')
    parser.add_argument('--tune', action='store_true', help='Compare 27 fits on held-out pairs')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'src/liquid-flow-data.js')
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    manifest = args.work / 'teacher-manifest.json'
    if manifest.exists() and json.loads(manifest.read_text())['sha256'] != hashlib.sha256(args.reference.read_bytes()).hexdigest():
        raise ValueError('Work directory belongs to a different reference')
    cv2.setNumThreads(2)
    if args.stage in ['all', 'extract']:
        extract(args.reference, args.work)
    if args.stage in ['all', 'features']:
        track_features(args.reference, args.work)
    if args.stage in ['all', 'fit']:
        fit(args.work, args.tune)
    if args.stage in ['all', 'export']:
        export(args.work, args.output)


if __name__ == '__main__':
    main()
