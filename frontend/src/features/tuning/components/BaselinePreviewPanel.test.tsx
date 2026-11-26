// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BaselinePreviewPanel } from './BaselinePreviewPanel';

vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (value: string) => value,
  convertSpringRate: (value: number) => ({ value: value * 2, label: 'lbs/in' }),
}) }));

it('displays the Rust baseline values and differences without editable controls', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BaselinePreviewPanel preview={{
      schemaVersion: 'tuning-baseline-preview/v1', modelVersion: 'synthetic', goal: 'Rally',
      stiffness: 'neutral', balance: 'neutral', canApply: true, missingInputs: [],
      affectedFields: ['spring.front'],
      fields: [{ key: 'spring.front', current: 50, recommended: 60, delta: 10, unit: 'kgf/mm', reason: null, status: 'available' }],
    }} />));
    expect(host.textContent).toContain('Rally');
    expect(host.textContent).toContain('20 lbs/in');
    expect(host.querySelector('button, input, select')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
