import re

# 1. Fix TuningView.tsx
with open('frontend/src/features/tuning/TuningView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unused imports from useSettings
content = re.sub(r"const \{ settings, convertTirePressure, convertTirePressureToBar, convertSpringRate, convertSpringRateToKgfmm, convertHeight, convertHeightToCm, convertSpeed, t \} = useSettings\(\);",
                 "const { settings, convertTirePressure, convertTirePressureToBar, convertSpeed, t } = useSettings();", content)

# Remove getUnitLabel
get_unit_start = content.find('const getUnitLabel = (type: string) => {')
if get_unit_start != -1:
    get_unit_end = content.find('  };\n', get_unit_start) + 5
    content = content[:get_unit_start] + content[get_unit_end:]

# Remove formRowStyle
form_row_start = content.find('const formRowStyle: React.CSSProperties = {')
if form_row_start != -1:
    form_row_end = content.find('};\n', form_row_start) + 3
    content = content[:form_row_start] + content[form_row_end:]

with open('frontend/src/features/tuning/TuningView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Fix GearingTuner.tsx
with open('frontend/src/features/tuning/components/GearingTuner.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("../../context/SettingsContext", "../../../context/SettingsContext")
content = content.replace("section: string", "section: any")
with open('frontend/src/features/tuning/components/GearingTuner.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 3. Fix SuspensionTuner.tsx
with open('frontend/src/features/tuning/components/SuspensionTuner.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("../../context/SettingsContext", "../../../context/SettingsContext")
content = content.replace("section: string", "section: any")
with open('frontend/src/features/tuning/components/SuspensionTuner.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 4. Fix DifferentialTuner.tsx
with open('frontend/src/features/tuning/components/DifferentialTuner.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("section: string", "section: any")
with open('frontend/src/features/tuning/components/DifferentialTuner.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 5. Fix TuningSliderGrid.tsx
with open('frontend/src/features/tuning/components/TuningSliderGrid.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("section: string", "section: any")
content = content.replace("getUnitLabel, \n    t ", "t \n  } = useSettings();\n\n  const getUnitLabel = (type: string) => {\n    switch(type) {\n      case 'pressure': return settings.units.pressure === 'bar' ? 'Bar' : 'PSI';\n      case 'force': return '';\n      case 'spring': return convertSpringRate(1).label;\n      case 'height': return convertHeight(1).label;\n      default: return '';\n    }\n  };\n")
content = content.replace("const { \n    convertTirePressure,", "const { settings, \n    convertTirePressure,")
with open('frontend/src/features/tuning/components/TuningSliderGrid.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 6. Fix TuningSlider.tsx
with open('frontend/src/features/tuning/components/TuningSlider.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("section: string", "section: any")
with open('frontend/src/features/tuning/components/TuningSlider.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixes applied.")
