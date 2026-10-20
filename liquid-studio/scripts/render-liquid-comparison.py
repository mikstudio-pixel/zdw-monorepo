"""Native AE fixture export, preserving all source projects.

Run after placing liquid-base.aepx and liquid-delivery.aepx in reference/tutorial.
Requires After Effects 2026 and ffmpeg/ffprobe. Each run renders to a fresh temp
file because aerender can report exit status 0 even after a render failure.
"""
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
AE = '/Applications/Adobe After Effects 2026/aerender'
REF = ROOT / 'reference/tutorial'
for project, kind in [('liquid-base.aepx', 'base'), ('liquid-delivery.aepx', 'ae'), ('liquid-calibrated.aepx', 'calibrated')]:
    with tempfile.TemporaryDirectory(prefix='native-', dir=REF) as directory:
        movie = Path(directory) / 'sequence.mov'
        subprocess.run([AE, '-project', str(REF / project), '-comp', 'LIQUID - tutorial',
                        '-s', '0', '-e', '180', '-OMtemplate', 'Lossless with Alpha',
                        '-output', str(movie), '-mfr', 'OFF', '50', '-mem_usage', '20', '30'], check=True)
        metadata = json.loads(subprocess.check_output([
            'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
            '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', str(movie)]))['streams'][0]
        assert (metadata['width'], metadata['height'], metadata['r_frame_rate'], int(metadata['nb_read_frames'])) == (1920, 1080, '30/1', 181), metadata
        output = ROOT / 'public/liquid-compare' / kind
        output.mkdir(parents=True, exist_ok=True)
        # AE writes premultiplied RGB. Dropping alpha preserves the black matte;
        # compositing it a second time would incorrectly darken soft edges.
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(movie), '-map', '0:v:0',
                        '-pix_fmt', 'rgb24', '-start_number', '0', str(output / 'frame-%04d.png')], check=True)
        (output / 'native-render.json').write_text(json.dumps(metadata, indent=2))
