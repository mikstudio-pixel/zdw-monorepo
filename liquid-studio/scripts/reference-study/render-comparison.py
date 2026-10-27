"""Label actual captures without changing their alignment or relative scale."""
import argparse
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def render(reference, captures, previous, ffmpeg):
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
    except OSError:
        font = ImageFont.load_default(size=22)
    def sheet(images, labels, width=640):
        height = round(width * 9 / 16)
        out = Image.new('RGB', (width * len(images), height + 42), '#191919')
        draw = ImageDraw.Draw(out)
        for i, (image, label) in enumerate(zip(images, labels)):
            out.paste(image.convert('RGB').resize((width, height), Image.Resampling.LANCZOS), (i * width, 42))
            draw.text((i * width + 14, 9), label, font=font, fill='white')
        return out
    cap = cv2.VideoCapture(str(reference))
    for time in [0, 2, 5, 10, 20, 26.7666667]:
        frame = round(time * 30)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
        ok, rgb = cap.read()
        if not ok:
            raise ValueError(frame)
        target = Image.fromarray(cv2.cvtColor(cv2.resize(rgb, (960, 540), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB))
        generated = Image.open(captures / f'study-{time:.3f}.png').convert('RGB')
        old = Image.open(previous / 'motion' / f'{frame:04d}.png').convert('RGB')
        sheet([target, generated], [f'Reference · {frame/30:.3f} s', 'Nový model · stejný snímek']).save(captures / f'comparison-{time:.3f}.png')
        sheet([target, old, generated], [f'Reference · {frame/30:.3f} s', 'Předchozí generátor', 'Nový model']).save(captures / f'progress-{time:.3f}.png')
        difference = Image.fromarray(np.uint8(np.clip(abs(np.array(target).astype(float) - np.array(generated).astype(float)) * 8, 0, 255)))
        sheet([target, generated, difference], ['Reference', 'Nový model', 'Absolutní rozdíl ×8']).save(captures / f'difference-{time:.3f}.png')
        before, after = captures / f'before-{time:.3f}.png', captures / f'after-{time:.3f}.png'
        if before.exists() and after.exists():
            sheet([Image.open(before), Image.open(after)], [f'Aplikace před · {frame/30:.3f} s', 'Aplikace po · stejný vstup a tahy'], 960).save(captures / f'application-{time:.3f}.png')
    cap.release()
    header = Image.new('RGB', (1280, 42), '#191919')
    draw = ImageDraw.Draw(header)
    draw.text((14, 9), 'Reference', font=font, fill='white')
    draw.text((654, 9), 'Nový model · stejný snímek', font=font, fill='white')
    header.save(captures / 'video-header.png')
    subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(reference), '-framerate', '30', '-i', str(captures / 'motion' / '%04d.png'),
                    '-loop', '1', '-framerate', '30', '-i', str(captures / 'video-header.png'), '-filter_complex',
                    '[0:v]scale=640:360:flags=lanczos,setsar=1[a];[1:v]scale=640:360:flags=lanczos,setsar=1[b];[a][b]hstack[pair];[2:v][pair]vstack[out]',
                    '-map', '[out]', '-frames:v', '804', '-r', '30', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
                    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', str(captures / 'reference-motion.mp4')], check=True)
    subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-ss', '5', '-i', str(captures / 'reference-motion.mp4'), '-t', '6', '-vf', 'fps=15,scale=960:-2:flags=lanczos',
                    '-loop', '0', '-c:v', 'libwebp_anim', '-quality', '82', str(captures / 'reference-motion.webp')], check=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('reference', type=Path)
    p.add_argument('captures', type=Path)
    p.add_argument('previous', type=Path)
    p.add_argument('--ffmpeg', type=Path, required=True)
    a = p.parse_args()
    render(a.reference, a.captures, a.previous, a.ffmpeg)
