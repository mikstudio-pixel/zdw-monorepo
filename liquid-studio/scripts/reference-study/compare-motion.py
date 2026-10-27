"""Compare local motion on a common reliable support across two generated clips.

This is a diagnostic of velocity at shared image coordinates, not tracked
corresponding material particles and not a percentage of whole-video fidelity.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    teacher = np.load(args.work / 'flow.npy', mmap_mode='r')
    confidence = np.load(args.work / 'confidence.npy', mmap_mode='r')
    fps = json.loads((args.work / 'teacher-manifest.json').read_text())['fps']
    y, x = np.mgrid[:270, :480].astype(np.float32)
    grid = np.stack([x, y], -1)
    algorithm = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    algorithm.setFinestScale(0)
    previous, previous_rgb = [None, None], [None, None]
    records = []
    for index in range(len(teacher) + 1):
        observed, reliable = [], []
        for variant, directory in enumerate([args.before, args.after]):
            image = cv2.imread(str(directory / f'{index:04d}.png'))
            if image is None:
                raise ValueError(f'Missing frame {directory / f"{index:04d}.png"}')
            rgb = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), (480, 270), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            if index:
                forward = algorithm.calc(previous[variant], gray, None)
                backward = algorithm.calc(gray, previous[variant], None)
                reverse = cv2.remap(backward, grid + forward, None, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                iy, ix = np.gradient(previous[variant].astype(float))
                good = ((np.hypot(ix, iy) > 2) & (np.linalg.norm(forward + reverse, axis=-1) < .5)
                        & (previous_rgb[variant].max(-1) > 30))
                observed.append(forward)
                reliable.append(good)
            previous[variant], previous_rgb[variant] = gray, rgb
        if index:
            target = teacher[index - 1].astype(float)
            magnitude = np.linalg.norm(target, axis=-1)
            common = (confidence[index - 1] > 100) & (magnitude > .03) & reliable[0] & reliable[1]
            row = {'frame': index - 1, 'samples': int(common.sum())}
            if common.sum() < 50:
                continue
            for name, value in zip(['before', 'after'], observed):
                speed = np.linalg.norm(value, axis=-1)
                cosine = (value * target).sum(-1) / np.maximum(speed * magnitude, .00001)
                row[name] = {'directionCosine': float(cosine[common].mean()),
                             'endpointError1080': float(np.linalg.norm(value - target, axis=-1)[common].mean() * fps * 4)}
            records.append(row)
        if index % 120 == 0:
            print('Compared frame', index, flush=True)
    summary = {'commonSamples': sum(row['samples'] for row in records), 'frames': len(records),
               'meaning': __doc__, 'perFrame': records}
    for name in ['before', 'after']:
        summary[name] = {metric: float(np.mean([row[name][metric] for row in records]))
                         for metric in ['directionCosine', 'endpointError1080']}
    output = args.output or args.work / 'common-motion-comparison.json'
    output.write_text(json.dumps(summary, indent=2))
    print({key: value for key, value in summary.items() if key != 'perFrame'}, flush=True)


if __name__ == '__main__':
    main()
