export interface AppBuildInfo {
  version: string;
  gitCommit: string;
  gitBranch: string;
  releaseTag: string | null;
  isDirty: boolean;
  isReleaseBuild: boolean;
  buildTime: string;
}

export interface RemoteCompareResult {
  latestTag: string;
  status: 'ahead' | 'behind' | 'identical' | 'diverged';
  ahead_by?: number;
  behind_by?: number;
}

interface CachePayload {
  timestamp: number;
  data: RemoteCompareResult;
}

const CACHE_KEY = 'fh6_release_compare_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get standard structured application build info.
 */
export function getAppBuildInfo(): AppBuildInfo {
  if (typeof __APP_BUILD_INFO__ !== 'undefined') {
    return __APP_BUILD_INFO__;
  }
  return {
    version: '1.0.0',
    gitCommit: 'unknown',
    gitBranch: 'unknown',
    releaseTag: null,
    isDirty: false,
    isReleaseBuild: false,
    buildTime: new Date().toISOString(),
  };
}

/**
 * Pure function to format the build information display string for Navigation / GUI.
 * Preserves 100% visual compatibility with legacy display patterns.
 */
export function formatBuildInfoText(
  info: AppBuildInfo = getAppBuildInfo(),
  compareResult?: RemoteCompareResult | null
): string {
  if (info.gitBranch === 'unknown' && info.gitCommit === 'unknown') {
    return '';
  }

  // Handle Release Tag vs Commit with Dirty Flag
  const targetIdentifier = info.releaseTag || info.gitCommit;
  const versionString = (!info.isReleaseBuild && info.isDirty)
    ? `post-${targetIdentifier}`
    : targetIdentifier;

  let baseText = `${info.gitBranch} (${versionString})`;

  // If remote comparison info is available
  if (compareResult) {
    if (compareResult.status === 'identical' && !info.isDirty) {
      return `${info.gitBranch} (${compareResult.latestTag})`;
    } else if (compareResult.status === 'ahead') {
      const aheadCount = compareResult.ahead_by ?? 0;
      baseText += ` (ahead of ${compareResult.latestTag} by ${aheadCount} commits)`;
    } else if (compareResult.status === 'behind') {
      baseText += ` (behind ${compareResult.latestTag})`;
    }
  }

  return baseText;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage) {
      return (globalThis as unknown as { sessionStorage: Storage }).sessionStorage;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

/**
 * Fetch GitHub release comparison with SessionStorage rate limit caching.
 */
export async function getRemoteReleaseComparison(
  repo: string = 'eddie772tw/FH6-HorizonTuner',
  info: AppBuildInfo = getAppBuildInfo()
): Promise<RemoteCompareResult | null> {
  // Only compare on main branch in dev/web environments
  if (info.gitBranch !== 'main' || info.gitCommit === 'unknown') {
    return null;
  }

  const storage = getSessionStorage();

  // 1. Check SessionStorage cache
  try {
    const rawCache = storage ? storage.getItem(CACHE_KEY) : null;

    if (rawCache) {
      const payload: CachePayload = JSON.parse(rawCache);
      if (Date.now() - payload.timestamp < CACHE_TTL_MS) {
        return payload.data;
      }
    }
  } catch {
    // Ignore cache parsing errors
  }

  // 2. Fetch from GitHub API
  try {
    const releasesRes = await fetch(`https://api.github.com/repos/${repo}/releases`);
    if (!releasesRes.ok) return null;

    const releases = await releasesRes.json();
    if (!Array.isArray(releases) || releases.length === 0) return null;

    const latestTag = releases[0].tag_name;
    const pureCommit = info.releaseTag || info.gitCommit;

    const compareRes = await fetch(
      `https://api.github.com/repos/${repo}/compare/${latestTag}...${pureCommit}`
    );
    if (!compareRes.ok) return null;

    const compareData = await compareRes.json();
    const result: RemoteCompareResult = {
      latestTag,
      status: compareData.status || 'identical',
      ahead_by: compareData.ahead_by,
      behind_by: compareData.behind_by,
    };

    // Save to SessionStorage cache
    try {
      if (storage) {
        const payload: CachePayload = {
          timestamp: Date.now(),
          data: result,
        };
        storage.setItem(CACHE_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignore cache storage errors
    }

    return result;
  } catch (err) {
    console.warn('[BuildInfoService] Failed to compare release with GitHub API:', err);
    return null;
  }
}
