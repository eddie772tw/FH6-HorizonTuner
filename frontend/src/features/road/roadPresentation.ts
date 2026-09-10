export function parseGameTime(text: string): number | null {
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text.trim())) return null;
  const parts = text.trim().split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some(value => value >= 60)) return null;
  const seconds = parts.reduce((sum, part) => sum * 60 + part, 0);
  return seconds > 0 && seconds <= 86400 ? seconds : null;
}
export const roadConclusions: Record<string, string> = {
  'provisional-keep': 'Candidate was faster this time; provisionally keep B or revisit A.',
  'candidate-slower': 'Candidate was slower this time; returning to A is available.',
  'difference-insufficient': 'No useful time difference is established. Keep A.',
  'tradeoff': 'Faster time and increased local slip were observed. Review the tradeoff.',
  'insufficient-data': 'The runs are not ready for a setting conclusion.',
};
export const roadReasons: Record<string, string> = {
  'finish-time-unknown': 'Confirm the full-event time from the game result screen.',
  'recording-start-incomplete': 'Start recording before starting the same Road event.',
  'recording-finish-incomplete': 'Record through the event finish and confirm its time.',
  'thermal-start-different': 'Revisit A with a similar starting thermal state.',
  'thermal-start-unknown': 'Collect starting tire temperatures from all four wheels.',
  'route-insufficient': 'Record position data over the same complete event.',
  'route-different-or-incomplete': 'Repeat the same Road route and event format.',
  'telemetry-gaps': 'Repeat the run with continuous telemetry.',
  'recording-incomplete': 'Resolve the recording interruption before comparing.',
  'driving-conditions-insufficient': 'Repeat the event with comparable speed and controls; local evidence is insufficient.',
  'repetition-route-incompatible': 'One repeated event follows a different or incomplete route. Review that run.',
  'repetition-thermal-incompatible': 'One repeated event starts in a different or unknown thermal state.',
};
export function reasonText(reason: string): string {
  if (roadReasons[reason]) return roadReasons[reason];
  if (/^(otherSettings|tires|conditions|driverAssists)-/.test(reason)) return 'Confirm unchanged settings, tires, conditions and driver assists for the next run.';
  if (reason.startsWith('incident-')) return 'Confirm whether the event included an incident.';
  return 'Review the saved run details before repeating the same event.';
}
