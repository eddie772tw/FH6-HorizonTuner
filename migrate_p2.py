import os
import shutil
import re

# 1. Create directories
dirs = [
    'frontend/src/features/drag_test',
    'frontend/src/features/theme',
    'frontend/src/features/analysis',
    'frontend/src/features/settings'
]
for d in dirs:
    os.makedirs(d, exist_ok=True)

# 2. Move files
moves = {
    'frontend/src/components/DragTestView.tsx': 'frontend/src/features/drag_test/DragTestView.tsx',
    'frontend/src/components/ThemeView.tsx': 'frontend/src/features/theme/ThemeView.tsx',
    'frontend/src/components/SettingsView.tsx': 'frontend/src/features/settings/SettingsView.tsx',
    'frontend/src/components/AnalysisView.tsx': 'frontend/src/features/analysis/AnalysisView.tsx',
    'frontend/src/components/ChartEditModal.tsx': 'frontend/src/features/analysis/ChartEditModal.tsx',
    'frontend/src/components/TrackMapCanvas.tsx': 'frontend/src/features/analysis/TrackMapCanvas.tsx',
    'frontend/src/components/CustomChannelEditor.tsx': 'frontend/src/features/analysis/CustomChannelEditor.tsx',
    'frontend/src/components/DynamicChartGrid.tsx': 'frontend/src/features/analysis/DynamicChartGrid.tsx'
}

for src, dst in moves.items():
    if os.path.exists(src):
        shutil.move(src, dst)
        print(f"Moved {src} to {dst}")

# 3. Update paths in the moved files
moved_files = list(moves.values())
for file in moved_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace '../' with '../../' for context, hooks, utils
        content = re.sub(r'from \'\.\./(context|hooks|utils)', r"from '../../\1", content)
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

# 4. Update App.tsx
app_ts = 'frontend/src/App.tsx'
with open(app_ts, 'r', encoding='utf-8') as f:
    app_content = f.read()

app_content = app_content.replace("'./components/SettingsView'", "'./features/settings/SettingsView'")
app_content = app_content.replace("'./components/ThemeView'", "'./features/theme/ThemeView'")

with open(app_ts, 'w', encoding='utf-8') as f:
    f.write(app_content)

# 5. Update TelemetryView.tsx
tel_ts = 'frontend/src/features/telemetry/TelemetryView.tsx'
with open(tel_ts, 'r', encoding='utf-8') as f:
    tel_content = f.read()

tel_content = tel_content.replace("'../../components/DragTestView'", "'../drag_test/DragTestView'")
tel_content = tel_content.replace("'../../components/AnalysisView'", "'../analysis/AnalysisView'")

with open(tel_ts, 'w', encoding='utf-8') as f:
    f.write(tel_content)

print("Migration completed.")
