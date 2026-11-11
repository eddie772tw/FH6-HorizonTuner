import type { CarParams } from '../../context/CarParamsContext';
import type { CompanionCommand, CompanionSeason } from './companionProtocol';

/** Persist one immutable vehicle document before acknowledging or updating the visible draft. */
export async function saveCompanionDraft(
  command: CompanionCommand,
  profile: CarParams,
  save: (snapshot: CarParams) => Promise<void>,
  currentKey: () => string,
  apply: (profile: CarParams, goal: string, season: CompanionSeason) => void,
): Promise<void> {
  const goal = command.goal!;
  const season = command.season as CompanionSeason;
  const next = { ...profile, ...command.patch, tuningTarget: { goal, season } };
  await save(next);
  // Saving an old document must not clobber a newer desktop edit or vehicle selection.
  if (currentKey() === command.profileKey) apply(next, goal, season);
}
