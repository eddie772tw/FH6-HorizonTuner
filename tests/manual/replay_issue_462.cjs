// Read-only historical characterization. Run from the repository root with Node 24+.
// Does not generate or overwrite fixtures; requires the recorded Git commits locally.
const { execFileSync } = require('node:child_process');
const { stripTypeScriptTypes } = require('node:module');
const fixture = require('../fixtures/aego_road_report_462.json');
const assert = require('node:assert/strict');
(async () => {
  for (const ref of ['cd96d86', 'ca195c7']) {
    const source = execFileSync('git', ['show', `${ref}:frontend/src/utils/tuningMath.ts`], { encoding: 'utf8' });
    const model = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
    for (const scenario of fixture.cases) {
      const { carParams, numGears, maxRpm } = scenario.inputs;
      const result = model.calculateAEGOGearing('Road', numGears, carParams, maxRpm);
      assert.deepEqual(result, scenario.historical[ref]);
      console.log(JSON.stringify({ ref, scenario: scenario.id, result }));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
