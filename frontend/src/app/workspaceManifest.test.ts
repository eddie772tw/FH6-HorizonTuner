import { describe, expect, it } from 'vitest';
import { getAppCapabilities, getWorkspaces, permitsIntent, resolveWorkspace, type AppVariant } from './workspaceManifest';

describe('workspace capabilities', () => {
  it('keeps Full workflows while rejecting stale HUD navigation on LAN builds', () => {
    const runtime = { hudOverlay: false };
    expect(getWorkspaces('full', runtime).map(item => item.id)).toEqual(['live', 'tune', 'sessions']);
    expect(resolveWorkspace('full', 'hud', runtime)).toBe('live');
    expect(getAppCapabilities('full', runtime).tuning).toBe(true);
  });
  it('projects Full and Lite navigation from the same capabilities', () => {
    expect(getWorkspaces('full').map(item => item.id)).toEqual(['live', 'tune', 'sessions', 'hud']);
    expect(getWorkspaces('lite').map(item => item.id)).toEqual(['live', 'hud']);
    expect(getAppCapabilities('full').launchTest).toBe(true);
    expect(getAppCapabilities('lite').launchTest).toBe(false);
    expect(getAppCapabilities('lite').developerTuning).toBe(false);
  });

  it('falls back safely for stale or disabled workspace choices', () => {
    for (const variant of ['full', 'lite'] as const) {
      for (const stale of [null, undefined, '', 'settings', 'telemetry', {}, 2]) {
        expect(resolveWorkspace(variant, stale)).toBe('live');
      }
    }
    expect(resolveWorkspace('lite', 'tune')).toBe('live');
    expect(resolveWorkspace('lite', 'sessions')).toBe('live');
    expect(resolveWorkspace('full', 'sessions')).toBe('sessions');
  });

  it('rejects forbidden intents rather than mounting hidden Full workspaces in Lite', () => {
    for (const session of [{ kind: 'latest-analysis' }, { kind: 'analysis', filename: 'saved.json' },
      { kind: 'road', workflowId: 'workflow-1' }] as const) {
      expect(permitsIntent('lite', { kind: 'session', session })).toBe(false);
      expect(permitsIntent('full', { kind: 'session', session })).toBe(true);
    }
    expect(permitsIntent('lite', { kind: 'workspace', workspace: 'tune' })).toBe(false);
    expect(permitsIntent('lite', { kind: 'workspace', workspace: 'hud' })).toBe(true);
  });

  it.each<AppVariant>(['full', 'lite'])('keeps app surfaces available in %s', variant => {
    for (const surface of ['settings', 'appearance', 'diagnostics', 'companion', 'mcp', 'about'] as const) {
      expect(permitsIntent(variant, { kind: 'surface', surface })).toBe(true);
    }
  });
});
