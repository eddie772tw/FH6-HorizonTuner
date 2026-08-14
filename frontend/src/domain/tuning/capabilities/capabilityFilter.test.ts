import { describe, it, expect } from 'vitest';
import { filterCapabilityKeys } from './capabilityFilter';
import { DEFAULT_CAPABILITY_CONTRACT, TuningCapabilityContract } from './TuningCapabilityContract';

describe('filterCapabilityKeys', () => {
  it('should categorize keys correctly when all requested are unlocked', () => {
    const contract: TuningCapabilityContract = {
      ...DEFAULT_CAPABILITY_CONTRACT,
      spring: true,
      damping: true,
    };
    
    const result = filterCapabilityKeys(contract, ['spring', 'damping']);
    expect(result.unlocked).toEqual(['spring', 'damping']);
    expect(result.locked).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('should categorize keys correctly when all requested are locked', () => {
    const contract: TuningCapabilityContract = {
      ...DEFAULT_CAPABILITY_CONTRACT,
      spring: false,
      damping: false,
    };
    
    const result = filterCapabilityKeys(contract, ['spring', 'damping']);
    expect(result.unlocked).toEqual([]);
    expect(result.locked).toEqual(['spring', 'damping']);
    expect(result.unknown).toEqual([]);
  });

  it('should categorize mixed keys correctly', () => {
    const contract: TuningCapabilityContract = {
      ...DEFAULT_CAPABILITY_CONTRACT,
      spring: true,
      damping: false,
    };
    
    const result = filterCapabilityKeys(contract, ['spring', 'damping']);
    expect(result.unlocked).toEqual(['spring']);
    expect(result.locked).toEqual(['damping']);
    expect(result.unknown).toEqual([]);
  });

  it('should categorize missing or non-boolean keys as unknown', () => {
    const contract: TuningCapabilityContract = {
      ...DEFAULT_CAPABILITY_CONTRACT,
      spring: true,
    };
    
    const result = filterCapabilityKeys(contract, ['spring', 'non_existent_key', 'schemaVersion']);
    expect(result.unlocked).toEqual(['spring']);
    expect(result.locked).toEqual([]);
    expect(result.unknown).toEqual(['non_existent_key', 'schemaVersion']);
  });
});
