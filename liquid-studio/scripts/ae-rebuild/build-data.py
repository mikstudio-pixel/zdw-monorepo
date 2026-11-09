"""Pack independent native coordinate probes, never appearance frames.

Inputs: identity-x.tif, identity-y.tif, warped-x.tif, warped-y.tif.
All four must be opaque, linear grayscale ramps rendered at 1920x1080,
16 bits/channel. Only the warped pair has Turbulent Displace enabled.
"""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np


def build(probes, original, output):
    definition = json.loads((Path(__file__).parent / 'original.json').read_text())
    if hashlib.sha256(original.read_bytes()).hexdigest() != definition['sourceSha256']:
        raise ValueError('These parameters belong to a different original AEP')
    yy, xx = np.mgrid[:1080, :1920]
    maps = []
    for axis, coordinate in zip(('x', 'y'), (xx + .5, yy + .5)):
        images = []
        for prefix in ('identity', 'warped'):
            image = cv2.imread(str(probes / f'{prefix}-{axis}.tif'), cv2.IMREAD_UNCHANGED)
            if image is None or image.dtype != np.uint16 or image.shape != (1080, 1920, 4):
                raise ValueError(f'Invalid 16bpc coordinate probe: {prefix}-{axis}.tif')
            if image[..., 3].min() != 65535:
                raise ValueError('Coordinate probes must be opaque across the whole composition')
            images.append(image[..., 0].astype(np.float64) / 65535)
        design = np.stack((images[0].ravel(), np.ones(coordinate.size)), axis=1)
        scale, offset = np.linalg.lstsq(design, coordinate.ravel(), rcond=None)[0]
        residual = images[0] * scale + offset - coordinate
        if np.sqrt(np.mean(residual ** 2)) > .1:
            raise ValueError('Identity probe is not an undistorted coordinate ramp')
        maps.append(images[1] * scale + offset - coordinate)
    field = np.stack(maps, axis=-1).astype(np.float32)
    field = cv2.resize(field, (960, 540), interpolation=cv2.INTER_AREA)
    quantized = np.rint(field * 32).astype('<i2')
    deltas = quantized.copy()
    deltas[:, 1:] -= quantized[:, :-1]
    compressed = gzip.compress(deltas.tobytes(), mtime=0)
    definition['map']['gzipBytes'] = len(compressed)
    encoded = base64.b64encode(compressed).decode()
    module = ('// Generated from the original AEP. Coordinates only; all geometry, colors and motion are evaluated live.\n'
        'export const AE_LIQUID = ' + json.dumps(definition, separators=(',', ':')) + ';\n'
        'const encoded = Uint8Array.from(atob(' + repr(encoded) + '), c => c.charCodeAt(0));\n'
        'const stream = new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"));\n'
        'const deltas = new Int16Array(await new Response(stream).arrayBuffer());\n'
        'export const aeDisplacement = new Uint8Array(deltas.length * 2);\n'
        'for (let y=0;y<540;y++) for (let x=0;x<960;x++) for (let c=0;c<2;c++) {\n'
        ' const i=(y*960+x)*2+c; if(x) deltas[i]+=deltas[i-2];\n'
        ' const value=deltas[i]+32768; aeDisplacement[i*2]=value>>8; aeDisplacement[i*2+1]=value&255;\n}\n')
    output.write_text(module)
    print(f'{output}: {len(compressed)} compressed coordinate bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('probes', type=Path)
    parser.add_argument('original', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.probes, args.original, args.output)
