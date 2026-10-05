import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backendTuningBoundary } from './backendTuningBoundary';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(path.join(os.tmpdir(), 'fh6-boundary-'))) throw new Error('Unexpected test root');
    await fs.rm(root, { recursive: true, force: true });
  }
});
async function compile(entry: string, extra: Record<string, string> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fh6-boundary-'));
  roots.push(root);
  const files = {
    'src/entry.ts': entry,
    'src/domain/tuning/types.ts': 'export interface Result { value: number }',
    'test-reference/tuning/model.ts': 'export const solve = () => 42;',
    ...extra,
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  return build({ configFile: false, root, logLevel: 'silent', plugins: [backendTuningBoundary()],
    build: { write: false, rolldownOptions: { input: path.join(root, 'src/entry.ts') } } });
}
describe('Rust tuning production boundary using actual Vite builds', () => {
  it.each([
    ['unused direct import', "import { solve } from '../test-reference/tuning/model'; console.log('app');", {}],
    ['indirect re-export', "import './bridge';", {'src/bridge.ts': "export { solve } from '../test-reference/tuning/model';"}],
    ['unused dynamic import', "function unused() { return import('../test-reference/tuning/model'); } console.log('app');", {}],
    ['retired location', "import { solve } from './utils/tuningMath'; console.log('app');", {'src/utils/tuningMath.ts': 'export const solve = () => 42;'}],
  ])('rejects %s before tree shaking', async (_name, entry, extra) => {
    await expect(compile(entry as string, extra as Record<string, string>)).rejects.toThrow(/Production tuning must consume Rust results:.* -> /s);
  });
  it('allows a formal type-only contract and backend result rendering', async () => {
    await expect(compile("import type { Result } from './domain/tuning/types'; const render = (r: Result) => String(r.value); console.log(render({value: 42}));")).resolves.toBeDefined();
  });
  it('rejects executable defaults added to the formal type contract', async () => {
    await expect(compile("import { defaultRatio } from './domain/tuning/types'; console.log(defaultRatio);", {
      'src/domain/tuning/types.ts': 'export const defaultRatio = 4.1;',
    })).rejects.toThrow('Tuning contracts must contain only types');
  });
});
