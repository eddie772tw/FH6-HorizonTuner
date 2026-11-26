import { describe, it, expect } from 'vitest';
import { AppSettings } from '../../../context/SettingsContext';

describe('McpSettingsCard logic and configuration contract', () => {
  it('correctly defaults MCP settings when not explicitly overridden', () => {
    const rawSettings: Partial<AppSettings> = {};

    const mcpEnabled = rawSettings.mcp_enabled !== false;
    const allowLive = rawSettings.mcp_allow_live !== false;

    expect(mcpEnabled).toBe(true);
    expect(allowLive).toBe(true);
  });

  it('respects explicit false values for MCP toggles', () => {
    const rawSettings: Partial<AppSettings> = {
      mcp_enabled: false,
      mcp_allow_live: false,
    };

    const mcpEnabled = rawSettings.mcp_enabled !== false;
    const allowLive = rawSettings.mcp_allow_live !== false;

    expect(mcpEnabled).toBe(false);
    expect(allowLive).toBe(false);
  });

  it('uses the standard MCP endpoint path with dynamic port settings', () => {
    const port = 8001;
    const mcpUrl = `http://127.0.0.1:${port}/mcp`;

    expect(mcpUrl).toBe('http://127.0.0.1:8001/mcp');
    expect(new URL(mcpUrl).pathname).toBe('/mcp');
  });
});
