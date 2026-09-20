import { describe, expect, it, vi } from 'vitest';
import {
  acceptHudAuthorMetadata,
  beginHudMetadataRequest,
  createHudMetadataState,
  loadHudAuthorMetadata,
  loadHudStylesMetadata,
  type HudMetadataTransport,
} from './hudMetadata';

describe('HUD metadata boundary', () => {
  it('loads style and author metadata through injectable IO', async () => {
    const transport: HudMetadataTransport = {
      fetchStyles: vi.fn().mockResolvedValue([
        { id: 'classic_jdm', source: 'builtin', urlPrefix: '/hud' },
      ]),
      fetchAuthor: vi.fn().mockResolvedValue({ author: 'FH6', description: 'Classic JDM' }),
    };

    await expect(loadHudStylesMetadata(transport, 'http://localhost')).resolves.toHaveLength(1);
    await expect(loadHudAuthorMetadata(transport, [], 'classic_jdm')).resolves.toEqual({
      author: 'FH6',
      description: 'Classic JDM',
    });
    expect(transport.fetchAuthor).toHaveBeenCalledWith('classic_jdm', '/hud', '');
  });

  it('ignores stale author responses by request id', () => {
    const initial = createHudMetadataState();
    const pending = beginHudMetadataRequest(initial);
    const newer = beginHudMetadataRequest(pending);
    const stale = acceptHudAuthorMetadata(newer, 1, 'vfd', {
      author: 'stale',
      description: 'stale',
    });
    const current = acceptHudAuthorMetadata(newer, 2, 'classic_jdm', {
      author: 'current',
      description: 'current',
    });

    expect(stale).toBe(newer);
    expect(current.currentAuthor?.author).toBe('current');
    expect(current.authorCache.classic_jdm?.description).toBe('current');
  });
});
