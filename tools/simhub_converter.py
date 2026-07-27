import argparse
import json
import os
import re
import shutil
import sys
import zipfile

# A dictionary to automatically map common SimHub properties to our HUD Core variables
COMMON_MAPPINGS = {
    "EngineRpms": "data.rpm",
    "SpeedLocal": "data.speed",
    "SpeedKmh": "data.speed",
    "Gear": "data.gear",
    "MaxRpm": "payload.redlineRpm",
    "Rpms": "data.rpm",
}


def parse_simhub_color(color_str):
    """Convert a SimHub color string to a valid CSS color."""
    if not color_str:
        return "transparent"
    if color_str.startswith("#"):
        # Check if it's ARGB instead of RGBA (SimHub uses #AARRGGBB)
        if len(color_str) == 9:
            a = color_str[1:3]
            r = color_str[3:5]
            g = color_str[5:7]
            b = color_str[7:9]
            # Convert to rgba for CSS
            a_val = int(a, 16) / 255.0
            return f"rgba({int(r, 16)}, {int(g, 16)}, {int(b, 16)}, {a_val:.3f})"
        return color_str
    return color_str  # Fallback (might be "Transparent", "Red", etc)


def generate_dom_elements(djson_data):
    """Parse the djson data and generate absolute positioned HTML DOM strings."""
    html_elements = []

    # Djson usually contains an array of screens, each with an array of items.
    screens = djson_data.get("Screens", [])
    if not screens:
        print("Warning: No screens found in .djson.")
        return html_elements

    # We only process the first screen for simplicity.
    main_screen = screens[0]
    items = main_screen.get("Items", [])

    html_elements.append(
        "<!-- TODO: Check layout. Automatically generated from SimHub Dash -->"
    )

    for idx, item in enumerate(items):
        item_type = item.get("$type", "Unknown")
        name = item.get("Name", f"Element_{idx}")
        top = item.get("Top", 0)
        left = item.get("Left", 0)
        width = item.get("Width", 100)
        height = item.get("Height", 100)
        visible = item.get("Visible", True)

        display = "block" if visible else "none"

        style = f"position: absolute; top: {top}px; left: {left}px; width: {width}px; height: {height}px; display: {display};"

        # Determine element based on SimHub type
        if "TextItem" in item_type:
            text = item.get("Text", "")
            font_size = item.get("FontSize", 20)
            font_family = item.get("FontFamily", "sans-serif")
            font_weight = item.get("FontWeight", "normal")
            color = parse_simhub_color(item.get("TextColor", "#FFFFFFFF"))
            align = item.get("HorizontalAlignment", "Left").lower()

            style += f" font-size: {font_size}px; font-family: '{font_family}'; font-weight: {font_weight}; color: {color}; text-align: {align};"

            html_elements.append(f"<div id='{name}' style=\"{style}\">{text}</div>")

        elif "ImageItem" in item_type:
            image = item.get("Image", "")
            if image:
                html_elements.append(
                    f"<img id='{name}' src='Images/{image}' style=\"{style}\" />"
                )
            else:
                html_elements.append(
                    f"<div id='{name}' style=\"{style} background-color: rgba(255,0,0,0.3); border: 1px solid red;\">Missing Image</div>"
                )

        elif "RectangleItem" in item_type:
            bg_color = parse_simhub_color(item.get("BackgroundColor", "transparent"))
            html_elements.append(
                f"<div id='{name}' style=\"{style} background-color: {bg_color};\"></div>"
            )

        elif "EllipseItem" in item_type:
            bg_color = parse_simhub_color(item.get("BackgroundColor", "transparent"))
            html_elements.append(
                f"<div id='{name}' style=\"{style} background-color: {bg_color}; border-radius: 50%;\"></div>"
            )

        else:
            # Fallback for unknown elements
            html_elements.append(f"<!-- Unhandled type: {item_type} for '{name}' -->")
            html_elements.append(
                f"<div id='{name}' style=\"{style} border: 1px dashed gray;\">Unhandled: {name}</div>"
            )

    return html_elements


