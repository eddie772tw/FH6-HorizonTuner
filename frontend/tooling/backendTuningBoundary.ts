import path from 'node:path';
import type { Plugin } from 'vite';

// Cover both the retired locations and the isolated characterization tree.
const normalized = (id: string) => id.replaceAll('\\', '/').split('?')[0];
const retiredModules = [
  ...['tuningMath', 'tuningMath_dev', 'tuningDiagnosis'].map(name => `utils/${name}`),
  ...['tuningMeasurement', 'engineCalculation', 'engineMeasurementArchive', 'measurementTuningProfile',
    'tireEvidence', 'workflowSnapshot', 'legacyWorkflowReadiness'].map(name => `features/tuning/${name}`),
  ...['contracts', 'constants', 'validation', 'ev/measurement', 'ev/solver', 'ev/profile'].map(name => `domain/tuning/${name}`),
];
function isFrozen(id: string): boolean {
  const clean = normalized(id);
  if (clean.includes('/test-reference/tuning/')) return true;
  const source = clean.split('/src/')[1] ?? '';
  return retiredModules.some(name => source === name || source.startsWith(name + '.')) ||
    ['chassis', 'gearing', 'tires', 'profiles', 'diagnosis'].some(name => source.startsWith(`domain/tuning/${name}/`));
}

/** Reject dependencies before transforms/tree shaking can erase an unused import. */
export function backendTuningBoundary(): Plugin {
  return {
    name: 'backend-tuning-boundary',
    enforce: 'pre',
    async resolveId(source, importer) {
      const check = (id: string) => {
        if (isFrozen(id)) {
          this.error(`Production tuning must consume Rust results: ${importer ?? '<entry>'} -> ${id}`);
        }
      };
      check(source.startsWith('.') && importer ? path.resolve(path.dirname(importer), source) : source);
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved) check(resolved.id);
      return resolved;
    },
    async transform(code, id) {
      if (!/\.[cm]?[jt]sx?$/.test(normalized(id)) || normalized(id).includes('/node_modules/')) return;
      const ast = this.parse(code, { lang: id.split('?')[0].endsWith('tsx') ? 'tsx' : /\.ts(?:\?|$)/.test(id) ? 'ts' : 'jsx' });
      if (normalized(id).endsWith('/src/domain/tuning/types.ts')) {
        for (const statement of ast.body as any[]) {
          const declaration = statement.declaration ?? statement;
          const pure = ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'EmptyStatement'].includes(declaration.type) ||
            (statement.type === 'ImportDeclaration' && statement.importKind === 'type') ||
            (statement.type.startsWith('Export') && statement.exportKind === 'type' && !statement.declaration);
          if (!pure) this.error(`Tuning contracts must contain only types: ${id}`);
        }
      }
      const sources: string[] = [];
      // Rolldown's parser includes TS import/export kinds before type erasure.
      const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
          const typeOnly = node.importKind === 'type' || node.exportKind === 'type' ||
            (node.specifiers?.length > 0 && node.specifiers.every((s: any) => s.importKind === 'type' || s.exportKind === 'type'));
          if (!typeOnly) sources.push(node.source.value);
        }
        if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') sources.push(node.source.value);
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') visit(value);
        }
      };
      visit(ast);
      for (const source of sources) {
        const resolved = await this.resolve(source, id);
        if (resolved && isFrozen(resolved.id)) {
          this.error(`Production tuning must consume Rust results: ${id} -> ${resolved.id}`);
        }
      }
    },
  };
}
