import os
from PIL import Image

def map_images(resources_dir):
    print("=== Image Dimensions Mapping ===")
    images = []
    for filename in os.listdir(resources_dir):
        if filename.endswith(".png") or filename.endswith(".dds"):
            path = os.path.join(resources_dir, filename)
            try:
                if filename.endswith(".png"):
                    img = Image.open(path)
                    width, height = img.size
                else:
                    # DDS size can be read simply from its header
                    with open(path, "rb") as f:
                        f.seek(12)
                        height = int.from_bytes(f.read(4), "little")
                        width = int.from_bytes(f.read(4), "little")
                images.append((filename, width, height))
            except Exception as e:
                print(f"[-] Error reading {filename}: {e}")

    # Group by resource ranges
    groups = {
        "2xx (Map & Main Background)": [],
        "3xx (Radio & Dashboard UI Parts)": [],
        "4xx (Gauge Dials & Needles)": [],
        "5xx (Controller Inputs & HUD Icons)": [],
        "6xx (GPS & Extra Map Elements)": []
    }
    
    for fn, w, h in sorted(images):
        res_id = int(fn.split("_")[-1].split(".")[0])
        if 200 <= res_id < 300:
            groups["2xx (Map & Main Background)"].append((fn, w, h))
        elif 300 <= res_id < 400:
            groups["3xx (Radio & Dashboard UI Parts)"].append((fn, w, h))
        elif 400 <= res_id < 500:
            groups["4xx (Gauge Dials & Needles)"].append((fn, w, h))
        elif 500 <= res_id < 600:
            groups["5xx (Controller Inputs & HUD Icons)"].append((fn, w, h))
        elif 600 <= res_id < 700:
            groups["6xx (GPS & Extra Map Elements)"].append((fn, w, h))

    for group_name, items in groups.items():
        print(f"\nGroup: {group_name}")
        for fn, w, h in items:
            print(f"  - {fn}: {w}x{h}")

if __name__ == "__main__":
    res_dir = r"D:\FH6-Bundle\FH6-HorizonTuner\tools\ForzaHUD_RE\extracted_resources"
    map_images(res_dir)
