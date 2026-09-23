import { useEffect, useRef, useState } from 'react';
import { useCarParams } from '../../context/CarParamsContext';
import { useTelemetry } from '../../hooks/useTelemetry';
import { backendFetch } from '../../services/backend';
import { calculateChassisTuning, calculateStaticTireAlignment } from '../../utils/tuningMath';
import { useTuneSession } from '../tuning/TuneSessionProvider';
import { calculateWizardMeasuredGearing } from '../tuning/measurementTuningProfile';
import { selectedEngineObservationMatchesLiveTelemetry } from '../tuning/tuneSessionController';
import { getWorkflowReadiness } from '../tuning/tuningWorkflow';
import { companionProfileKey, validateCompanionCommand, type CompanionAck, type CompanionCommand, type CompanionSnapshot, type CompanionSeason } from './companionProtocol';
import { companionUuid } from './companionUuid';

/** Mounted once outside workspaces so remote commands continue while viewing telemetry. */
export function CompanionHostBridge() {
  const car = useCarParams();
  const session = useTuneSession();
  const { data } = useTelemetry();
  const latest = useRef({ car, session, data });
  latest.current = { car, session, data };
  const [clientId] = useState(companionUuid);
  const completed = useRef(new Map<string, CompanionAck>());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const snapshot = (): CompanionSnapshot => {
      const { car: current, session: tune, data: frame } = latest.current;
      const profile = !current.isLoading && current.loadedCarId === current.carId ? tune.profile : null;
      const { goal, season, step } = tune.workflow;
      const prepared = selectedEngineObservationMatchesLiveTelemetry(current.carId, tune.engine.current, frame) ? tune.engine.current : null;
      const gearing = calculateWizardMeasuredGearing(goal, profile?.adjustability.gears || 6, profile, prepared ? {
        engineMaxRpm: prepared.engineMaxRpm!, peakPowerRpm: prepared.observedPeakPower!.rpm,
        peakTorqueRpm: prepared.observedPeakTorque!.rpm,
      } : null);
      return {
        carId: current.carId, carName: current.carName, profile,
        profileKey: companionProfileKey(current.carId, current.carParams, tune.identityGeneration),
        workflow: { goal, season, step },
        results: {
          chassis: profile ? calculateChassisTuning(goal, profile) : null,
          alignment: profile ? calculateStaticTireAlignment(goal, season, profile) : null,
          gearing,
        },
        engine: { phase: tune.engineMeasurement.phase, sampleCount: tune.engineMeasurement.sampleCount, state: tune.engineMeasurement.state },
        readiness: getWorkflowReadiness(Boolean(profile), profile, Boolean(gearing)),
      };
    };
    const apply = async (command: CompanionCommand) => {
      if (completed.current.has(command.id)) return;
      try {
        validateCompanionCommand(command, snapshot());
        const { car: current, session: tune } = latest.current;
        if (command.kind === 'profile') {
          const next = { ...current.carParams!, ...command.patch };
          // Remote edits share the desktop form's draft and explicit save lifecycle.
          // Applying synchronously avoids overwriting a concurrent desktop edit after I/O.
          current.setCarParams(next);
        } else if (command.kind === 'workflow') {
          if (command.goal !== undefined) tune.workflow.setGoal(command.goal);
          if (command.season !== undefined) tune.workflow.setSeason(command.season as CompanionSeason);
          if (command.step !== undefined) tune.workflow.setStep(command.step);
        } else {
          const measurement = tune.engineMeasurement;
          if (command.action === 'start') measurement.ensureStarted(true);
          if (command.action === 'restart') measurement.restart(true);
          if (command.action === 'pause_resume') measurement.pauseOrResume();
          if (command.action === 'finish') {
            if (!await tune.engine.complete(measurement.state, measurement.captureSnapshot())) {
              throw new Error('Engine measurement could not be saved for the current vehicle.');
            }
          }
        }
        completed.current.set(command.id, { id: command.id, status: 'applied' });
      } catch (error) {
        if (stopped) return;
        completed.current.set(command.id, { id: command.id, status: 'rejected', error: error instanceof Error ? error.message : 'Command failed' });
      }
      while (completed.current.size > 64) completed.current.delete(completed.current.keys().next().value!);
    };
    const tick = async () => {
      try {
        const response = await backendFetch('/api/companion/host', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ clientId, snapshot: snapshot(), acks: [...completed.current.values()] }),
        });
        if (!response.ok) throw new Error('Companion host exchange failed');
        const payload = await response.json() as { commands: CompanionCommand[] };
        if (stopped) return;
        // One per exchange lets React commit the resulting profile before checking the next command.
        const next = payload.commands.find(command => !completed.current.has(command.id));
        if (next) await apply(next);
      } catch { /* A failed exchange cannot acknowledge an action; the relay expires offline state. */ }
      finally { if (!stopped) timer = setTimeout(tick, 400); }
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [clientId]);
  return null;
}
