import json
import urllib.request
import re
import os

URL = "https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw/edd5ac8dbb000c024cd2c6359140feb21d609ba9/Forza%2520Horizon%25206%2520Car%2520Ordinals.json"
DB_PATH = os.path.join(os.path.dirname(__file__), "car_database.json")

def main():
    try:
        with urllib.request.urlopen(URL) as response:
            data = response.read().decode('utf-8')
            new_data = json.loads(data)
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    try:
        with open(DB_PATH, "r") as f:
            db_data = json.load(f)
    except FileNotFoundError:
        db_data = {}

    updated_count = 0
    added_count = 0

    for name_str, ordinal_str in new_data.items():
        try:
            ordinal = int(ordinal_str)
        except ValueError:
            print(f"Skipping invalid ordinal for {name_str}: {ordinal_str}")
            continue

        ordinal_s = str(ordinal)

        # Parse the name only for new entries
        match = re.match(r"^(\d{4})\s+(.+?)\s+(.+)$", name_str)
        if match:
            year = int(match.group(1))
            make = match.group(2)
            model = match.group(3)
        else:
            match_no_year = re.match(r"^(.+?)\s+(.+)$", name_str)
            if match_no_year:
                year = 0
                make = match_no_year.group(1)
                model = match_no_year.group(2)
            else:
                print(f"Failed to parse name: {name_str}")
                year = 0
                make = "Unknown"
                model = name_str

        car_entry = {
            "display_name": name_str,
            "year": year,
            "make": make,
            "model": model,
            "car_id": ordinal,
            "source": "Forza Horizon 6 Car Ordinals JSON Gist",
        }

        if ordinal_s in db_data:
            # Update existing, but KEEP existing year, make, model and other fields
            existing_entry = db_data[ordinal_s]

            # only update specific fields that are safe to update
            if "display_name" in car_entry: existing_entry["display_name"] = car_entry["display_name"]
            if "source" in car_entry: existing_entry["source"] = car_entry["source"]

            db_data[ordinal_s] = existing_entry
            updated_count += 1
        else:
            db_data[ordinal_s] = car_entry
            added_count += 1

    # Sort dictionary by keys as integers before dumping
    sorted_db_data = {k: db_data[k] for k in sorted(db_data, key=lambda x: int(x))}

    with open(DB_PATH, "w") as f:
        json.dump(sorted_db_data, f, indent=2)

    print(f"Done. Added {added_count}, updated {updated_count} cars.")

if __name__ == "__main__":
    main()
