import { expect, it } from 'vitest';
import { tuningRows } from './tuningRows';

it('formats measured fields with units and localizes equipment while hiding transport metadata', () => {
  const labels: Record<string, string> = { 'spring.front': '前彈簧', Maximum: '最大值', No: '否', Unknown: '未知', Fixed: '不可調', Gearbox: '變速箱' };
  const rows = tuningRows({
    weight: 1224.699399, units: { weight: 'kg' }, spring_front_max: 24.97,
    isElectric: false, adjustability: { gearbox: 'Fixed' }, aeroBalance: null, aeroInputVersion: 'optional/v1',
    unexplained: { diagnostics: ['internal'] },
  }, { 'spring.front': { value: 15.2, unit: 'kgf/mm' } }, key => labels[key] ?? key);
  expect(rows).toEqual(expect.arrayContaining([
    { key: 'weight', label: 'Weight', observed: '1224.699 kg', recommended: '—' },
    { key: 'spring_front_max', label: '前彈簧 · 最大值', observed: '24.97 kgf/mm', recommended: '—' },
    { key: 'isElectric', label: 'Electric vehicle', observed: '否', recommended: '—' },
    { key: 'adjustability.gearbox', label: '變速箱', observed: '不可調', recommended: '—' },
    { key: 'aeroBalance', label: 'Aero balance', observed: '未知', recommended: '—' },
    { key: 'spring.front', label: '前彈簧', observed: '—', recommended: '15.2 kgf/mm' },
  ]));
  expect(rows).toHaveLength(6);
  expect(tuningRows({ weight: 2700, 'units.weight': 'lb', isElectric: 'false' }, {}, key => labels[key] ?? key))
    .toEqual([{ key: 'weight', label: 'Weight', observed: '2700 lb', recommended: '—' },
      { key: 'isElectric', label: 'Electric vehicle', observed: '否', recommended: '—' }]);
});
