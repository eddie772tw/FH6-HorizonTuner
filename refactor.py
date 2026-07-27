import re

with open('frontend/src/features/tuning/TuningView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace recharts import
content = re.sub(r"import \{ LineChart.*?from 'recharts';\n", '', content)

# Add component imports
import_str = '''import { SuspensionTuner } from './components/SuspensionTuner';
import { GearingTuner } from './components/GearingTuner';
import { DifferentialTuner } from './components/DifferentialTuner';
import { DiagnosisPanel } from './components/DiagnosisPanel';
import { DragTestSection } from './components/DragTestSection';
import { TuningSliderGrid } from './components/TuningSliderGrid';'''
content = re.sub(r"import \{ SuspensionTuner.*?from './components/DifferentialTuner';", import_str, content, flags=re.DOTALL)

# Replace Drag Test Section
idx_drag_start = content.find('{/* Optional Drag Optimization for SpeedZone */}')
idx_drag_end = content.find('{/* Load Saved Session Dropdown */}')
if idx_drag_start != -1 and idx_drag_end != -1:
    drag_replace = '''{/* Optional Drag Optimization for SpeedZone */}
            <DragTestSection 
              selectedRaceGoal={selectedRaceGoal}
              dragTestStatus={dragTestStatus}
              dragPointsCount={dragPointsCount}
              selectedDragSession={selectedDragSession}
              globalSavedSessions={globalSavedSessions}
              activeDragData={activeDragData}
              handleStartDragTest={handleStartDragTest}
              handleClearDragTest={handleClearDragTest}
              handleLoadDragSession={handleLoadDragSession}
              handleSaveDragSession={handleSaveDragSession}
              applyDragOptimizedGearing={applyDragOptimizedGearing}
            />

            '''
    content = content[:idx_drag_start] + drag_replace + content[idx_drag_end:]


# Replace Diagnosis Panel
idx_start = content.find('{!diagnosisReport ? (')
idx_end = content.find('          </div>\n        )}\n\n        {/* ================= STEP 5:')
if idx_start != -1 and idx_end != -1:
    diag_replace = '''<DiagnosisPanel 
              diagnosisReport={diagnosisReport} 
              telemetryPoints={telemetryPoints} 
            />\n'''
    content = content[:idx_start] + diag_replace + content[idx_end:]


# Replace Slider Grid
slider_start = content.find('{/* Sliders adjustment list */}')
slider_end = content.find('          </div>\n        )}\n\n      </div>')
if slider_start != -1 and slider_end != -1:
    slider_replace = '''{/* Sliders adjustment list */}
            <TuningSliderGrid 
              tuning={tuning} 
              carParams={carParams} 
              updateSection={updateSection} 
            />\n'''
    content = content[:slider_start] + slider_replace + content[slider_end:]

# Remove TuningSlider component
ts_start = content.find('const TuningSlider = React.memo(({label, value, min, max, unitType, section, field, step=0.1, baseline, disabled=false, isUnknown=false, updateSection, convertToUI, convertFromUI, getUnitLabel}: any) => {')
ts_end = content.find('});', ts_start) + 3
if ts_start != -1 and ts_end != -1:
    content = content[:ts_start] + content[ts_end:]

with open('frontend/src/features/tuning/TuningView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
