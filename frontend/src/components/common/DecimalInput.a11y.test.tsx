// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { DecimalInput } from './DecimalInput';

it('reverts edits on Escape, applies ARIA range attributes, and updates invalid state', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();

  function Harness() {
    const [val, setVal] = useState<number | undefined>(2.5);
    return (
      <DecimalInput
        id="test-input"
        value={val}
        min={1.0}
        max={4.0}
        precision={2}
        disabled={false}
        onChange={(next) => {
          setVal(next);
          onChange(next);
        }}
      />
    );
  }

  await act(async () => { root.render(<Harness />); });
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(input.getAttribute('aria-valuemin')).toBe('1');
  expect(input.getAttribute('aria-valuemax')).toBe('4');
  expect(input.getAttribute('aria-valuenow')).toBe('2.5');
  expect(input.getAttribute('aria-invalid')).toBeNull();

  // Focus and type out-of-range value
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '9.99');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe('9.99');
  expect(input.getAttribute('aria-invalid')).toBe('true');

  // Press Escape to cancel and revert
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(input.value).toBe('2.50');
  expect(input.getAttribute('aria-invalid')).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith(2.5);

  // Focusing and pressing Escape without editing should not fire onChange again
  onChange.mockClear();
  await act(async () => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(onChange).not.toHaveBeenCalled();

  // Test disabled state
  await act(async () => {
    root.render(<DecimalInput value={10} disabled={true} onChange={() => {}} />);
  });
  const disabledInput = host.querySelector<HTMLInputElement>('input')!;
  expect(disabledInput.getAttribute('aria-disabled')).toBe('true');
  expect(disabledInput.disabled).toBe(true);

  await act(async () => { root.unmount(); });
  host.remove();
});
