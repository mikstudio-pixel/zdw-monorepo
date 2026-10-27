"""Check the score gates and prove that background/alignment errors are penalized."""
import argparse
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('comparison', Path(__file__).with_name('compare-frames.py'))
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('report', type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    report = json.loads(args.report.read_text())
    comparison.check_report(report)
    capture = cv2.VideoCapture(str(args.reference))
    ok, first = capture.read()
    if not ok:
        raise ValueError('Missing first reference frame')
    ok, second = capture.read()
    if not ok:
        raise ValueError('Missing second reference frame')
    capture.release()
    size = tuple(report['size'])
    first, second = [cv2.resize(value, size, interpolation=cv2.INTER_AREA) for value in [first, second]]
    controls = {name: comparison.frame_metrics(first, other)[0] for name, other in [
        ('identity', first), ('black', np.zeros_like(first)),
        ('shift16px', np.roll(first, 16, axis=1)), ('nextFrame', second)]}
    assert controls['identity']['ssimForeground'] == 1
    assert controls['black']['ssimForeground'] < .2
    assert controls['shift16px']['ssimForeground'] < .99
    controls['qualityGates'] = 'passed'
    args.report.with_name('metric-controls.json').write_text(json.dumps(controls, indent=2))
    print(json.dumps(controls, indent=2))
