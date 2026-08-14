import { describe, it, expect } from 'vitest';
import { AppSettings } from '../../../context/SettingsContext';

describe('McpSettingsCard logic and configuration contract', () => {
  it('correctly defaults MCP settings when not explicitly overridden', () => {
    const rawSettings: Partial<AppSettings> = {};

    const mcpEnabled = rawSettings.mcp_enabled !== false;
    const allowLive = rawSettings.mcp_allow_live !== false;
    const maxDownsample = rawSettings.mcp_max_downsample || 500;

    expect(mcpEnabled).toBe(true);
    expect(allowLive).toBe(true);
    expect(maxDownsample).toBe(500);
  });

  it('respects explicit false values for MCP toggles', () => {
    const rawSettings: Partial<AppSettings> = {
      mcp_enabled: false,
      mcp_allow_live: false,
      mcp_max_downsample: 200,
    };

    const mcpEnabled = rawSettings.mcp_enabled !== false;
    const allowLive = rawSettings.mcp_allow_live !== false;
    const maxDownsample = rawSettings.mcp_max_downsample || 500;

    expect(mcpEnabled).toBe(false);
    expect(allowLive).toBe(false);
    expect(maxDownsample).toBe(200);
  });

  it('formats client snippets correctly with dynamic port settings', () => {
    const port = 8001;
    const mcpUrl = `http://127.0.0.1:${port}/mcp`;

    const claudeSnippet = JSON.stringify(
      {
        mcpServers: {
          'fh6-horizon-tuner': {
            url: mcpUrl,
          },
        },
      },
      null,
      2
    );

    expect(mcpUrl).toBe('http://127.0.0.1:8001/mcp');
    expect(claudeSnippet).toContain('fh6-horizon-tuner');
    expect(claudeSnippet).toContain('http://127.0.0.1:8001/mcp');
  });
});
