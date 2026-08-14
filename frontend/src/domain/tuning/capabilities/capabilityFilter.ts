import { TuningCapabilityContract } from './TuningCapabilityContract';

export function filterCapabilityKeys(
  contract: TuningCapabilityContract,
  requestedKeys: string[]
): { unlocked: string[]; locked: string[]; unknown: string[] } {
  const unlocked: string[] = [];
  const locked: string[] = [];
  const unknown: string[] = [];

  for (const key of requestedKeys) {
    if (key in contract) {
      const val = (contract as any)[key];
      if (typeof val === 'boolean') {
        if (val) {
          unlocked.push(key);
        } else {
          locked.push(key);
        }
      } else {
        unknown.push(key);
      }
    } else {
      unknown.push(key);
    }
  }

  return { unlocked, locked, unknown };
}
