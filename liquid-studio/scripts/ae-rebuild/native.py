"""Build native AE controls from the same raster source used by the app.

Requires py-aep and OpenCV. The original AEP is never changed. Prepare
source-{edge,merge,separate}.png in a new output directory first.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess

import cv2
import py_aep
from py_aep import ImportOptions
from py_aep.enums import AlphaMode


def run(ae, project, comp, output, frames):
    result = subprocess.run([str(ae), '-project', str(project), '-comp', comp,
        '-s', '0', '-e', str(frames - 1), '-OMtemplate', 'Lossless with Alpha',
        '-output', str(output), '-mfr', 'OFF', '50', '-mem_usage', '5', '10'],
        capture_output=True, text=True)
    output.with_suffix('.log').write_text(result.stdout + result.stderr)
    # aerender sometimes returns zero after a render failure. Require an
    # actual, complete, nonempty movie instead of trusting its exit status.
    capture = cv2.VideoCapture(str(output))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, first = capture.read()
    capture.release()
    if result.returncode or count != frames or not ok or first.max() <= 8:
        raise RuntimeError(f'Invalid native output: {output}; see its .log')


def build(source, output, video, ae, ffmpeg, render):
    fixtures = json.loads((Path(__file__).parent / 'fixtures.json').read_text())
    output.mkdir(parents=True, exist_ok=True)
    movie = output / 'portrait-video.mov'
    if not movie.exists():
        subprocess.run([str(ffmpeg), '-v', 'error', '-i', str(video), '-c', 'copy', str(movie)], check=True)
    manifest = {'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'videoSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
                'fixtures': fixtures, 'native': 'After Effects aerender, Best/Full, native RGB + alpha'}
    for case in fixtures['cases']:
        png = output / f'source-{case}.png'
        project = py_aep.parse(source).project
        comp = next(c for c in project.compositions if c.name == 'LIQUID EFFECT')
        original = comp.layers[0]
        footage = project.import_file(ImportOptions(png))
        footage.main_source.alpha_mode = AlphaMode.STRAIGHT
        painted = comp.add(footage)
        painted.name = 'Painted union - common source'
        old_root = next(c for c in original._layer_list.chunks if getattr(c, 'list_type', None) == 'tdgp')
        new_root = next(c for c in painted._layer_list.chunks if getattr(c, 'list_type', None) == 'tdgp')
        start, end = original.effects._find_chunk_span(old_root)
        at = next(i for i, c in enumerate(new_root.chunks) if getattr(c, 'value', None) == 'ADBE Effect Parade')
        new_root.chunks[at:at + 2] = copy.deepcopy(old_root.chunks[start:end])
        # Keep the original layer, disabled: AE's saved view still refers to its ID.
        original.enabled = False
        material_project = output / f'liquid-area-{case}.aep'
        project.save(material_project)
        name = 'AE_LIQUID_PORTRAIT_' + case.upper()
        portrait = project.root_folder.add_comp(name, 1080, 1920, 1.,
            fixtures['frames'] / fixtures['fps'], float(fixtures['fps']))
        layer = portrait.add(comp)
        layer.transform.scale.value = [100 * 1920 / 1080, 100 * 1920 / 1080, 100.]
        layer.transform.opacity.value = float(fixtures['opacity'])
        background = portrait.add(project.import_file(ImportOptions(movie)))
        background.move_to_end()
        portrait_project = output / f'portrait-{case}.aep'
        project.save(portrait_project)
        manifest[case] = {'sourcePngSha256': hashlib.sha256(png.read_bytes()).hexdigest(),
                          'materialProject': material_project.name, 'portraitProject': portrait_project.name}
        if render:
            run(ae, material_project, comp.name, output / f'{case}-material.mov', fixtures['frames'])
            run(ae, portrait_project, name, output / f'{case}-portrait.mov', fixtures['frames'])
        print('Prepared', case, flush=True)
    (output / 'native-manifest.json').write_text(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--ae', type=Path, default=Path('/Applications/Adobe After Effects 2026/aerender'))
    parser.add_argument('--ffmpeg', type=Path, default=Path('desktop/node_modules/ffmpeg-static/ffmpeg'))
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    build(args.source.resolve(), args.output.resolve(), args.video.resolve(), args.ae, args.ffmpeg.resolve(), args.render)
