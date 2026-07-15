import os

presets_dir = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ui-presets"

# All known widget property keys from INI analysis
widget_configs = {}

for filename in sorted(os.listdir(presets_dir)):
    if not filename.endswith(".ini"):
        continue
    path = os.path.join(presets_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    preset_name = filename
    config = {}
    for line in lines:
        line = line.strip()
        if "=" in line:
            key, val = line.split("=", 1)
            config[key.strip()] = val.strip()
    widget_configs[preset_name] = config

# Print full preset comparison table
print("=" * 120)
print("FULL PRESET COMPARISON TABLE")
print("=" * 120)

# Collect all keys
all_keys = set()
for cfg in widget_configs.values():
    all_keys.update(cfg.keys())

# Group keys by widget type
widget_groups = {}
for key in sorted(all_keys):
    prefix = key.rsplit("_", 1)[0] if "_" in key else key
    # Try to find widget group
    for wname in ["controller", "map", "radio", "dashboard", "tacho", "boost", 
                   "oil_pressure", "oil_temp", "coolant_temp", "camera_shake", 
                   "camera_distortion", "pass_order"]:
        if key.startswith(wname):
            if wname not in widget_groups:
                widget_groups[wname] = []
            widget_groups[wname].append(key)
            break

for group_name, keys in sorted(widget_groups.items()):
    print(f"\n--- {group_name.upper()} ---")
    for key in sorted(keys):
        values = {}
        for preset_name, cfg in widget_configs.items():
            val = cfg.get(key, "N/A")
            values[preset_name] = val
        # Show only if there's variation
        unique_vals = set(values.values())
        marker = " *** VARIES ***" if len(unique_vals) > 1 else ""
        print(f"  {key}:{marker}")
        for pname, val in sorted(values.items()):
            print(f"    {pname:30s} = {val}")
