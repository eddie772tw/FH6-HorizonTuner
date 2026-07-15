import os
import configparser

def analyze_presets(presets_dir):
    presets = {}
    for filename in os.listdir(presets_dir):
        if filename.endswith(".ini"):
            path = os.path.join(presets_dir, filename)
            config = configparser.ConfigParser(strict=False, allow_no_value=True)
            try:
                # Some files might not have section headers. Since Win32 INI files often don't,
                # we prepended a dummy section header '[preset]' to parse it properly.
                with open(path, "r", encoding="utf-8") as f:
                    content = "[preset]\n" + f.read()
                config.read_string(content)
                preset_data = dict(config["preset"])
                presets[filename] = preset_data
            except Exception as e:
                print(f"[-] Error parsing {filename}: {e}")

    # Now output statistical summary of widgets and their values
    widget_types = [
        "controller_widget", "map_widget", "radio_widget", 
        "dashboard_widget", "tacho_widget", "boost_widget",
        "oil_pressure_widget", "oil_temp_widget", "coolant_temp_widget"
    ]
    
    print("\n=== Preset Widget Value Mapping ===")
    for wt in widget_types:
        values = set()
        mapping = {}
        for fn, data in presets.items():
            val = data.get(wt)
            if val is not None:
                values.add(val)
                mapping[fn] = val
        print(f"\nWidget: {wt}")
        print(f"  Distinct values in presets: {list(values)}")
        for fn, val in mapping.items():
            print(f"    - {fn}: {val}")

if __name__ == "__main__":
    presets_dir = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ui-presets"
    analyze_presets(presets_dir)
