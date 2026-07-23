import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const tauriConfPath = path.join(rootDir, 'frontend/src-tauri/tauri.conf.json');
const gitIgnorePath = path.join(rootDir, '.gitignore');
const pkgIgnorePath = path.join(rootDir, '.pkgignore');

console.log('[INFO] Verifying resource packaging configuration (Single Source of Truth & .pkgignore Spec)...');

// 1. Read tauri.conf.json to get bundle.resources whitelist
const packagedDirs = new Set(['frontend']);
const packagedFiles = new Set(['car_database.json']);

if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    const resources = tauriConf?.bundle?.resources || [];
    for (const res of resources) {
      const cleanPath = res.replace(/^(\.\.\/)+/, '').replace(/\/\*$/, '');
      const parts = cleanPath.split('/');
      if (parts[0]) {
        packagedDirs.add(parts[0]);
      }
    }
  } catch (e) {
    console.error('[ERROR] Failed to parse tauri.conf.json:', e);
    process.exit(1);
  }
}

// 2. Read .gitignore (Base Blacklist) and .pkgignore (Packaging Controls with ! Negation support)
const ignoredDirs = new Set(['.git', '.vscode', '.idea']);

function parseIgnoreFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const isNegation = trimmed.startsWith('!');
    if (isNegation) {
      trimmed = trimmed.substring(1).trim();
    }

    trimmed = trimmed.replace(/\/$/, '').replace(/^\//, '');
    const parts = trimmed.split('/');
    const folderName = parts[0];

    if (folderName) {
      if (isNegation) {
        // Negation (!path): Force include / package this folder
        packagedDirs.add(folderName);
        ignoredDirs.delete(folderName);
      } else {
        // Exclude (path): Add to ignore list
        ignoredDirs.add(folderName);
      }
    }
  }
}

// Parse .gitignore first, then .pkgignore (allowing .pkgignore to override with !)
parseIgnoreFile(gitIgnorePath);
parseIgnoreFile(pkgIgnorePath);

// 3. Scan root directory folders
const entries = fs.readdirSync(rootDir, { withFileTypes: true });
const unregistered = [];

for (const entry of entries) {
  if (entry.isDirectory()) {
    const name = entry.name;
    if (!packagedDirs.has(name) && !ignoredDirs.has(name)) {
      unregistered.push(name);
    }
  }
}

if (unregistered.length > 0) {
  console.error('\n[ERROR] Unregistered resource directories found in project root:');
  for (const folder of unregistered) {
    console.error(`  - ${folder}`);
  }
  console.error('\nPlease register them in tauri.conf.json bundle.resources or ignore/force-include them in .pkgignore.');
  process.exit(1);
}

console.log('[SUCCESS] All resource directories are correctly registered in tauri.conf.json or controlled by .gitignore / .pkgignore.');
