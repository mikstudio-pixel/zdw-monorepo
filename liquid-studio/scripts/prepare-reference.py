"""Make a disposable render copy; never modify the supplied AEP.

wdd_insta layer 665 refers to the unavailable external background movie (item
16). Disable only that layer's visibility bit, preserving every layer index.
"""
import pathlib
import struct

root = pathlib.Path(__file__).resolve().parent.parent
data = bytearray((root / "puvodni-liquid.aep").read_bytes())
changed = []


def visit(start, end):
    while start + 8 <= end:
        tag = data[start:start + 4]
        size = struct.unpack_from(">I", data, start + 4)[0]
        pos = start + 8
        if pos + size > end:
            break
        if tag == b"LIST":
            visit(pos + 4, pos + size)
        elif tag == b"ldta" and size == 164:
            layer_id = struct.unpack_from(">I", data, pos)[0]
            if layer_id == 665:
                assert struct.unpack_from(">I", data, pos + 40)[0] == 16
                data[pos + 39] &= 0xFE
                changed.append(layer_id)
        start = pos + size + size % 2


visit(12, len(data))
assert changed == [665], changed
destination = root / "reference" / "render-copy.aep"
destination.write_bytes(data)
print(f"Disabled missing background layer {changed} in {destination}")