def extract_bindings(djson_data):
    """Scan all items in the .djson and extract any variables used in bindings.
    Returns a dict mapping element Name -> list of variables it uses.
    """
    element_variables = {}
    screens = djson_data.get("Screens", [])
    if not screens:
        return element_variables

    main_screen = screens[0]
    items = main_screen.get("Items", [])

    for idx, item in enumerate(items):
        name = item.get("Name", f"Element_{idx}")
        bindings = item.get("Bindings", {})
        vars_used = set()

        for binding_key, binding_config in bindings.items():
            formula = binding_config.get("Formula", {})
            expression = formula.get("Expression", "")

            # Simple heuristic: Look for [VariableName] in the expression
            matches = re.findall(r"\[([^\]]+)\]", expression)
            for match in matches:
                vars_used.add(match)

        if vars_used:
            element_variables[name] = list(vars_used)

    return element_variables


def resolve_mappings(element_variables):
    """Prompt the user to map SimHub variables to HUD Core variables.
    Returns a dictionary of mapped variables.
    """
    # Collect all unique variables
    all_vars = set()
    for vars_list in element_variables.values():
        all_vars.update(vars_list)

    if not all_vars:
        return {}

    print("\n--- Variable Mapping Phase ---")
    print(
        "SimHub Dash uses properties that need to be mapped to HorizonTuner HUD Core variables (e.g., data.rpm, data.speed)."
    )

    final_mappings = {}

    for var in all_vars:
        if var in COMMON_MAPPINGS:
            mapped_val = COMMON_MAPPINGS[var]
            print(f"Auto-mapped [{var}] -> {mapped_val}")
            final_mappings[var] = mapped_val
        else:
            print(f"\nFound unmapped property: [{var}]")
            user_input = input(
                f"Enter mapping for [{var}] (or press Enter to skip): "
            ).strip()
            if user_input:
                final_mappings[var] = user_input
                print(f"Mapped [{var}] -> {user_input}")
            else:
                print(f"Skipped [{var}]. Will insert a TODO in the generated code.")

    print("------------------------------\n")
    return final_mappings


def process_assets(zip_ref, temp_dir, target_dir):
    """Move Images and Fonts from the extracted zip to the target HUD directory."""
    print("Processing assets...")
    # The structure might have a root folder [Dashboard_Name]/ inside the zip.
    # Let's find the root dir first.
    root_dirs = [
        name
        for name in os.listdir(temp_dir)
        if os.path.isdir(os.path.join(temp_dir, name))
    ]

    if not root_dirs:
        base_dir = temp_dir
    elif len(root_dirs) == 1 and not any(
        f.endswith(".djson") for f in os.listdir(temp_dir)
    ):
        base_dir = os.path.join(temp_dir, root_dirs[0])
    else:
        base_dir = temp_dir

    images_dir = os.path.join(base_dir, "Images")
    fonts_dir = os.path.join(base_dir, "Fonts")

    target_images = os.path.join(target_dir, "Images")
    target_fonts = os.path.join(target_dir, "Fonts")

    if os.path.exists(images_dir):
        print(f"Found Images directory, copying to {target_images}")
        shutil.copytree(images_dir, target_images, dirs_exist_ok=True)

    if os.path.exists(fonts_dir):
        print(f"Found Fonts directory, copying to {target_fonts}")
        shutil.copytree(fonts_dir, target_fonts, dirs_exist_ok=True)

    # Find the .djson file
    djson_file = None
    for file in os.listdir(base_dir):
        if file.endswith(".djson"):
            djson_file = os.path.join(base_dir, file)
            break

    if not djson_file:
        print("Error: Could not find .djson file in the simhubdash package.")
        sys.exit(1)

    print(f"Found core config: {djson_file}")

    with open(djson_file, "r", encoding="utf-8") as f:
        try:
            # SimHub djson can sometimes have BOM or weird encoding, but usually utf-8 is fine
            # It also sometimes contains line breaks or formatting issues.
            data = json.load(f)
            return data
        except json.JSONDecodeError as e:
            print(f"Error parsing .djson file: {e}")
            sys.exit(1)


