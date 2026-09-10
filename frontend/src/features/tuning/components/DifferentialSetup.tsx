import type { ChassisTuningResult, Drivetrain } from '../../../utils/tuningMath';
import { TuningValuesCard } from './TuningValuesCard';

export function DifferentialSetup({ diff, drivetrain }: { diff: ChassisTuningResult['diff']; drivetrain: Drivetrain }) {
  const rows: [string, string][] = [];
  if (drivetrain !== 'RWD') rows.push(['Front Accel Lock', `${diff.accelF}%`], ['Front Decel Lock', `${diff.decelF}%`]);
  if (drivetrain !== 'FWD') rows.push(['Rear Accel Lock', `${diff.accelR}%`], ['Rear Decel Lock', `${diff.decelR}%`]);
  if (drivetrain === 'AWD') rows.push(['AWD Center Rear Split', `${diff.centerRear}%`]);
  return <TuningValuesCard title="Differential & Torque Split" rows={rows} />;
}
