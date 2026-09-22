import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateChassisTuning,
  calculateAEGOGearing,
  resolveAeroDownforce,
  TuningCarParams,
  GearingSecondaryCorrection
} from './tuningMath';

interface TuningFixtureCase {
  id: string;
  description: string;
  raceGoal: string;
  carParams: TuningCarParams;
  maxRpm: number;
  numGears: number;
  secondaryCorrection?: GearingSecondaryCorrection;
}

interface TuningGoldenFixtureOutput {
  version: string;
  createdAt: string;
  cases: Array<{
    id: string;
    description: string;
    raceGoal: string;
    inputs: {
      carParams: TuningCarParams;
      maxRpm: number;
      numGears: number;
      secondaryCorrection?: GearingSecondaryCorrection;
    };
    expected: {
      aeroDownforce: { front: number; rear: number };
      chassis: ReturnType<typeof calculateChassisTuning>;
      gearing: ReturnType<typeof calculateAEGOGearing>;
    };
  }>;
}

const FIXTURE_PATH = path.resolve(__dirname, '../../../tests/fixtures/tuning_golden_fixtures.json');

const TEST_CASES: TuningFixtureCase[] = [
  {
    id: 'road_awd_standard',
    description: 'Road AWD with 1/65 ARB meta and moderate downforce',
    raceGoal: 'Road',
    carParams: {
      weight: 1450,
      weight_distribution: 54,
      drivetrain: 'AWD',
      maxHp: 450,
      maxTorque: 500,
      maxHpRpm: 6800,
      maxTorqueRpm: 4800,
      aero_downforce_front: 80,
      aero_downforce_rear: 120,
      spring_front_min: 15,
      spring_front_max: 130,
      spring_rear_min: 15,
      spring_rear_max: 130,
      height_front_min: 10,
      height_front_max: 22,
      height_rear_min: 10,
      height_rear_max: 22,
    },
    maxRpm: 7800,
    numGears: 6,
  },
  {
    id: 'road_rwd_sports',
    description: 'Road RWD balanced 50:50 sports coupe',
    raceGoal: 'Road',
    carParams: {
      weight: 1300,
      weight_distribution: 50,
      drivetrain: 'RWD',
      maxHp: 380,
      maxTorque: 420,
      maxHpRpm: 7000,
      maxTorqueRpm: 5000,
      aero_downforce_front: 40,
      aero_downforce_rear: 60,
    },
    maxRpm: 8000,
    numGears: 6,
  },
  {
    id: 'road_fwd_hot_hatch',
    description: 'Road FWD front-heavy hot hatch with roll support',
    raceGoal: 'Road',
    carParams: {
      weight: 1250,
      weight_distribution: 62,
      drivetrain: 'FWD',
      maxHp: 280,
      maxTorque: 360,
      maxHpRpm: 6200,
      maxTorqueRpm: 3500,
      aero_downforce_front: 30,
      aero_downforce_rear: 20,
    },
    maxRpm: 7200,
    numGears: 6,
  },
  {
    id: 'drift_rwd_standard',
    description: 'Drift RWD high angle power oversteer setup',
    raceGoal: 'Drift',
    carParams: {
      weight: 1200,
      weight_distribution: 53,
      drivetrain: 'RWD',
      maxHp: 550,
      maxTorque: 650,
      maxHpRpm: 6800,
      maxTorqueRpm: 4500,
    },
    maxRpm: 7500,
    numGears: 4,
  },
  {
    id: 'drift_awd_high_power',
    description: 'Drift AWD gymkhana setup with rear power bias',
    raceGoal: 'Drift',
    carParams: {
      weight: 1350,
      weight_distribution: 52,
      drivetrain: 'AWD',
      maxHp: 800,
      maxTorque: 900,
      maxHpRpm: 7200,
      maxTorqueRpm: 5200,
    },
    maxRpm: 8500,
    numGears: 6,
  },
  {
    id: 'drift_fwd_handbrake',
    description: 'Drift FWD weight transfer and handbrake setup',
    raceGoal: 'Drift',
    carParams: {
      weight: 1100,
      weight_distribution: 60,
      drivetrain: 'FWD',
      maxHp: 220,
      maxTorque: 260,
      maxHpRpm: 6500,
      maxTorqueRpm: 4200,
    },
    maxRpm: 7000,
    numGears: 5,
  },
  {
    id: 'rally_awd_mixed_surface',
    description: 'Rally AWD gravel & dirt compliance setup',
    raceGoal: 'Rally',
    carParams: {
      weight: 1280,
      weight_distribution: 52,
      drivetrain: 'AWD',
      rallyProfile: 'mixed-surface',
      maxHp: 350,
      maxTorque: 480,
      maxHpRpm: 6000,
      maxTorqueRpm: 3800,
    },
    maxRpm: 7000,
    numGears: 6,
  },
  {
    id: 'rally_awd_cross_country',
    description: 'Rally AWD cross-country big jumps setup with landing absorption',
    raceGoal: 'Rally',
    carParams: {
      weight: 1600,
      weight_distribution: 50,
      drivetrain: 'AWD',
      rallyProfile: 'cross-country',
      maxHp: 450,
      maxTorque: 580,
      maxHpRpm: 6200,
      maxTorqueRpm: 4000,
    },
    maxRpm: 7200,
    numGears: 6,
  },
  {
    id: 'rally_rwd_historic',
    description: 'Rally RWD classic rally car with compliant suspension',
    raceGoal: 'Rally',
    carParams: {
      weight: 1150,
      weight_distribution: 48,
      drivetrain: 'RWD',
      rallyProfile: 'mixed-surface',
      maxHp: 260,
      maxTorque: 300,
      maxHpRpm: 6800,
      maxTorqueRpm: 5000,
    },
    maxRpm: 7500,
    numGears: 5,
  },
  {
    id: 'drag_rwd_muscle',
    description: 'Drag RWD high torque launch with forward rake',
    raceGoal: 'Drag',
    carParams: {
      weight: 1550,
      weight_distribution: 55,
      drivetrain: 'RWD',
      maxHp: 750,
      maxTorque: 880,
      maxHpRpm: 6500,
      maxTorqueRpm: 4800,
    },
    maxRpm: 7200,
    numGears: 4,
  },
  {
    id: 'drag_awd_supercar',
    description: 'Drag AWD sub-9s quarter mile launch',
    raceGoal: 'Drag',
    carParams: {
      weight: 1650,
      weight_distribution: 43,
      drivetrain: 'AWD',
      maxHp: 1000,
      maxTorque: 1050,
      maxHpRpm: 8200,
      maxTorqueRpm: 6000,
    },
    maxRpm: 9000,
    numGears: 7,
  },
  {
    id: 'drag_fwd_compact',
    description: 'Drag FWD wheelie-prevention stiff rear launch',
    raceGoal: 'Drag',
    carParams: {
      weight: 1050,
      weight_distribution: 64,
      drivetrain: 'FWD',
      maxHp: 400,
      maxTorque: 460,
      maxHpRpm: 7000,
      maxTorqueRpm: 5200,
    },
    maxRpm: 8000,
    numGears: 4,
  },
  {
    id: 'aego_weak_engine_4speed',
    description: 'AEGO powerband gearing for low HP economy engine',
    raceGoal: 'Road',
    carParams: {
      weight: 2100,
      weight_distribution: 50,
      drivetrain: 'RWD',
      maxHp: 85,
      maxTorque: 120,
      maxHpRpm: 4200,
      maxTorqueRpm: 2400,
      rearTireWidth: 205,
      rearTireAspect: 65,
      rearTireRim: 15,
    },
    maxRpm: 5000,
    numGears: 4,
  },
  {
    id: 'aego_10speed_hypercar',
    description: 'AEGO 10-speed transmission for 1200HP hypercar',
    raceGoal: 'Road',
    carParams: {
      weight: 1400,
      weight_distribution: 45,
      drivetrain: 'AWD',
      maxHp: 1200,
      maxTorque: 1300,
      maxHpRpm: 8500,
      maxTorqueRpm: 6500,
      aeroEfficiency: 0.8,
    },
    maxRpm: 9500,
    numGears: 10,
  },
  {
    id: 'aego_secondary_correction_simulated',
    description: 'AEGO secondary correction with simulated top speed constraint',
    raceGoal: 'Road',
    carParams: {
      weight: 1400,
      weight_distribution: 50,
      drivetrain: 'RWD',
      maxHp: 500,
      maxTorque: 600,
      maxHpRpm: 7000,
      maxTorqueRpm: 5000,
    },
    maxRpm: 8000,
    numGears: 6,
    secondaryCorrection: {
      simulatedTopSpeed: 320,
    },
  },
  {
    id: 'aego_secondary_correction_softmax',
    description: 'AEGO secondary correction with soft max speed preview cap',
    raceGoal: 'Road',
    carParams: {
      weight: 1400,
      weight_distribution: 50,
      drivetrain: 'RWD',
      maxHp: 500,
      maxTorque: 600,
      maxHpRpm: 7000,
      maxTorqueRpm: 5000,
    },
    maxRpm: 8000,
    numGears: 6,
    secondaryCorrection: {
      softMaxSpeed: 280,
    },
  },
  {
    id: 'aero_auto_derivation',
    description: 'Automatic aerodynamic downforce derivation when inputs are 0',
    raceGoal: 'Road',
    carParams: {
      weight: 1400,
      weight_distribution: 52,
      drivetrain: 'RWD',
      aero_downforce_front: 0,
      aero_downforce_rear: 0,
    },
    maxRpm: 7500,
    numGears: 6,
  },
  {
    id: 'extreme_boundary_light_heavy',
    description: 'Extreme vehicle mass and weight bias clamping test',
    raceGoal: 'Road',
    carParams: {
      weight: 500,
      weight_distribution: 25,
      drivetrain: 'RWD',
      maxHp: 150,
      maxTorque: 180,
      maxHpRpm: 6000,
      maxTorqueRpm: 4000,
    },
    maxRpm: 7000,
    numGears: 6,
  },
];

