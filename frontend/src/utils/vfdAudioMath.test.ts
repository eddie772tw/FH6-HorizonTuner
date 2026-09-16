import { describe, it, expect } from 'vitest';
import {
  groupFrequencyBins,
  updatePeakHold,
  formatMediaMarquee,
  sanitizeVFDText,
} from './vfdAudioMath';

describe('vfdAudioMath', () => {
  describe('groupFrequencyBins', () => {
    it('returns empty band array of specified length when input is empty', () => {
      const result = groupFrequencyBins([], 16);
      expect(result).toHaveLength(16);
      expect(result.every((v) => v === 0)).toBe(true);
    });

    it('correctly maps 255 byte values to 1.0 normalized values', () => {
      const mockFFT = new Uint8Array(64).fill(255);
      const result = groupFrequencyBins(mockFFT, 8);
      expect(result).toHaveLength(8);
      expect(result.every((v) => v === 1.0)).toBe(true);
    });

    it('handles mixed frequency distribution properly', () => {
      const mockFFT = new Uint8Array(64).fill(0);
      mockFFT[0] = 255;
      mockFFT[1] = 128;
      const result = groupFrequencyBins(mockFFT, 8);
      expect(result[0]).toBeGreaterThan(0);
      expect(result.every((v) => v >= 0 && v <= 1.0)).toBe(true);
    });
  });

  describe('updatePeakHold', () => {
    it('initializes peak hold state if previous state is null', () => {
      const bands = [0.5, 0.8, 0.2];
      const state = updatePeakHold(bands, null, 10, 0.05);
      expect(state.values).toEqual([0.5, 0.8, 0.2]);
      expect(state.holdTicks).toEqual([10, 10, 10]);
    });

    it('sets holdTicks to 0 for initial zero band values and holdDurationTicks for positive values', () => {
      const bands = [0.0, 0.5, 0.0, 1.0];
      const state = updatePeakHold(bands, null, 10, 0.04);
      expect(state.values).toEqual([0.0, 0.5, 0.0, 1.0]);
      expect(state.holdTicks).toEqual([0, 10, 0, 10]);
    });

    it('re-initializes state if prevState band count does not match current bands count', () => {
      const prevState = { values: [0.8, 0.8], holdTicks: [5, 5] };
      const currentBands = [0.5, 0.6, 0.7];
      const state = updatePeakHold(currentBands, prevState, 8, 0.04);
      expect(state.values).toEqual([0.5, 0.6, 0.7]);
      expect(state.holdTicks).toEqual([8, 8, 8]);
    });

    it('updates value and resets hold ticks when current band value rises above previous peak', () => {
      const prevState = { values: [0.5, 0.3], holdTicks: [2, 0] };
      const currentBands = [0.8, 0.6];
      const state = updatePeakHold(currentBands, prevState, 10, 0.04);
      expect(state.values).toEqual([0.8, 0.6]);
      expect(state.holdTicks).toEqual([10, 10]);
    });

    it('holds peak value when current band drops', () => {
      const initialBands = [0.9, 0.9, 0.9];
      let state = updatePeakHold(initialBands, null, 5, 0.1);

      // Current drops to 0.2
      const lowerBands = [0.2, 0.2, 0.2];
      state = updatePeakHold(lowerBands, state, 5, 0.1);

      expect(state.values).toEqual([0.9, 0.9, 0.9]);
      expect(state.holdTicks).toEqual([4, 4, 4]);
    });

    it('decays peak value after hold ticks expire', () => {
      const initialBands = [1.0];
      let state = updatePeakHold(initialBands, null, 1, 0.2); // 1 tick hold

      // Tick 1: drops to 0.0 -> hold ticks become 0
      state = updatePeakHold([0.0], state, 1, 0.2);
      expect(state.values[0]).toBe(1.0);
      expect(state.holdTicks[0]).toBe(0);

      // Tick 2: drops to 0.0 -> decay by 0.2 to 0.8
      state = updatePeakHold([0.0], state, 1, 0.2);
      expect(state.values[0]).toBeCloseTo(0.8);
    });

    it('clamps decay at current band value if decayed value falls below current band', () => {
      const prevState = { values: [0.3], holdTicks: [0] };
      const currentBands = [0.25];
      // Decay step 0.1 would bring 0.3 -> 0.2, but current band is 0.25, so max(0.25, 0.20) = 0.25
      const state = updatePeakHold(currentBands, prevState, 10, 0.1);
      expect(state.values[0]).toBe(0.25);
      expect(state.holdTicks[0]).toBe(0);
    });

    it('uses default parameters (holdDurationTicks = 10, decayStep = 0.04) when omitted', () => {
      // 1. Initial state with defaults
      let state = updatePeakHold([0.5]);
      expect(state.values).toEqual([0.5]);
      expect(state.holdTicks).toEqual([10]);

      // 2. Step 10 times to deplete hold ticks from 10 to 0
      for (let i = 0; i < 10; i++) {
        state = updatePeakHold([0.1], state);
      }
      expect(state.values[0]).toBe(0.5);
      expect(state.holdTicks[0]).toBe(0);

      // 3. 11th step decays by default decayStep (0.04)
      state = updatePeakHold([0.1], state);
      expect(state.values[0]).toBeCloseTo(0.46);
      expect(state.holdTicks[0]).toBe(0);
    });
  });

  describe('sanitizeVFDText', () => {
    it('replaces & with AND and strips unsupported symbols', () => {
      const input = 'GOMAD! & MONSTER - Under Control!';
      const res = sanitizeVFDText(input);
      expect(res).toBe('GOMAD AND MONSTER - UNDER CONTROL');
    });

    it('converts text to uppercase and normalizes spaces', () => {
      const input = '  random   song  name  ';
      expect(sanitizeVFDText(input)).toBe('RANDOM SONG NAME');
    });

    it('safely handles non-string, null, and numeric inputs without throwing', () => {
      expect(sanitizeVFDText(null)).toBe('');
      expect(sanitizeVFDText(undefined)).toBe('');
      expect(sanitizeVFDText(12345)).toBe('12345');
      expect(sanitizeVFDText({ song: 'test' })).toBe('OBJECT OBJECT');
    });

    it('normalizes accented characters and strips CJK/Emoji characters safely', () => {
      const input = 'Café Pokémon - 晴天 (Sunny Day) 😄';
      const res = sanitizeVFDText(input);
      expect(res).toBe('CAFE POKEMON - SUNNY DAY');
    });
  });

  describe('formatMediaMarquee', () => {
    it('returns default station text if title and artist are empty', () => {
      expect(formatMediaMarquee()).toContain('TANTRON - TURBO FIRE');
    });

    it('formats artist and title properly without trailing branding', () => {
      const res = formatMediaMarquee('Nightcall', 'Kavinsky');
      expect(res).toBe('KAVINSKY - NIGHTCALL');
    });

    it('truncates text if exceeding max length', () => {
      const longTitle = 'Very Long Song Title '.repeat(5);
      const res = formatMediaMarquee(longTitle, 'Artist', 20);
      expect(res).toHaveLength(20);
    });

    it('handles non-ASCII titles cleanly without crashing', () => {
      const res = formatMediaMarquee('晴天', '周杰倫');
      expect(res).toBe('TANTRON - TURBO FIRE /// MADE BY CROSXOVER');
    });
  });
});

