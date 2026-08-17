import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAppBuildInfo,
  formatBuildInfoText,
  getRemoteReleaseComparison,
  RemoteCompareResult,
  AppBuildInfo,
} from './buildInfoService';

describe('buildInfoService', () => {
  describe('formatBuildInfoText', () => {
    it('formats official release build with tag correctly without post- prefix', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: 'v1.5.0',
        isDirty: false,
        isReleaseBuild: true,
        buildTime: '2026-08-17T12:00:00Z',
      };
      expect(formatBuildInfoText(info)).toBe('main (v1.5.0)');
    });

    it('formats local clean branch with commit hash', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'feat/ota-updater',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      expect(formatBuildInfoText(info)).toBe('feat/ota-updater (a1b2c3d)');
    });

    it('formats local dirty workspace with post- prefix', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: true,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      expect(formatBuildInfoText(info)).toBe('main (post-a1b2c3d)');
    });

    it('formats local dirty workspace on a tag with post- prefix', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: 'v1.5.0',
        isDirty: true,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      expect(formatBuildInfoText(info)).toBe('main (post-v1.5.0)');
    });

    it('appends remote ahead status string correctly', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      const compare: RemoteCompareResult = {
        latestTag: 'v1.4.0',
        status: 'ahead',
        ahead_by: 3,
      };
      expect(formatBuildInfoText(info, compare)).toBe(
        'main (a1b2c3d) (ahead of v1.4.0 by 3 commits)'
      );
    });

    it('appends remote behind status string correctly', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      const compare: RemoteCompareResult = {
        latestTag: 'v1.6.0',
        status: 'behind',
        behind_by: 2,
      };
      expect(formatBuildInfoText(info, compare)).toBe('main (a1b2c3d) (behind v1.6.0)');
    });

    it('replaces text with clean latestTag when identical and not dirty', () => {
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      const compare: RemoteCompareResult = {
        latestTag: 'v1.5.0',
        status: 'identical',
      };
      expect(formatBuildInfoText(info, compare)).toBe('main (v1.5.0)');
    });

    it('returns empty string if branch and commit are unknown', () => {
      const info: AppBuildInfo = {
        version: '1.0.0',
        gitCommit: 'unknown',
        gitBranch: 'unknown',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      expect(formatBuildInfoText(info)).toBe('');
    });
  });

  describe('getRemoteReleaseComparison', () => {
    let mockSessionStorage: Record<string, string> = {};

    beforeEach(() => {
      mockSessionStorage = {};
      vi.stubGlobal('sessionStorage', {
        getItem: vi.fn((key: string) => mockSessionStorage[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          mockSessionStorage[key] = val;
        }),
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns null immediately when not on main branch', async () => {
      const info: AppBuildInfo = {
        version: '1.0.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'feat/test',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      const result = await getRemoteReleaseComparison('test/repo', info);
      expect(result).toBeNull();
    });

    it('fetches comparison and caches result in sessionStorage', async () => {
      const fetchSpy = vi.fn();
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ tag_name: 'v1.4.0' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ahead', ahead_by: 2 }),
        });
      vi.stubGlobal('fetch', fetchSpy);

      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };

      const result = await getRemoteReleaseComparison('test/repo', info);
      expect(result).toEqual({
        latestTag: 'v1.4.0',
        status: 'ahead',
        ahead_by: 2,
        behind_by: undefined,
      });

      // Verify cached in sessionStorage
      expect(sessionStorage.setItem).toHaveBeenCalled();
      const cached = JSON.parse(mockSessionStorage['fh6_release_compare_cache']);
      expect(cached.data.latestTag).toBe('v1.4.0');

      // Second call should read from cache without calling fetch again
      fetchSpy.mockClear();
      const cachedResult = await getRemoteReleaseComparison('test/repo', info);
      expect(cachedResult).toEqual(result);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('gracefully returns null if fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const info: AppBuildInfo = {
        version: '1.5.0',
        gitCommit: 'a1b2c3d',
        gitBranch: 'main',
        releaseTag: null,
        isDirty: false,
        isReleaseBuild: false,
        buildTime: '2026-08-17T12:00:00Z',
      };
      const result = await getRemoteReleaseComparison('test/repo', info);
      expect(result).toBeNull();
    });
  });
});
