"""Fit a deterministic continuous, low-rank appearance reconstruction.

This is a learned reconstruction of this reference, not a recovered fluid
simulation. Spatial basis fields plus cubic temporal functions reconstruct
premultiplied RGB/coverage. No encoded movie or array of complete output frames
is shipped. Every fifth time is held out of all fitted basis and spline data.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.linalg import eigh
from scipy.ndimage import binary_fill_holes, distance_transform_edt

W, H, BW, BH, RANK, BODY_RANK = 480, 270, 96, 54, 24, 12
STRIDE, RADIUS = 60, 36


def coverage(rgb):
    # Black backing does not identify alpha uniquely. Estimate coverage using
    # neighboring interior brightness; keep this ambiguity explicit in reports.
    small = cv2.resize(rgb, (320, 180), interpolation=cv2.INTER_AREA)
    value = small.max(-1)
    inside = cv2.erode((value > .03).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    yy, xx = distance_transform_edt(~inside, return_distances=False, return_indices=True)
    alpha = np.minimum(value / np.maximum(small[yy, xx].max(-1), .08), 1)
    alpha[inside], alpha[value < .003] = 1, 0
    body = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    filled = binary_fill_holes(body > .2).astype(np.float32)
    body = np.maximum(np.maximum(body, cv2.GaussianBlur(filled, (0, 0), 1.2)), alpha)
    return cv2.resize(alpha, (W, H)), cv2.resize(body, (BW, BH))


def fit_basis(values, frames, rank, fps):
    flat = values[frames].reshape(len(frames), -1).astype(np.float32)
    mean = flat.mean(0)
    flat -= mean
    eigenvalues, vectors = eigh(flat @ flat.T, driver='evd')
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues, vectors = eigenvalues[order], vectors[:, order]
    rank = min(rank, len(frames) - 1)
    roots = np.sqrt(np.maximum(eigenvalues[:rank], 1e-8))
    spatial = (vectors[:, :rank].T @ flat) / roots[:, None]
    # Canonical signs remove the eigensolver's arbitrary sign choice.
    signs = np.sign(spatial[np.arange(rank), np.abs(spatial).argmax(1)])
    spatial *= signs[:, None]
    amplitudes = vectors[:, :rank] * roots * signs
    scale = np.max(abs(spatial), axis=1) / 127
    quantized = np.rint(spatial / scale[:, None]).astype(np.int8)
    # Fold quantization scales into the temporal functions.
    spline = CubicSpline(frames / fps, amplitudes * scale, axis=0)
    return mean.astype('<f2'), (quantized.astype(np.int16) + 128).astype(np.uint8), spline


def fit(reference, work, output):
    work.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(reference))
    count, fps = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)), capture.get(cv2.CAP_PROP_FPS)
    source_size = [int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))]
    if source_size != [1920, 1080] or fps != 30:
        raise ValueError('Calibration expects the supplied 1920x1080/30fps reference')
    rgba = np.lib.format.open_memmap(work / 'rgba.npy', mode='w+', dtype=np.float32, shape=(count, H, W, 4))
    bodies = np.empty((count, BH, BW), np.float32)
    for i in range(count):
        ok, frame = capture.read()
        if not ok:
            raise ValueError(f'Missing source frame {i}')
        rgb = cv2.cvtColor(cv2.resize(frame, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
        alpha, body = coverage(rgb)
        rgba[i, :, :, :3], rgba[i, :, :, 3] = rgb, alpha * .25
        bodies[i] = body
    capture.release()
    payload, segments = bytearray(), []
    def append(array):
        while len(payload) % 4:
            payload.append(0)
        offset = len(payload)
        payload.extend(array.tobytes())
        return offset
    def encode(values, frames, rank):
        mean, modes, spline = fit_basis(values, frames, rank, fps)
        return {'rank': len(modes), 'meanOffset': append(mean), 'modesOffset': append(modes),
                'coefficientsOffset': append(spline.c.astype('<f4')), 'knots': spline.x.tolist()}
    train = np.arange(count) % 5 != 2
    for center in range(0, count, STRIDE):
        available = np.arange(max(0, center - RADIUS), min(count, center + RADIUS + 1))
        selected = available[train[available]]
        segment = {'center': center / fps, 'appearance': encode(rgba, selected, RANK),
                   'body': encode(bodies, selected, BODY_RANK)}
        segments.append(segment)
        print('Fitted', center, 'training frames', len(selected), flush=True)
    binary = gzip.compress(bytes(payload), compresslevel=9, mtime=0)
    model = {'schema': 1, 'width': W, 'height': H, 'bodyWidth': BW, 'bodyHeight': BH,
             'fps': fps, 'frames': count, 'lastTime': (count - 1) / fps,
             'stride': STRIDE / fps, 'radius': RADIUS / fps, 'transition': (2 * RADIUS - STRIDE) / fps,
             'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
             'payloadSha256': hashlib.sha256(payload).hexdigest(),
             'trainingFrames': int(train.sum()), 'validationFrames': int((~train).sum()),
             'basis': 'Local POD/SVD + piecewise cubic functions; RGBA quantized signed 8bit, means float16',
             'alpha': 'Inferred from black-backed video; not identifiable ground-truth alpha',
             'segments': segments}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'liquid-appearance.bin.gz').write_bytes(binary)
    (output / 'liquid-appearance-data.js').write_text('// Generated by scripts/reference-study/distill-appearance.py.\n'
        '// Learned appearance reconstruction, not a recovered fluid simulation.\n'
        'export const appearanceModel = ' + json.dumps(model, separators=(',', ':')) + ';\n'
        'const response = await fetch(new URL("./liquid-appearance.bin.gz", import.meta.url));\n'
        'if (!response.ok) throw new Error("Model vzhledu liquidu nelze načíst: " + response.status);\n'
        'export const appearanceBytes = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());\n')
    (work / 'appearance-fit.json').write_text(json.dumps({**model, 'compressedBytes': len(binary), 'uncompressedBytes': len(payload)}, indent=2))
    print('Exported bytes', len(binary), '/', len(payload), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('reference', type=Path)
    p.add_argument('work', type=Path)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    cv2.setNumThreads(1)
    fit(args.reference, args.work, args.output)
