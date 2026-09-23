import type { CompanionSnapshot } from './companionProtocol';

const n = (value: number | undefined, digits = 1) => value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
function Stat({ label, value, unit = '' }: { label: string; value: string; unit?: string }) { return <div><span className="companion-stat-label">{label}</span><strong>{value}{unit && ` ${unit}`}</strong></div>; }

export function ChassisResults({ result }: { result: CompanionSnapshot['results']['chassis'] }) {
  return <article id="companion-chassis" className="companion-panel companion-result-card"><h3>Chassis</h3>{result ? <div className="companion-result-list"><Stat label="Front spring" value={n(result.springs.front)} unit="kgf/mm" /><Stat label="Rear spring" value={n(result.springs.rear)} unit="kgf/mm" /><Stat label="Ride height F/R" value={`${n(result.springs.heightF)} / ${n(result.springs.heightR)}`} unit="cm" /><Stat label="Damping rebound F/R" value={`${n(result.damping.reboundF)} / ${n(result.damping.reboundR)}`} /><Stat label="Damping bump F/R" value={`${n(result.damping.bumpF)} / ${n(result.damping.bumpR)}`} /><Stat label="ARB F/R" value={`${n(result.arb.front)} / ${n(result.arb.rear)}`} /><Stat label="Diff accel F/R" value={`${n(result.diff.accelF)} / ${n(result.diff.accelR)}`} unit="%" /><Stat label="Diff decel F/R" value={`${n(result.diff.decelF)} / ${n(result.diff.decelR)}`} unit="%" /><Stat label="AWD center rear" value={n(result.diff.centerRear)} unit="%" /></div> : <span className="text-body-secondary">No result yet</span>}</article>;
}

export function AlignmentResults({ result }: { result: CompanionSnapshot['results']['alignment'] }) {
  return <article id="companion-alignment" className="companion-panel companion-result-card"><h3>Alignment</h3>{result ? <div className="companion-result-list"><Stat label="Cold pressure F/R" value={`${n(result.pcF)} / ${n(result.pcR)}`} unit="psi" /><Stat label="Target hot pressure" value={n(result.targetPhot)} unit="psi" /><Stat label="Camber F/R" value={`${n(result.camber.front)} / ${n(result.camber.rear)}`} unit="deg" /><Stat label="Toe F/R" value={`${result.toe.front} / ${result.toe.rear}`} /><Stat label="Caster" value={n(result.caster)} unit="deg" /></div> : <span className="text-body-secondary">No result yet</span>}</article>;
}

export function GearingResults({ result, measurementPhase }: { result: CompanionSnapshot['results']['gearing']; measurementPhase: string }) {
  return <article id="companion-gearing" className="companion-panel companion-result-card"><h3>Gearing</h3>{result ? <div className="companion-result-list"><Stat label="Final drive" value={n(result.finalDrive, 3)} unit="ratio" />{result.gears.map((ratio, index) => <Stat key={index} label={`Gear ${index + 1}`} value={n(ratio, 3)} unit="ratio" />)}</div> : <p className="text-body-secondary mb-0">Complete a valid engine measurement to calculate gear ratios. Current phase: {measurementPhase}.</p>}</article>;
}
