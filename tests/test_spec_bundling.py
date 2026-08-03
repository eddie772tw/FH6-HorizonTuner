import ast
import os


def test_spec_hud_overlay_packaging_no_wildcard():
    spec_path = os.path.join(os.path.dirname(__file__), "..", "FH6-HorizonTuner.spec")
    assert os.path.exists(spec_path), "FH6-HorizonTuner.spec file does not exist"

    with open(spec_path, "r", encoding="utf-8") as f:
        spec_content = f.read()

    # Parse spec python code to extract added_files assignment
    tree = ast.parse(spec_content, filename="FH6-HorizonTuner.spec")

    added_files_found = False
    hud_overlay_entry = None
    car_params_entry = None
    lang_entry = None

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "added_files":
                    added_files_found = True
                    # Evaluate literal tuple elements in added_files list
                    if isinstance(node.value, ast.List):
                        for elt in node.value.elts:
                            if isinstance(elt, ast.Tuple) and len(elt.elts) == 2:
                                src = ast.literal_eval(elt.elts[0])
                                dst = ast.literal_eval(elt.elts[1])
                                if dst == "hud_overlay":
                                    hud_overlay_entry = (src, dst)
                                elif dst == "car_params":
                                    car_params_entry = (src, dst)
                                elif dst == "lang":
                                    lang_entry = (src, dst)

    assert added_files_found, "added_files assignment not found in spec"
    assert hud_overlay_entry is not None, "hud_overlay entry not found in added_files"
    assert car_params_entry is not None, "car_params entry not found in added_files"
    assert lang_entry is not None, "lang entry not found in added_files"

    # Ensure no wildcards in directory resource source paths
    assert "*" not in hud_overlay_entry[0], (
        f"hud_overlay source contains wildcard '{hud_overlay_entry[0]}', which flattens subdirectories in PyInstaller package"
    )
    assert "*" not in car_params_entry[0], (
        f"car_params source contains wildcard '{car_params_entry[0]}'"
    )
    assert "*" not in lang_entry[0], f"lang source contains wildcard '{lang_entry[0]}'"

    assert hud_overlay_entry[0] == "hud_overlay"
    assert car_params_entry[0] == "backend/car_params"
    assert lang_entry[0] == "lang"
