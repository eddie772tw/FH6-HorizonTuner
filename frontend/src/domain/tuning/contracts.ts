/**
 * Versioned capability contract for the controls exposed by a selected part.
 *
 * `unknown` is intentional: a range or step must not be invented until it is
 * captured from the game UI or supported by a reviewed community fixture.
 */

export type ContractUnknown = 'unknown';
export type TuneControlStep = number | 'snap' | ContractUnknown;
export type TuneControlNumber = number | ContractUnknown;
export type TuneControlSource = 'in_game_capture' | 'community' | 'default' | 'unknown';

export interface TuneControlSpec {
  section: string;
  field: string;
  unlocked: boolean;
  min: TuneControlNumber;
  max: TuneControlNumber;
  step: TuneControlStep;
  precision: number | ContractUnknown;
  unit: string;
  source: TuneControlSource;
  gameBuild?: string;
  installedPart?: string;
}

export interface UpgradeUnlockSpec {
  installedPart: string;
  capabilities: Record<string, boolean>;
  controls: TuneControlSpec[];
}

export interface TuningCapabilityContract {
  schemaVersion: 'tuning-capabilities/v1';
  game: 'forza-horizon-6';
  gameBuild: string | ContractUnknown;
  source: TuneControlSource;
  upgrades: UpgradeUnlockSpec[];
  controls: TuneControlSpec[];
}

export interface CapabilityCarInput {
  adjustability?: {
    gearbox?: string;
    gears?: number;
    suspension?: string;
    arb?: string;
    aero?: string;
    brakes?: string;
    diff?: string;
  };
  spring_front_min?: number;
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  height_front_min?: number;
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
  arb_front_min?: number;
  arb_front_max?: number;
  arb_rear_min?: number;
  arb_rear_max?: number;
}

const unknown = (): ContractUnknown => 'unknown';

function boundedControl(
  section: string,
  field: string,
  unlocked: boolean,
  min: number | undefined,
  max: number | undefined,
  unit: string,
  installedPart: string
): TuneControlSpec {
  const hasBounds = Number.isFinite(min) && Number.isFinite(max) && (min as number) <= (max as number);
  return {
    section,
    field,
    unlocked,
    min: hasBounds ? (min as number) : unknown(),
    max: hasBounds ? (max as number) : unknown(),
    step: unknown(),
    precision: unknown(),
    unit,
    source: hasBounds ? 'default' : 'unknown',
    installedPart
  };
}

function unknownControl(section: string, field: string, unlocked: boolean, unit: string, installedPart: string): TuneControlSpec {
  return {
    section,
    field,
    unlocked,
    min: unknown(),
    max: unknown(),
    step: unknown(),
    precision: unknown(),
    unit,
    source: 'unknown',
    installedPart
  };
}

export function createDefaultCapabilityContract(car: CapabilityCarInput): TuningCapabilityContract {
  const adjustability = car.adjustability ?? {};
  const suspension = adjustability.suspension ?? 'unknown';
  const arb = adjustability.arb ?? 'unknown';
  const gearbox = adjustability.gearbox ?? 'unknown';
  const aero = adjustability.aero ?? 'unknown';
  const brakes = adjustability.brakes ?? 'unknown';
  const diff = adjustability.diff ?? 'unknown';
  const suspensionUnlocked = suspension === 'Race' || (suspension !== 'Fixed' && suspension !== 'unknown');
  const arbUnlocked = arb === 'Adjustable';
  const gearboxUnlocked = gearbox === 'Full' || gearbox === 'FinalDrive';
  const fullGearboxUnlocked = gearbox === 'Full';
  const aeroUnlocked = aero === 'Adjustable' || aero === 'Front Only' || aero === 'Rear Only';
  const brakeUnlocked = brakes === 'Adjustable';
  const diffUnlocked = diff === 'Adjustable';
  const currentPart = `suspension:${suspension};arb:${arb};gearbox:${gearbox};aero:${aero};brakes:${brakes};diff:${diff}`;
  const controls: TuneControlSpec[] = [
    boundedControl('springs', 'front', suspensionUnlocked, car.spring_front_min, car.spring_front_max, 'kgf/mm', currentPart),
    boundedControl('springs', 'rear', suspensionUnlocked, car.spring_rear_min, car.spring_rear_max, 'kgf/mm', currentPart),
    boundedControl('rideHeight', 'front', suspensionUnlocked, car.height_front_min, car.height_front_max, 'cm', currentPart),
    boundedControl('rideHeight', 'rear', suspensionUnlocked, car.height_rear_min, car.height_rear_max, 'cm', currentPart),
    boundedControl('arb', 'front', arbUnlocked, car.arb_front_min, car.arb_front_max, 'game-value', currentPart),
    boundedControl('arb', 'rear', arbUnlocked, car.arb_rear_min, car.arb_rear_max, 'game-value', currentPart),
    unknownControl('damping', 'rebound', suspensionUnlocked, 'game-value', currentPart),
    unknownControl('damping', 'bump', suspensionUnlocked, 'game-value', currentPart),
    unknownControl('gearing', 'finalDrive', gearboxUnlocked, 'ratio', currentPart),
    unknownControl('gearing', 'gears', fullGearboxUnlocked && Number.isFinite(adjustability.gears), 'ratio', currentPart),
    unknownControl('aero', 'front', aeroUnlocked && aero !== 'Rear Only', 'game-value', currentPart),
    unknownControl('aero', 'rear', aeroUnlocked && aero !== 'Front Only', 'game-value', currentPart),
    unknownControl('brakes', 'balance', brakeUnlocked, '%', currentPart),
    unknownControl('diff', 'frontAccel', diffUnlocked, '%', currentPart),
    unknownControl('diff', 'frontDecel', diffUnlocked, '%', currentPart),
    unknownControl('diff', 'rearAccel', diffUnlocked, '%', currentPart),
    unknownControl('diff', 'rearDecel', diffUnlocked, '%', currentPart),
    unknownControl('diff', 'centerToRear', diffUnlocked, '%', currentPart)
  ];
  const upgrade: UpgradeUnlockSpec = {
    installedPart: currentPart,
    capabilities: {
      suspension: suspensionUnlocked,
      arb: arbUnlocked,
      gearbox: gearboxUnlocked,
      fullGearbox: fullGearboxUnlocked,
      aero: aeroUnlocked,
      brakes: brakeUnlocked,
      differential: diffUnlocked
    },
    controls
  };
  return {
    schemaVersion: 'tuning-capabilities/v1',
    game: 'forza-horizon-6',
    gameBuild: 'unknown',
    source: 'default',
    upgrades: [upgrade],
    controls
  };
}
