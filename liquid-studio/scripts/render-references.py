"""Reproduce the exact native exports used by the study. Requires AE + ffmpeg."""
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
AE = pathlib.Path("/Applications/Adobe After Effects 2026/aerender")
REF = ROOT / "reference"
PUBLIC = ROOT / "public" / "assets"
REF.mkdir(exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT)


def render(project, comp, start, end, filename, alpha=False):
    with tempfile.TemporaryDirectory(dir=REF, prefix="render-") as directory:
        target = pathlib.Path(directory) / filename
        run(AE, "-project", project, "-comp", comp, "-s", start, "-e", end,
            "-OMtemplate", "Lossless with Alpha" if alpha else "Lossless",
            "-output", target, "-mfr", "OFF", 50, "-mem_usage", 20, 30)
        # aerender may return 0 on failure. A fresh path prevents accepting an
        # old successful render when the current run failed.
        run("ffprobe", "-v", "error", "-show_entries", "format=duration", target)
        target.replace(REF / filename)


run(sys.executable, ROOT / "scripts" / "prepare-reference.py")
render(ROOT / "puvodni-liquid.aep", "LIQUID EFFECT", 0, 113, "liquid-alpha.mov", True)
render(ROOT / "puvodni-liquid.aep", "LANDING PAGE", 60, 60, "landing.mov")
render(REF / "render-copy.aep", "wdd_insta", 60, 60, "grid.mov")
packed = "[0:v]split=2[c][a];[c]format=rgb24[rgb];[a]alphaextract,format=rgb24[alpha];[rgb][alpha]vstack=inputs=2"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", REF / "liquid-alpha.mov",
    "-filter_complex", packed + ",format=yuv420p[out]", "-map", "[out]",
    "-c:v", "libx264", "-crf", 17, "-preset", "fast", "-movflags", "+faststart", "-an", PUBLIC / "liquid-packed.mp4")
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", REF / "liquid-alpha.mov",
    "-filter_complex", packed + "[out]", "-map", "[out]", "-frames:v", 1, PUBLIC / "liquid-packed.png")
for name in ("landing", "grid"):
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", REF / f"{name}.mov", "-frames:v", 1, PUBLIC / f"{name}.png")
