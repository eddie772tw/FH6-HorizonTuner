// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HudTextInput } from './panels/HudTextInput';

it('keeps spaces in a shared config input draft and commits only after blur or Enter', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount);
  const save = vi.fn();
  try {
    await act(() => root.render(createElement(HudTextInput, { id: 'description', value: 'Boost', onCommit: save })));
    const input = mount.querySelector('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    input.focus();
    for (const value of ['Mapped', 'Mapped ', 'Mapped power']) {
      await act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(input.value).toBe(value);
      expect(save).not.toHaveBeenCalled();
    }
    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(save).toHaveBeenCalledWith('Mapped power');
    save.mockClear();
    input.focus();
    await act(() => { setter.call(input, '  Tire temperature  '); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(() => input.blur());
    expect(save).toHaveBeenCalledWith('Tire temperature');
  } finally {
    await act(() => root.unmount());
    mount.remove();
    delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  }
});
