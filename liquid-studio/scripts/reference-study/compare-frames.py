"""Deterministic, unaligned comparison of every actual rendered frame.

SSIM uses RGB, an 11x11 Gaussian window (sigma 1.5), L=1, K1=.01,
K2=.03. Foreground support is the union of both >5/255 RGB maxima,
dilated by 16 reference-1080p pixels; black background cannot dominate.
No time shifts, image registration, color correction or per-frame tuning.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np


def ssim_map(a, b):
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5, borderType=cv2.BORDER_REFLECT_101)
    ma, mb = blur(a), blur(b)
    va, vb = np.maximum(blur(a * a) - ma * ma, 0), np.maximum(blur(b * b) - mb * mb, 0)
    covariance = blur(a * b) - ma * mb
    return (((2 * ma * mb + .01 ** 2) * (2 * covariance + .03 ** 2)) /
            ((ma * ma + mb * mb + .01 ** 2) * (va + vb + .03 ** 2))).mean(-1)


def frame_metrics(reference, rendered, previous=None):
    height, width = reference.shape[:2]
    a, b = reference.astype(np.float32) / 255, rendered.astype(np.float32) / 255
    am, bm = a.max(-1) > 5 / 255, b.max(-1) > 5 / 255
    radius = max(1, round(16 * height / 1080))
    support = cv2.dilate((am | bm).astype(np.uint8),
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)).astype(bool)
    difference = a - b
    mse = float(np.mean(difference[support] ** 2))
    similarity = ssim_map(a, b)
    result = {'ssimForeground': float(similarity[support].mean()),
              'ssimFull': float(similarity.mean()),
              'maeForeground255': float(abs(difference)[support].mean() * 255),
              'psnrForeground': float(10 * np.log10(1 / max(mse, 1e-12))),
              'coverageIoU': float((am & bm).sum() / max((am | bm).sum(), 1)),
              'supportPixels': int(support.sum())}
    if previous is not None:
        pa, pb = previous
        result['temporalDeltaMAE255'] = float(abs((a - pa) - (b - pb))[support].mean() * 255)
    return result, (a, b)


def evaluate(reference, rendered, output, width):
    capture = cv2.VideoCapture(str(reference))
    count, fps = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)), capture.get(cv2.CAP_PROP_FPS)
    height = round(width * capture.get(cv2.CAP_PROP_FRAME_HEIGHT) / capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    rows, previous = [], None
    for i in range(count):
        ok, source = capture.read()
        if not ok:
            raise ValueError(f'Missing reference frame {i}')
        actual = cv2.imread(str(rendered / f'{i:04d}.png'))
        if actual is None:
            raise ValueError(f'Missing generated frame {i}')
        target = cv2.resize(source, (width, height), interpolation=cv2.INTER_AREA)
        if actual.shape[:2] != (height, width):
            raise ValueError(f'Frame {i} has {actual.shape[:2]}, expected {(height, width)}; no implicit rescaling')
        metrics, previous = frame_metrics(target, actual, previous)
        rows.append({'frame': i, 'time': i / fps, 'split': 'validation' if i % 5 == 2 else 'training', **metrics})
        if i % 60 == 0:
            print(i, {k: round(v, 5) for k, v in metrics.items() if k != 'supportPixels'}, flush=True)
    capture.release()
    def aggregate(selected):
        return {key: {'mean': float(np.mean([row[key] for row in selected if key in row])),
                      'min': float(np.min([row[key] for row in selected if key in row])),
                      'p05': float(np.percentile([row[key] for row in selected if key in row], 5)),
                      'max': float(np.max([row[key] for row in selected if key in row]))}
                for key in rows[-1] if key not in ['frame', 'time', 'split', 'supportPixels']}
    capture_path = rendered.parent / 'capture.json'
    provenance = json.loads(capture_path.read_text()) if capture_path.exists() else None
    report = {'schema': 1, 'capture': provenance, 'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
              'size': [width, height], 'fps': fps, 'frames': count,
              'alignment': 'Exact frame i at i/fps; no spatial, temporal or color alignment',
              'foreground': 'Union of both RGB maxima > 5/255, dilated 16px at 1080p',
              'ssim': 'RGB mean, Gaussian11/sigma1.5, K1=.01 K2=.03, L=1',
              'meaning': 'SSIM is structural similarity, not a percentage of identical pixels or physical behavior',
              'all': aggregate(rows), 'validation': aggregate([r for r in rows if r['split'] == 'validation']),
              'perFrame': rows}
    output.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'perFrame'}, indent=2))
    return report


def check_report(report):
    assert report['all']['ssimForeground']['mean'] >= .99, 'Mean foreground SSIM below .99'
    assert report['validation']['ssimForeground']['mean'] >= .99, 'Held-frame SSIM below .99'
    assert report['all']['ssimForeground']['min'] >= .985, 'Worst foreground SSIM below .985'
    assert report['all']['coverageIoU']['mean'] >= .99, 'Mean coverage IoU below .99'
    assert report['all']['maeForeground255']['mean'] <= 1.2, 'Foreground RGB MAE above 1.2/255'
    assert report['all']['temporalDeltaMAE255']['mean'] <= 1., 'Temporal RGB delta MAE above 1/255'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('rendered', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--width', type=int, default=960)
    parser.add_argument('--check', action='store_true', help='Fail on the documented foreground regression gates')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    report = evaluate(args.reference, args.rendered, args.output, args.width)
    if args.check:
        check_report(report)
