import { describe, expect, it, vi } from 'vitest';
import { CalculationSequence, mechanicalRequestKey, requestMechanical } from './mechanicalCalculation';
import { backendFetch } from '../../services/backend';
import type { TuningCarParams } from '../../utils/tuningMath';
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
const profile: TuningCarParams = { weight: 1350, weight_distribution: 54, drivetrain: 'AWD', maxHp: 300 };
describe('authoritative mechanical boundary', () => {
  it('includes every unsaved geometry edit, goal, season and car identity', () => {
    const base = mechanicalRequestKey('1', 'Road', 'Summer', profile);
    for (const draft of [{ ...profile, spring_front_min: .2 }, { ...profile, rearTireAspect: 30 }, { ...profile, height_front_min: 11 }]) {
      expect(mechanicalRequestKey('1', 'Road', 'Summer', draft)).not.toBe(base);
    }
    expect(mechanicalRequestKey('2', 'Road', 'Summer', profile)).not.toBe(base);
    expect(mechanicalRequestKey('1', 'Drag', 'Summer', profile)).not.toBe(base);
    expect(mechanicalRequestKey('1', 'Road', 'Winter', profile)).not.toBe(base);
  });
  it('rejects reordered responses including returning to the original car', () => {
    const sequence = new CalculationSequence();
    const first = sequence.next(); sequence.next(); const third = sequence.next();
    expect(sequence.current(first)).toBe(false);
    expect(sequence.current(third)).toBe(true);
    sequence.next(); expect(sequence.current(third)).toBe(false);
  });
  it('forwards the draft and abort signal; failure never falls back to a local solver', async () => {
    const controller = new AbortController();
    const input = { schemaVersion: 'tuning-mechanical/v1' as const, goal: 'Road', season: 'Summer' as const, profile };
    vi.mocked(backendFetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(requestMechanical(input, controller.signal)).rejects.toThrow('503');
    expect(backendFetch).toHaveBeenLastCalledWith('/api/tuning/mechanical', expect.objectContaining({ body: JSON.stringify(input), signal: controller.signal }));
    vi.mocked(backendFetch).mockResolvedValueOnce(new Response('{"schemaVersion":"unknown"}'));
    await expect(requestMechanical(input, controller.signal)).rejects.toThrow('Unsupported');
  });
});