function generateGoldenFixtures(): TuningGoldenFixtureOutput {
  return {
    version: '1.0.0',
    createdAt: '2026-09-23T00:00:00Z',
    cases: TEST_CASES.map((tc) => {
      const aeroDownforce = resolveAeroDownforce(tc.carParams);
      const chassis = calculateChassisTuning(tc.raceGoal, tc.carParams);
      const gearing = calculateAEGOGearing(
        tc.raceGoal,
        tc.numGears,
        tc.carParams,
        tc.maxRpm,
        tc.secondaryCorrection
      );
      return {
        id: tc.id,
        description: tc.description,
        raceGoal: tc.raceGoal,
        inputs: {
          carParams: tc.carParams,
          maxRpm: tc.maxRpm,
          numGears: tc.numGears,
          secondaryCorrection: tc.secondaryCorrection,
        },
        expected: {
          aeroDownforce,
          chassis,
          gearing,
        },
      };
    }),
  };
}

describe('Tuning Golden Fixtures Contract', () => {
  it('generates or matches tuning_golden_fixtures.json on disk', () => {
    const generated = generateGoldenFixtures();
    
    // Ensure target directory exists
    const dir = path.dirname(FIXTURE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(FIXTURE_PATH)) {
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(generated, null, 2) + '\n', 'utf-8');
    }

    const onDisk: TuningGoldenFixtureOutput = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    
    expect(onDisk.version).toBe('1.0.0');
    expect(onDisk.cases.length).toBe(TEST_CASES.length);

    for (const testCase of onDisk.cases) {
      const currentAero = resolveAeroDownforce(testCase.inputs.carParams);
      const currentChassis = calculateChassisTuning(testCase.raceGoal, testCase.inputs.carParams);
      const currentGearing = calculateAEGOGearing(
        testCase.raceGoal,
        testCase.inputs.numGears,
        testCase.inputs.carParams,
        testCase.inputs.maxRpm,
        testCase.inputs.secondaryCorrection
      );

      expect(currentAero).toEqual(testCase.expected.aeroDownforce);
      expect(currentChassis).toEqual(testCase.expected.chassis);
      expect(currentGearing).toEqual(testCase.expected.gearing);
    }
  });
});
