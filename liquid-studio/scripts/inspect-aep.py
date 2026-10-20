"""Read-only inventory of the source AEP's RIFF chunks (no Adobe dependency).

The undocumented binary format is not fully decoded. Static cdat values are
big-endian doubles; animation payloads are retained as hex for later inspection.
"""
import json
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parent.parent
data = (ROOT / "puvodni-liquid.aep").read_bytes()


def chunks(start, end):
    while start + 8 <= end:
        tag = data[start:start + 4].decode("ascii")
        size = struct.unpack_from(">I", data, start + 4)[0]
        pos = start + 8
        if pos + size > end:
            # Some plugin LIST payloads are opaque rather than RIFF children.
            break
        payload = data[pos:pos + size]
        children = list(chunks(pos + 4, pos + size)) if tag == "LIST" else []
        yield {"tag": tag, "type": payload[:4].decode("ascii") if tag == "LIST" else None,
               "data": payload, "children": children}
        start = pos + size + size % 2


def text(node):
    return node["data"].rstrip(b"\0").decode("utf-8", "replace")


def properties(nodes):
    result = []
    match = None
    for node in nodes:
        if node["tag"] == "tdmn":
            match = text(node)
        elif node["tag"] == "LIST" and node["type"] in ("tdgp", "tdbs"):
            entry = {"matchName": match}
            for child in node["children"]:
                raw = child["data"]
                if child["tag"] == "tdsn" and raw[:4] == b"Utf8":
                    entry["name"] = raw[8:].rstrip(b"\0").decode("utf8", "replace")
                elif child["tag"] == "tdsb":
                    entry["flags"] = int.from_bytes(raw, "big")
                elif child["tag"] == "cdat" and len(raw) % 8 == 0:
                    entry["staticValues"] = list(struct.unpack(">" + "d" * (len(raw) // 8), raw))
                elif child["tag"] == "Utf8":
                    entry["text"] = text(child)
                elif child["tag"] == "LIST" and child["type"] == "list":
                    entry["animationChunks"] = {c["tag"]: c["data"].hex() for c in child["children"]}
            sub = properties(node["children"])
            if sub:
                entry["properties"] = sub
            result.append(entry)
        elif node["tag"] == "LIST":
            result.extend(properties(node["children"]))
    return result


inventory = []


def visit(nodes, folder=""):
    for node in nodes:
        children = node["children"]
        if node["type"] == "Item":
            item = {"folder": folder}
            for child in children:
                if child["tag"] == "iide":
                    item["id"] = int.from_bytes(child["data"], "little")
                elif child["tag"] == "Utf8" and "name" not in item:
                    item["name"] = text(child)
                elif child["tag"] == "cdta":
                    item["compositionData"] = child["data"].hex()
            layers = []
            for child in children:
                if child["type"] == "Layr":
                    layer = {"properties": properties(child["children"])}
                    for field in child["children"]:
                        if field["tag"] == "Utf8":
                            layer["name"] = text(field)
                        elif field["tag"] == "ldta":
                            layer["layerData"] = field["data"].hex()
                    layers.append(layer)
            if "compositionData" in item:
                item["layers"] = layers
                inventory.append(item)
            for child in children:
                if child["type"] == "Sfdr":
                    visit(child["children"], folder + "/" + item.get("name", ""))
        else:
            visit(children, folder)


visit(list(chunks(12, len(data))))
output = ROOT / "reference" / "aep-inventory.json"
output.write_text(json.dumps(inventory, indent=2, ensure_ascii=False))
print(f"Wrote {len(inventory)} compositions to {output}")
for comp in inventory:
    print(f"{comp['id']:4} {comp['folder']}/{comp['name']} ({len(comp['layers'])} layers)")
