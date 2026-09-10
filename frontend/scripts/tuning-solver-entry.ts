// Packaged runner, bundled from the same source functions as the UI.
import { solveTuningRequest } from '../src/domain/tuning/solverService';

try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(JSON.stringify(solveTuningRequest(JSON.parse(input))));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
