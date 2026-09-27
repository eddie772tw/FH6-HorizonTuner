import type { TuningMeasurementGuidance } from './tuningMeasurement';

export const guidanceText: Record<TuningMeasurementGuidance, string> = {
  collecting: 'Keep accelerating smoothly in one gear.',
  ready: 'Driving data is complete. You can stop the run and calculate when ready.',
  'telemetry-disconnected': 'Connect the game and enable Data Out to start receiving driving data.',
  'waiting-frame': 'Waiting for driving data from the game.',
  'car-mismatch': 'Return to the selected car before collecting data.',
  'identity-incomplete': 'Waiting for the game to report the car, class and performance index.',
  'identity-changed': 'The car or build changed. Restart collection with the current build.',
  'not-in-race': 'Return to driving in the game to continue collecting data.',
  'timestamp-stalled': 'Driving data stopped updating. Check Data Out and return to driving.',
  'timestamp-regressed': 'The driving session restarted. Restart collection to avoid mixing sessions.',
  'input-not-wide-open': 'On a clear straight, hold full throttle in one gear to record engine output.',
  'control-input-active': 'Release the brake, handbrake and clutch during the acceleration run.',
  'gear-not-forward': 'Select a forward gear and accelerate along a clear straight.',
  'gear-changing': 'Gear change detected. Hold the gear briefly while engine output settles.',
  'engine-rpm-invalid': 'Waiting for valid engine speed and engine limit from the game.',
  'output-unavailable': 'Waiting for valid power and torque telemetry.',
  'sampling-gap': 'Data was interrupted. Continue driving; the interruption is not counted.',
  'duration-insufficient': 'More clean acceleration data is needed. Repeat a smooth run if necessary.',
  'rpm-coverage-low': 'Low-engine-speed data is missing. Start the next run lower in the rev range.',
  'rpm-coverage-high': 'High-engine-speed data is missing. Hold the gear longer, approaching the engine limit.',
  'bins-insufficient': 'The middle of the rev range is incomplete. Accelerate smoothly through it.',
  'vehicle-not-moving': 'Start a rolling full-throttle run above 5 km/h. Launch transients are excluded from engine analysis.',
  'load-settling': 'Hold full throttle in the same gear for 500 ms while the moving sweep settles.',
};

