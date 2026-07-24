import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api';

describe('API Service', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  const setupMock = (ok: boolean, responseData: any = {}) => {
    mockFetch.mockResolvedValue({
      ok,
      json: async () => responseData,
    });
  };

  it('fetchSettings should succeed', async () => {
    setupMock(true, { theme: 'dark' });
    const data = await api.fetchSettings();
    expect(mockFetch).toHaveBeenCalledWith('/api/settings');
    expect(data).toEqual({ theme: 'dark' });
  });

  it('fetchSettings should throw on error', async () => {
    setupMock(false);
    await expect(api.fetchSettings()).rejects.toThrow('Failed to fetch settings');
  });

  it('updateSettings should succeed', async () => {
    setupMock(true, { success: true });
    const data = await api.updateSettings({ theme: 'light' });
    expect(mockFetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ theme: 'light' }),
    }));
    expect(data).toEqual({ success: true });
  });

  it('updateSettings should throw on error', async () => {
    setupMock(false);
    await expect(api.updateSettings({})).rejects.toThrow('Failed to update settings');
  });

  it('fetchOverlayConfig should succeed', async () => {
    setupMock(true, { hudStyle: 'simple' });
    const data = await api.fetchOverlayConfig();
    expect(data.hudStyle).toBe('simple');
  });

  it('saveOverlayConfig should succeed', async () => {
    setupMock(true, { msg: 'saved' });
    const data = await api.saveOverlayConfig({ hudStyle: 'advanced' });
    expect(mockFetch).toHaveBeenCalledWith('/api/overlay/config', expect.objectContaining({ method: 'POST' }));
    expect(data.msg).toBe('saved');
  });

  it('fetchCarDatabase should succeed', async () => {
    setupMock(true, { '123': { name: 'Car 1' } });
    const data = await api.fetchCarDatabase();
    expect(data['123'].name).toBe('Car 1');
  });

  it('fetchAnalysisSessions should succeed', async () => {
    setupMock(true, [{ session_id: 'a1' }]);
    const data = await api.fetchAnalysisSessions();
    expect(data[0].session_id).toBe('a1');
  });

  it('fetchDragStatus should succeed', async () => {
    setupMock(true, { status: 'idle' });
    const data = await api.fetchDragStatus();
    expect(data.status).toBe('idle');
  });

  it('prepareDragTest should succeed', async () => {
    setupMock(true, { status: 'waiting' });
    const data = await api.prepareDragTest();
    expect(data.status).toBe('waiting');
  });

  it('cancelDragTest should succeed', async () => {
    setupMock(true, { status: 'idle' });
    const data = await api.cancelDragTest();
    expect(data.status).toBe('idle');
  });
});
