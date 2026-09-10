// Source-checkout runner: load current TS directly, without a stale generated formula copy.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let server;
try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false, envFile: false, logLevel: 'silent',
    server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true },
  });
  const { solveTuningRequest } = await server.ssrLoadModule('/src/domain/tuning/solverService.ts');
  process.stdout.write(JSON.stringify(solveTuningRequest(JSON.parse(input))));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await server?.close();
}