def generate_index_html(
    output_name, target_hud_dir, dom_elements, element_bindings, variable_mappings
):
    """Generate the final index.html file with DOM and Javascript."""
    html_path = os.path.join(target_hud_dir, "index.html")

    # Base layout based on HUD_DEVELOPMENT_GUIDE.md
    html_content = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        '    <meta charset="UTF-8">',
        f"    <title>{output_name} HUD</title>",
        "    <!-- 1. Include shared base styles -->",
        '    <link rel="stylesheet" href="../shared/hud-base.css">',
        "    <style>",
        "        /* SimHub Dash Styles */",
        f"        .{output_name}-container {{",
        "            width: 100%;",
        "            height: 100%;",
        "            position: relative;",
        "            overflow: hidden;",
        "        }",
        "    </style>",
        "</head>",
        "<body>",
        "    <!-- 2. Shared center telemetry mount -->",
        '    <div id="teleCardsMount"></div>',
        "",
        "    <!-- 3. Standard root wrapper & container -->",
        '    <div class="hud-root-wrapper">',
        f'        <div class="hud-gauge-container {output_name}-container" id="{output_name}Container">',
    ]

    # Add DOM elements
    for element in dom_elements:
        html_content.append(f"            {element}")

    html_content.extend(
        [
            "        </div>",
            "    </div>",
            "",
            "    <!-- 4. Include shared JS modules -->",
            '    <script src="../shared/telemetry-cards.js"></script>',
            '    <script src="../shared/hud-core.js"></script>',
            "",
            "    <script>",
            "        // 5. Register and activate new style",
            f"        HUDCore.registerStyle('{output_name}', {{",
            f"            containerId: '{output_name}Container',",
            "            scaleMultiplier: 1.0,",
            "",
            "            onInit: function(payload) {",
            f"                console.log('{output_name} HUD Initialized');",
            "            },",
            "",
            "            onElementsChange: function(elements) {",
            "                // Control internal component visibility here if needed",
            "            },",
            "",
            "            onFrame: function(data, payload) {",
            "                // Render 60Hz data",
        ]
    )

    # Add JS update logic for mapped variables
    for element_name, vars_used in element_bindings.items():
        if not vars_used:
            continue

        # We'll just map the first variable for simplicity of the text content update
        main_var = vars_used[0]
        mapped_val = variable_mappings.get(main_var)

        if mapped_val:
            html_content.append(
                f"                let el_{element_name} = document.getElementById('{element_name}');"
            )
            html_content.append(
                f"                if (el_{element_name}) el_{element_name}.textContent = Math.round({mapped_val} || 0);"
            )
        else:
            html_content.append(
                f"                // TODO: Element '{element_name}' mapped to skipped property: [{main_var}]"
            )

    html_content.extend(
        [
            "            },",
            "",
            "            onAnimate: function() {",
            "                // Execute startup animations",
            "            }",
            "        });",
            "",
            "        // 6. Activate",
            f"        HUDCore.init('{output_name}');",
            "    </script>",
            "</body>",
            "</html>",
        ]
    )

    with open(html_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html_content))

    print(f"Successfully generated {html_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert a .simhubdash file to a FH6-HorizonTuner HUD module."
    )
    parser.add_argument("input_file", help="Path to the .simhubdash file")
    parser.add_argument(
        "output_name", help="Name of the generated HUD module (e.g., my_new_hud)"
    )
    parser.add_argument(
        "--out-dir",
        default="hud_overlay",
        help="Output directory (default: hud_overlay)",
    )

    args = parser.parse_args()

    input_file = args.input_file
    output_name = args.output_name
    out_dir = args.out_dir

    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)

    print(
        f"Starting conversion of {input_file} to HUD module '{output_name}' in '{out_dir}'..."
    )

    target_hud_dir = os.path.join(out_dir, output_name)
    os.makedirs(target_hud_dir, exist_ok=True)

    temp_extract_dir = os.path.join(out_dir, f".temp_{output_name}_extract")

    try:
        # Extract the zip
        print(f"Extracting {input_file} to temporary directory...")
        with zipfile.ZipFile(input_file, "r") as zip_ref:
            zip_ref.extractall(temp_extract_dir)

        djson_data = process_assets(zip_ref, temp_extract_dir, target_hud_dir)

        dom_elements = generate_dom_elements(djson_data)
        element_bindings = extract_bindings(djson_data)
        variable_mappings = resolve_mappings(element_bindings)
        generate_index_html(
            output_name,
            target_hud_dir,
            dom_elements,
            element_bindings,
            variable_mappings,
        )

        print("Assets extracted and parsed successfully.")

    finally:
        # Cleanup
        if os.path.exists(temp_extract_dir):
            shutil.rmtree(temp_extract_dir)
            print("Cleaned up temporary directory.")


if __name__ == "__main__":
    main()
