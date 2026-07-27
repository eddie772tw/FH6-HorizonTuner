import re

# 1. TuningView.tsx: Add back convertSpringRate
with open('frontend/src/features/tuning/TuningView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("const { settings, convertTirePressure, convertTirePressureToBar, convertSpeed, t } = useSettings();",
                          "const { settings, convertTirePressure, convertTirePressureToBar, convertSpringRate, convertSpeed, t } = useSettings();")
with open('frontend/src/features/tuning/TuningView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 2. TuningSliderGrid.tsx: Fix tirePressure
with open('frontend/src/features/tuning/components/TuningSliderGrid.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("settings.units.pressure ===", "settings.units.tirePressure ===")
with open('frontend/src/features/tuning/components/TuningSliderGrid.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 3. AeroTuner.tsx
with open('frontend/src/features/tuning/components/AeroTuner.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'const AeroTunerComponent: React\.FC<AeroTunerProps> = \(\{.*?\}\) => \{', 'const AeroTunerComponent: React.FC<AeroTunerProps> = (props) => {', content)
with open('frontend/src/features/tuning/components/AeroTuner.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 4. ARBTuner.tsx
with open('frontend/src/features/tuning/components/ARBTuner.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'const ARBTunerComponent: React\.FC<ARBTunerProps> = \(\{.*?\}\) => \{', 'const ARBTunerComponent: React.FC<ARBTunerProps> = (props) => {', content)
with open('frontend/src/features/tuning/components/ARBTuner.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
