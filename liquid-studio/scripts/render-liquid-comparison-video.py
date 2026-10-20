"""Create a synchronized review video from the existing native/GPU PNGs."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--brush', action='store_true', help='Compare the same painted stroke before and after calibration.')
args = parser.parse_args()
FRAMES = ROOT / ('public/liquid-brush-compare' if args.brush else 'public/liquid-compare')
OUTPUT = FRAMES / 'liquid-before-after.mp4'
FONT = '/System/Library/Fonts/Helvetica.ttc'
variants = [('calibrated', 'AE · pracovní reference'),
            ('web-before', 'PŘED · původní web'),
            ('web', 'PO · web / Liquid Studio')]
if args.brush:
    variants = [('before', 'PŘED · původní štětec'), ('after', 'PO · kalibrovaný materiál')]
width = 1920 // len(variants)
height = width * 9 // 16
command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']
filters = []
for index, (folder, title) in enumerate(variants):
    assert all((FRAMES / folder / f'frame-{frame:04d}.png').is_file()
               for frame in range(181)), folder
    command += ['-framerate', '30', '-start_number', '0', '-i',
                str(FRAMES / folder / 'frame-%04d.png')]
    filters.append(
        f'[{index}:v]scale={width}:{height}:flags=lanczos,setsar=1,'
        f'pad={width}:{height + 56}:0:56:color=0x151719,'
        f"drawtext=fontfile={FONT}:text='{title}':fontsize=25:fontcolor=white:"
        f'x=20:y=17[p{index}]')
filters.append(
    ''.join(f'[p{i}]' for i in range(len(variants))) +
    f'hstack=inputs={len(variants)},pad=1920:{height + 104}:0:0:color=0x151719,'
    f"drawtext=fontfile={FONT}:text='Snímek %{{n}} / 180  ·  30 fps  ·  "
    f"stejný čas a měřítko':fontsize=22:fontcolor=0xadb9bf:x=20:y={height + 71}[out]")
command += ['-filter_complex', ';'.join(filters), '-map', '[out]',
            '-frames:v', '181', '-an', '-c:v', 'libx264', '-preset', 'medium',
            '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(OUTPUT)]
subprocess.run(command, check=True)
# VP9 also plays in embedded Chromium builds without H.264 support.
webm = OUTPUT.with_suffix('.webm')
subprocess.run(command[:command.index('-c:v')] + [
    '-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
    '-crf', '24', '-b:v', '0', '-pix_fmt', 'yuv420p', str(webm)], check=True)
metadata = json.loads(subprocess.check_output([
    'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,duration',
    '-of', 'json', str(OUTPUT)]))['streams'][0]
assert (metadata['width'], metadata['height'], metadata['r_frame_rate'],
        int(metadata['nb_read_frames'])) == (1920, height + 104, '30/1', 181), metadata
print(json.dumps({'file': str(OUTPUT), **metadata}, indent=2))
