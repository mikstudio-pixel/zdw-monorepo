"""Show native AE material and actual app output on an identical video frame.

The native panel uses actual premultiplied aerender RGBA, composited over
the clean app video capture. No spatial registration or time fitting.
"""
import argparse
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FFMPEG = ROOT / 'desktop/node_modules/ffmpeg-static/ffmpeg'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
CASES = {'edge': 'Zakončení u okraje', 'merge': 'Sloučení oblastí', 'separate': 'Oddělené oblasti'}


def rgb(path):
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f'Missing capture: {path}')
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def panel(images, labels, title, width, footer):
    height, header, bottom = width * 16 // 9, 54, 38
    result = Image.new('RGB', (width * len(images), height + header + bottom), '#171717')
    draw = ImageDraw.Draw(result)
    font = ImageFont.truetype(FONT, max(16, width // 24))
    for i, (image, label) in enumerate(zip(images, labels)):
        result.paste(Image.fromarray(image).resize((width, height), Image.Resampling.LANCZOS), (i * width, header))
        draw.text((i * width + 12, 9), label, font=font, fill='white')
    small = ImageFont.truetype(FONT, max(14, width // 30))
    draw.text((12, 33), title, font=small, fill='#bbbbbb')
    draw.text((12, height + header + 10), footer, font=small, fill='#bbbbbb')
    return np.asarray(result)


def build(native, captures, before, background, output):
    output.mkdir(parents=True, exist_ok=True)
    # The app's canonical 1920x1080 domain cropped into a 9:16 output.
    x, y = np.meshgrid(960 + ((np.arange(540) + .5) / 540 - .5) * 607.5 - .5,
                       (np.arange(960) + .5) / 960 * 1080 - .5)
    x, y = x.astype('float32'), y.astype('float32')
    movie = output / 'ae-vs-app-motion.mp4'
    encoder = subprocess.Popen([str(FFMPEG), '-v', 'error', '-y', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', '810x812', '-r', '25', '-i', '-', '-an',
        '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(movie)], stdin=subprocess.PIPE)
    try:
        for case, title in CASES.items():
            decoder = subprocess.Popen([str(FFMPEG), '-v', 'error', '-i', str(native / f'{case}-material.mov'),
                '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], stdout=subprocess.PIPE)
            for frame in range(125):
                raw = decoder.stdout.read(1920 * 1080 * 4)
                if len(raw) != 1920 * 1080 * 4:
                    raise ValueError(f'Incomplete native movie: {case}, frame {frame}')
                material = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 4)
                material = cv2.remap(material, x, y, cv2.INTER_LINEAR)
                material = cv2.resize(material, (1080, 1920), interpolation=cv2.INTER_LINEAR).astype(np.float32)
                clean = rgb(background / f'{frame:04d}.png').astype(np.float32)
                expected = np.clip(np.rint(.65 * material[..., :3] + clean * (1 - .65 * material[..., 3:] / 255)), 0, 255).astype(np.uint8)
                actual = rgb(captures / case / 'scene' / f'{frame:04d}.png')
                caption = f'{title} · {frame / 25:.2f} s'
                footer = 'Stejná maska, čas, video a výřez 9:16 · krytí 65 %'
                two = panel([expected, actual], ['Nativní AE', 'Nová aplikace'], caption, 405, footer)
                encoder.stdin.write(two.tobytes())
                if frame == 14:
                    old = rgb(before / case / 'scene' / f'{frame:04d}.png')
                    three = panel([old, expected, actual], ['Před přestavbou', 'Nativní AE', 'Nová aplikace'], caption, 540, footer)
                    Image.fromarray(three).save(output / f'{case}-before-ae-after.png')
            decoder.stdout.close()
            if decoder.wait():
                raise RuntimeError('Native decode failed')
            print('Compared', case, flush=True)
    finally:
        encoder.stdin.close()
    if encoder.wait():
        raise RuntimeError('Comparison movie encoding failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('native', 'captures', 'before', 'background', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    build(args.native, args.captures, args.before, args.background, args.output)
