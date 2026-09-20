import type { RoadLive } from './roadTypes';

type LiveReadResult = { status: 'applied'; live: RoadLive } | { status: 'discarded' | 'failed' };

/** Polls and post-save reads share one ordering boundary. Writes remain independent. */
export function createRoadLiveReader(
  read: () => Promise<RoadLive>,
  accept: (live: RoadLive) => void,
  reject: (error: unknown) => void,
  isActive: () => boolean,
) {
  let revision = 0;
  return {
    invalidate() { revision += 1; },
    async refresh(): Promise<LiveReadResult> {
      const request = ++revision;
      try {
        const live = await read();
        if (!isActive() || request !== revision) return { status: 'discarded' };
        accept(live);
        return { status: 'applied', live };
      } catch (error) {
        if (!isActive() || request !== revision) return { status: 'discarded' };
        reject(error);
        return { status: 'failed' };
      }
    },
  };
}
