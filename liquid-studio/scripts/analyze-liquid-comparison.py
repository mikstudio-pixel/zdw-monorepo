"""Build diagnostic metrics and contact sheets from actual AE/GPU captures.

Requires Pillow and NumPy. Metrics deliberately exclude shared black background;
they are diagnostic measurements, not a perceptual similarity percentage.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/liquid-compare'
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 19)


def frame(kind, index):
    return OUT / kind / f'frame-{index:04d}.png'


def pixels(kind, index):
    return np.asarray(Image.open(frame(kind, index)).convert('RGB').resize((480, 270), Image.Resampling.LANCZOS), dtype=np.float32)


rows = []
previous = {}
parity = {'maxChannelError': 0, 'changedChannels': 0, 'totalChannels': 0, 'absoluteError': 0}
for index in range(181):
    images = {kind: pixels(kind, index) for kind in ('base', 'ae', 'calibrated', 'web-before', 'web', 'studio')}
    masks = {kind: im.max(axis=2) > 16 for kind, im in images.items()}
    record = {'frame': index, 'time': index / 30, 'comparisons': {}, 'motion': {}}
    for reference in ('base', 'ae', 'calibrated', 'web-before'):
        for candidate in ('web', 'studio', 'web-before', 'ae'):
            if reference == candidate: continue
            union = masks[reference] | masks[candidate]
            intersection = masks[reference] & masks[candidate]
            record['comparisons'][f'{reference}-{candidate}'] = {
                'silhouetteIoU': float(intersection.sum() / max(1, union.sum())),
                'rgbMAEForeground': float(np.abs(images[reference] - images[candidate])[union].mean()),
                'referenceCoverage': float(masks[reference].mean()),
                'candidateCoverage': float(masks[candidate].mean()),
                'edgeRGBError': float(np.abs(images[reference]-images[candidate])[(images[reference].max(axis=2)>8)&(images[reference].max(axis=2)<180)].mean()),
            }
    for kind, im in images.items():
        if kind in previous:
            support = masks[kind] | (previous[kind].max(axis=2) > 16)
            record['motion'][kind] = float(np.abs(im - previous[kind])[support].mean())
        previous[kind] = im
    # Check parity at the original resolution, before analytical downsampling.
    a = np.asarray(Image.open(frame('web', index)).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(frame('studio', index)).convert('RGB'), dtype=np.int16)
    difference = np.abs(a - b)
    parity['maxChannelError'] = max(parity['maxChannelError'], int(difference.max()))
    parity['changedChannels'] += int(np.count_nonzero(difference))
    parity['totalChannels'] += int(difference.size)
    parity['absoluteError'] += int(difference.sum())
    rows.append(record)

report = {
    'webStudioParity': {**parity, 'meanChannelError': parity['absoluteError'] / parity['totalChannels'], 'scope': '181 frames, 1920x1080, default structure, no guides, no glass, black background, opacity 100%.'},
    'measurementResolution': [480, 270], 'threshold': 16,
    'warning': 'IoU is silhouette overlap, not overall perceptual similarity. RGB error is measured on foreground union. Motion is mean adjacent-frame RGB change, not optical flow. The calibrated AE is reconstructed from the tutorial. Web-to-AE fidelity and AE-to-tutorial fidelity are reported separately.',
    'frames': rows,
    'summary': {key: {
        'meanSilhouetteIoU': float(np.mean([r['comparisons'][key]['silhouetteIoU'] for r in rows])),
        'minimumSilhouetteIoU': float(min(r['comparisons'][key]['silhouetteIoU'] for r in rows)),
        'meanEdgeRGBError': float(np.mean([r['comparisons'][key]['edgeRGBError'] for r in rows])),
        'meanRGBError': float(np.mean([r['comparisons'][key]['rgbMAEForeground'] for r in rows])),
    } for key in rows[0]['comparisons']},
}
(OUT / 'metrics.json').write_text(json.dumps(report, indent=2))

indices = [0, 15, 30, 45, 60, 90, 120, 150]
sheet = Image.new('RGB', (1440, len(indices) * 306 + 45), '#151719')
draw = ImageDraw.Draw(sheet)
for col, title in enumerate(['AE / opravena reference', 'Web / pred upravou', 'Web / po kalibraci']):
    draw.text((col * 480 + 14, 12), title, fill='white', font=font)
for row, index in enumerate(indices):
    y = 45 + row * 306
    for col, kind in enumerate(['calibrated', 'web-before', 'web']):
        sheet.paste(Image.open(frame(kind, index)).convert('RGB').resize((480, 270), Image.Resampling.LANCZOS), (col * 480, y))
        draw.text((col * 480 + 14, y + 277), f'{index / 30:.2f} s / frame {index}', fill='#adb9bf', font=font)
sheet.save(OUT / 'contact-sheet.jpg', quality=94)
comparison=Image.new('RGB',(1440,315),'#151719')
d=ImageDraw.Draw(comparison)
for col,(kind,title) in enumerate([('calibrated','AE / opravená reference'),('web-before','PŘED / původní web'),('web','PO / web i Liquid Studio')]):
    d.text((col*480+14,10),title,fill='white',font=font)
    comparison.paste(Image.open(frame(kind,91)).convert('RGB').resize((480,270),Image.Resampling.LANCZOS),(col*480,42))
comparison.save(OUT/'before-after.jpg',quality=96)


# Same composition framing (720 x 405 displayed in the tutorial screen recording).
# The tutorial is 25 fps, so 3:01 is 3.04 s; nearest native 30 fps frame is 91.
sheet = Image.new('RGB', (1440, 940), '#151719')
draw = ImageDraw.Draw(sheet)
tutorial = Image.open(ROOT / 'reference/tutorial/tutorial-745.png').crop((650, 227, 1370, 632))
for x, y, title, im in [
    (0, 0, 'Tutorial / zaznam 12:25 / kompozice 3.04 s', tutorial),
    (720, 0, 'AE predchozi delivery / 3.033 s', Image.open(frame('ae', 91))),
    (0, 470, 'AE opravena reference / 3.033 s', Image.open(frame('calibrated', 91))),
    (720, 470, 'Web po kalibraci / 3.033 s', Image.open(frame('web', 91))),
]:
    draw.text((x + 14, y + 14), title, fill='white', font=font)
    sheet.paste(im.convert('RGB').resize((720, 405), Image.Resampling.LANCZOS), (x, y + 50))
sheet.save(OUT / 'tutorial-audit.jpg', quality=95)
provenance = {}
for file in (ROOT / 'reference/tutorial').glob('*'):
    if file.is_file() and file.suffix in ('.aepx', '.mp4', '.png'):
        provenance[file.name] = {'bytes': file.stat().st_size, 'sha256': hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()}
(OUT / 'reference-manifest.json').write_text(json.dumps(provenance, indent=2))
print(json.dumps(report['summary'], indent=2))
