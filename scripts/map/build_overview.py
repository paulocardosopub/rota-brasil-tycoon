"""Build the lazy Brasília fleet overview from the shipped OSM-derived map.

The output is deliberately static: the UI only moves lightweight HTML markers.
No commercial map screenshot or runtime tile request is used.
"""

from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "cities" / "brasilia"
WIDTH, HEIGHT, PADDING = 1440, 1040, 38
MAJOR = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"}


def main() -> None:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    regions = [region for region in manifest["regions"] if region.get("playable", True)]
    bounds = {
        "minX": min(region["bounds"]["minX"] for region in regions),
        "minY": min(region["bounds"]["minY"] for region in regions),
        "maxX": max(region["bounds"]["maxX"] for region in regions),
        "maxY": max(region["bounds"]["maxY"] for region in regions),
    }
    image = Image.new("RGB", (WIDTH, HEIGHT), "#cfe8cf")
    draw = ImageDraw.Draw(image, "RGBA")

    for region in regions:
        polygon = [project(point, bounds) for point in region["polygon"]]
        color = region.get("color", "#82b894")
        draw.polygon(polygon, fill=(*hex_rgb(color), 34), outline=(*hex_rgb(color), 105), width=2)

    # Simplified Lago Paranoá silhouette in the same local-metric projection.
    # Its anchors follow the lake corridor represented by the OSM regional data.
    lake = [
        (-500, -7200), (800, -6100), (1500, -4700), (2550, -3500), (3800, -2500),
        (5050, -900), (5550, 300), (5250, 1600), (6100, 2850), (5900, 4200),
        (4750, 3100), (4300, 1800), (3900, 650), (3100, -350), (2350, -1450),
        (1400, -2500), (550, -4100), (-900, -5400)
    ]
    lake_points = [project({"x": x, "y": y}, bounds) for x, y in lake]
    draw.line(lake_points, fill=(83, 190, 220, 220), width=46, joint="curve")
    draw.line(lake_points, fill=(114, 211, 232, 235), width=32, joint="curve")

    roads: dict[str, dict] = {}
    for entry in manifest["chunks"]:
        if not entry.get("roadCount"):
            continue
        chunk = json.loads((DATA / entry["file"]).read_text(encoding="utf-8"))
        for road in chunk.get("roads", []):
            if road.get("highway") in MAJOR and len(road.get("points", [])) >= 2:
                roads.setdefault(str(road["id"]), road)

    priority = {"motorway": 4, "trunk": 4, "primary": 3, "secondary": 2}
    for road in sorted(roads.values(), key=lambda item: priority.get(str(item.get("highway", "")).replace("_link", ""), 1)):
        road_class = str(road.get("highway", "")).replace("_link", "")
        width = {"motorway": 6, "trunk": 5, "primary": 4, "secondary": 3}.get(road_class, 2)
        points = [project(point, bounds) for point in road["points"]]
        draw.line(points, fill=(244, 248, 241, 225), width=width + 3, joint="curve")
        draw.line(points, fill=(74, 95, 110, 220), width=width, joint="curve")

    title_font = font(22, bold=True)
    label_font = font(16, bold=True)
    small_font = font(13)
    for region in regions:
        x, y = project(region["center"], bounds)
        label = region["name"]
        box = draw.textbbox((x, y), label, font=label_font, anchor="mm")
        draw.rounded_rectangle((box[0] - 5, box[1] - 3, box[2] + 5, box[3] + 3), 5, fill=(239, 248, 239, 190))
        draw.text((x, y), label, font=label_font, fill=(38, 67, 58, 235), anchor="mm")

    draw.rounded_rectangle((24, 22, 420, 82), 14, fill=(7, 23, 34, 225))
    draw.text((44, 36), "Brasília • mapa geral da frota", font=title_font, fill=(234, 255, 248, 255))
    draw.text((44, 66), "Base viária: OpenStreetMap contributors • ODbL", font=small_font, fill=(155, 190, 182, 255), anchor="lm")

    output = DATA / "overview-map.webp"
    image.save(output, "WEBP", quality=82, method=6)
    metadata = {
        "cityId": "brasilia",
        "image": "overview-map.webp",
        "width": WIDTH,
        "height": HEIGHT,
        "padding": PADDING,
        "bounds": bounds,
        "mapVersion": manifest["mapVersion"],
        "source": "OpenStreetMap contributors",
        "license": "ODbL",
    }
    (DATA / "overview-map.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{output} • {output.stat().st_size / 1024:.1f} KiB • {len(roads)} vias principais")


def project(point: dict, bounds: dict) -> tuple[int, int]:
    usable_w = WIDTH - PADDING * 2
    usable_h = HEIGHT - PADDING * 2
    x = PADDING + (point["x"] - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * usable_w
    y = PADDING + (point["y"] - bounds["minY"]) / (bounds["maxY"] - bounds["minY"]) * usable_h
    return round(x), round(y)


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def font(size: int, bold: bool = False):
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    path = Path("C:/Windows/Fonts") / filename
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


if __name__ == "__main__":
    main()
