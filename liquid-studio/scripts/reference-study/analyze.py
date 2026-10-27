"""Decode every reference frame and measure continuity; needs Pillow and numpy.

python3 scripts/reference-study/analyze.py reference.mp4 output-directory
Pass --captures output-directory-from-capture.mjs to produce matched comparisons.
Decoded frames and generated media belong in an ignored or external directory.
"""
import argparse
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw


def box_sum(values, radius=4):
    padded = np.pad(values, ((radius, radius), (radius, radius)), mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    n = radius * 2 + 1
    return integral[n:, n:] - integral[:-n, n:] - integral[n:, :-n] + integral[:-n, :-n]


def measure(paths, fps):
    previous = previous_rgb = None
    result = []
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        rgb = np.array(image.resize((480, 270)), dtype=np.float32)
        gray = rgb @ np.array([.2126, .7152, .0722], dtype=np.float32)
        mask = rgb.max(2) > 30
        y, x = np.where(mask)
        row = {"frame": index, "time": index / fps, "coverage": float(mask.mean())}
        if len(x):
            row["bbox"] = [int(x.min() * image.width / 480), int(y.min() * image.height / 270),
                           int(x.max() * image.width / 480), int(y.max() * image.height / 270)]
        if previous is not None:
            iy, ix = np.gradient((gray + previous) * .5)
            temporal = gray - previous
            xx, yy, xy = box_sum(ix * ix), box_sum(iy * iy), box_sum(ix * iy)
            xt, yt = box_sum(ix * temporal), box_sum(iy * temporal)
            determinant = xx * yy - xy * xy
            valid = (determinant > 500) & mask & (ix * ix + iy * iy > 3)
            u = (-yy * xt + xy * yt) / np.maximum(determinant, 1)
            v = (xy * xt - xx * yt) / np.maximum(determinant, 1)
            speed = np.hypot(u, v)[valid] * fps * 4  # 1080p equivalent pixels/s
            row["rgbDelta"] = float(np.abs(rgb - previous_rgb).mean())
            if len(speed):
                row["flowSpeedQuartiles1080"] = np.percentile(speed, [25, 50, 75, 95]).tolist()
        result.append(row)
        previous, previous_rgb = gray, rgb
    return result


def contact_sheets(paths, fps, output):
    for start in range(0, len(paths), 96):
        sheet = Image.new("RGB", (1920, 1824), (24, 24, 24))
        draw = ImageDraw.Draw(sheet)
        for local, path in enumerate(paths[start:start + 96]):
            image = Image.open(path).convert("RGB").resize((240, 135))
            x, y = local % 8 * 240, local // 8 * 152
            sheet.paste(image, (x, y))
            draw.text((x + 4, y + 135), f"{start + local:03d}  {(start + local) / fps:.3f} s", fill="white")
        sheet.save(output / f"contact-{start // 96}.jpg", quality=92)


def compare(reference, captures, fps):
    comparisons = []
    for time in [0, 2, 5, 10, 20, 26.7666667]:
        index = min(len(reference) - 1, round(time * fps))
        pair = [Image.open(reference[index]).convert("RGB"),
                Image.open(captures / f"study-{time:.3f}.png").convert("RGB")]
        sheet = Image.new("RGB", (1920, 580), (24, 24, 24))
        draw = ImageDraw.Draw(sheet)
        masks = []
        for i, image in enumerate(pair):
            sheet.paste(image.resize((960, 540)), (i * 960, 40))
            draw.text((i * 960 + 12, 12), f"{'REFERENCE' if i == 0 else 'PROCEDURAL'} | {index / fps:.3f} s | 50%", fill="white")
            masks.append(np.array(image.resize((480, 270))).max(2) > 30)
        sheet.save(captures / f"comparison-{time:.3f}.jpg", quality=94)
        comparisons.append({"time": index / fps, "coverage": [float(m.mean()) for m in masks],
                            "silhouetteIoU": float((masks[0] & masks[1]).sum() / (masks[0] | masks[1]).sum())})
    # Same material, source, brush gestures, settings, timestamps and scale.
    for time in [0, 2, 5, 10, 20, 26.7666667]:
        before = captures / f"before-{time:.3f}.png"
        if not before.exists():
            continue
        sheet = Image.new("RGB", (1920, 580), (24, 24, 24))
        draw = ImageDraw.Draw(sheet)
        for i, name in enumerate(["before", "after"]):
            sheet.paste(Image.open(captures / f"{name}-{time:.3f}.png").convert("RGB").resize((960, 540)), (i * 960, 40))
            draw.text((i * 960 + 12, 12), f"{name.upper()} | {time:.3f} s | SAME AREA / PALETTE / INPUT | 50%", fill="white")
        sheet.save(captures / f"application-{time:.3f}.jpg", quality=94)
    return comparisons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--captures", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(args.reference)]))
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    numerator, denominator = map(float, video["avg_frame_rate"].split("/"))
    fps = numerator / denominator
    frames = args.output / "frames"
    frames.mkdir(exist_ok=True)
    if len(list(frames.glob("*.jpg"))) != int(video["nb_frames"]):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(args.reference), "-fps_mode", "passthrough", "-q:v", "2", str(frames / "%04d.jpg")], check=True)
    paths = sorted(frames.glob("*.jpg"))
    contact_sheets(paths, fps, args.output)
    metrics = measure(paths, fps)
    (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (args.output / "frame-metrics.json").write_text(json.dumps(metrics, indent=2))
    summary = {"frames": len(paths), "fps": fps, "resolution": [video["width"], video["height"]],
               "coverageMinMedianMax": np.percentile([m["coverage"] for m in metrics], [0, 50, 100]).tolist(),
               "medianFlowSpeed1080": float(np.median([m["flowSpeedQuartiles1080"][1] for m in metrics if "flowSpeedQuartiles1080" in m])),
               "method": "9x9 Lucas-Kanade on 480x270 RGB luma; local estimates, not object trajectories"}
    if args.captures:
        summary["comparisons"] = compare(paths, args.captures, fps)
        motion = sorted((args.captures / "motion").glob("*.png"))
        if motion:
            generated = measure(motion, fps)
            (args.captures / "motion-metrics.json").write_text(json.dumps(generated, indent=2))
            summary["generatedMedianFlowSpeed1080"] = float(np.median([m["flowSpeedQuartiles1080"][1] for m in generated if "flowSpeedQuartiles1080" in m]))
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
