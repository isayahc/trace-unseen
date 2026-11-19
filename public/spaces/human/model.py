import json
from pathlib import Path
from opencad import Part
layout = json.loads(Path(__file__).with_name("layout.json").read_text(encoding="utf-8"))
FORMA_EXPORT_SHAPE_IDS = []
for item in layout["objects"]:
    w,d,h = [v*1000 for v in item["size_m"]]
    xyz = tuple(v*1000 for v in item["center_m"])
    part = Part(name=item["id"]).box(w,d,h,name=item["label"]).translate(xyz)
    FORMA_EXPORT_SHAPE_IDS.append(part.shape_id)
