import { cpSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
// The portable Tauri release serves this complete directory from the embedded
// sidecar. Copy it only for an explicit static web-HUD build, otherwise the
// same assets would be embedded in the release twice.
const hudSource = resolve(scriptDirectory, '../../hud_overlay');
const hudDestination = resolve(scriptDirectory, '../dist/hud');

cpSync(hudSource, hudDestination, {
  recursive: true,
  // HUD tests run from the frontend Vitest entry point but must never be
  // included in the static files copied into a production artifact.
  filter: (source) => basename(source) !== 'tests',
});
